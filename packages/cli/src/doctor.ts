import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { AgentApplicationManifest } from "@agentface/core";
import { loadManifest } from "./manifest.js";

/** One doctor finding. `fail` findings make the command exit non-zero. */
export interface DoctorFinding {
  readonly level: "ok" | "warn" | "fail";
  readonly check: string;
  readonly detail: string;
}

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const IGNORED_DIRS = new Set([
  "node_modules",
  ".next",
  "dist",
  "build",
  ".git",
  ".turbo",
]);

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIRS.has(entry)) {
      continue;
    }
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      yield* walk(full);
    } else if (SOURCE_EXTENSIONS.has(full.slice(full.lastIndexOf(".")))) {
      yield full;
    }
  }
}

function findAppDir(rootDir: string): string | undefined {
  for (const candidate of ["src/app", "app"]) {
    if (existsSync(resolve(rootDir, candidate))) {
      return resolve(rootDir, candidate);
    }
  }
  return undefined;
}

function routeToAppPath(routePath: string): string {
  if (routePath === "/") {
    return "page";
  }
  return `${routePath
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) =>
      segment.startsWith(":") ? `[${segment.slice(1)}]` : segment,
    )
    .join("/")}/page`;
}

/**
 * Static health checks over an AgentFace application. Heuristic by design
 * (regex-level, not type-level) — each finding says what it looked at, so
 * false positives are diagnosable. `fail` findings exit non-zero, making
 * `agentface doctor` CI-friendly.
 */
export async function runDoctor(rootDir: string): Promise<{
  readonly findings: readonly DoctorFinding[];
  readonly failed: boolean;
}> {
  const findings: DoctorFinding[] = [];
  const sources = new Map<string, string>();
  for (const file of walk(rootDir)) {
    sources.set(file, readFileSync(file, "utf8"));
  }
  const allSource = [...sources.values()].join("\n");

  // 1. The model endpoint exists and is authenticated.
  const routeEntry = [...sources.entries()].find(([path]) =>
    path.replace(/\\/g, "/").endsWith("api/agentface/route.ts"),
  );
  if (routeEntry === undefined) {
    findings.push({
      level: "warn",
      check: "model-endpoint",
      detail:
        "No app/api/agentface/route.ts found — the assistant widget needs a model endpoint (createAgentFaceRouteHandler).",
    });
  } else if (!routeEntry[1].includes("authorize")) {
    findings.push({
      level: "fail",
      check: "endpoint-auth",
      detail: `${routeEntry[0]} passes no authorize option. The endpoint is a model proxy: anyone who can POST consumes your provider account. Add authorize (and rateLimit).`,
    });
  } else {
    findings.push({
      level: "ok",
      check: "endpoint-auth",
      detail: "Model endpoint declares an authorize option.",
    });
  }

  // 2. A policy is configured and it is not the development preset.
  if (/policy[=:]\s*\{?\s*developmentPolicy\(\)/.test(allSource)) {
    findings.push({
      level: "warn",
      check: "policy",
      detail:
        "developmentPolicy() is in use — fine locally, but production should run standardUserPolicy() or a custom engine.",
    });
  } else if (!/policy[=:]/.test(allSource)) {
    findings.push({
      level: "warn",
      check: "policy",
      detail:
        "No policy prop found on AgentFaceApp/AgentFaceProvider — the runtime defaults to allow-all.",
    });
  } else {
    findings.push({
      level: "ok",
      check: "policy",
      detail: "A policy engine is configured.",
    });
  }

  // 3. Duplicate face ids across the app.
  const faceIds = [
    ...allSource.matchAll(/defineAgentFace\(\s*\{\s*[^}]*?id:\s*"([^"]+)"/gs),
    ...allSource.matchAll(/<AgentSurface\s+id="([^"]+)"/g),
  ].map((match) => match[1] ?? "");
  const duplicates = [
    ...faceIds.reduce((counts, id) => {
      counts.set(id, (counts.get(id) ?? 0) + 1);
      return counts;
    }, new Map<string, number>()),
  ]
    .filter(([, count]) => count > 1)
    .map(([id]) => id);
  if (duplicates.length > 0) {
    findings.push({
      level: "warn",
      check: "duplicate-face-ids",
      detail: `Face ids defined more than once: ${duplicates.join(", ")}. Reuse the same definition instead of re-declaring.`,
    });
  } else {
    findings.push({
      level: "ok",
      check: "duplicate-face-ids",
      detail: `${new Set(faceIds).size} distinct face id(s), no duplicates.`,
    });
  }

  // 4. Sensitive actions should declare confirmation and a preview.
  const actionBlocks =
    allSource.match(
      /(?:useAgentAction|defineAgentAction)\(\s*\{[\s\S]*?\n\s*\}\)/g,
    ) ?? [];
  let sensitiveWithoutConfirmation = 0;
  let sensitiveWithoutPreview = 0;
  for (const block of actionBlocks) {
    const sensitive = /sensitivity:\s*"(?:confidential|restricted)"/.test(
      block,
    );
    if (!sensitive) {
      continue;
    }
    if (!block.includes("confirmation")) {
      sensitiveWithoutConfirmation += 1;
    }
    if (!block.includes("preview")) {
      sensitiveWithoutPreview += 1;
    }
  }
  if (sensitiveWithoutConfirmation > 0 || sensitiveWithoutPreview > 0) {
    findings.push({
      level: "warn",
      check: "sensitive-actions",
      detail: `${sensitiveWithoutConfirmation} sensitive action(s) without a confirmation rule, ${sensitiveWithoutPreview} without a preview (heuristic scan of ${actionBlocks.length} action blocks).`,
    });
  } else {
    findings.push({
      level: "ok",
      check: "sensitive-actions",
      detail: `Scanned ${actionBlocks.length} action block(s); sensitive ones declare confirmation and previews.`,
    });
  }

  // 5. Manifest routes should map to real app-router pages.
  let manifest: AgentApplicationManifest | undefined;
  try {
    manifest = (await loadManifest(rootDir)).manifest;
  } catch {
    findings.push({
      level: "warn",
      check: "manifest",
      detail:
        "No loadable agentface.config.* manifest — app-wide planning, the application-map resource, and coverage reporting need one.",
    });
  }
  if (manifest !== undefined) {
    const appDir = findAppDir(rootDir);
    if (appDir === undefined) {
      findings.push({
        level: "warn",
        check: "manifest-routes",
        detail: "No app/ directory found to verify manifest routes against.",
      });
    } else {
      const missing = manifest.routes.filter((route) => {
        const base = join(appDir, routeToAppPath(route.path));
        return !existsSync(`${base}.tsx`) && !existsSync(`${base}.ts`);
      });
      if (missing.length > 0) {
        findings.push({
          level: "fail",
          check: "manifest-routes",
          detail: `Manifest routes with no matching page file: ${missing
            .map((route) => route.path)
            .join(", ")}`,
        });
      } else {
        findings.push({
          level: "ok",
          check: "manifest-routes",
          detail: `All ${manifest.routes.length} manifest route(s) map to page files.`,
        });
      }
    }
  }

  return {
    findings,
    failed: findings.some((finding) => finding.level === "fail"),
  };
}
