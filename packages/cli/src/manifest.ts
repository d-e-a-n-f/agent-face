import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { AgentApplicationManifest } from "@agentface/core";
import { defineAgentApplication } from "@agentface/core";
import { createJiti } from "jiti";

const DEFAULT_CONFIG_FILES = [
  "agentface.config.ts",
  "agentface.config.mts",
  "agentface.config.js",
  "agentface.config.mjs",
];

/** Where {@link generateManifest} writes its output, relative to the root. */
export const MANIFEST_OUTPUT_PATH = ".agentface/manifest.json";

/**
 * Loads the application manifest from an `agentface.config.*` file (or an
 * explicit path). The module may export the manifest as `default`,
 * `manifest`, or `applicationManifest`. TypeScript configs load directly —
 * no build step required.
 */
export async function loadManifest(
  rootDir: string,
  explicitPath?: string,
): Promise<{ manifest: AgentApplicationManifest; sourcePath: string }> {
  const candidates =
    explicitPath !== undefined
      ? [explicitPath]
      : DEFAULT_CONFIG_FILES;
  const sourcePath = candidates
    .map((candidate) => resolve(rootDir, candidate))
    .find((candidate) => existsSync(candidate));
  if (sourcePath === undefined) {
    throw new Error(
      `No manifest config found. Create agentface.config.ts exporting defineAgentApplication({ ... }) (looked for: ${candidates.join(", ")}).`,
    );
  }
  const jiti = createJiti(join(rootDir, "noop.js"));
  const loaded = (await jiti.import(sourcePath)) as Record<string, unknown>;
  const candidate =
    loaded["applicationManifest"] ?? loaded["manifest"] ?? loaded["default"];
  if (candidate === undefined || candidate === null) {
    throw new Error(
      `${sourcePath} must export the manifest as default, "manifest", or "applicationManifest".`,
    );
  }
  // Re-validate: config files are hand-edited.
  const manifest = defineAgentApplication(
    candidate as AgentApplicationManifest,
  );
  return { manifest, sourcePath };
}

/**
 * Emits `.agentface/manifest.json` from the loaded config — the static
 * artefact consumed by tooling, docs generation, and coverage checks.
 */
export async function generateManifest(
  rootDir: string,
  explicitPath?: string,
): Promise<{ outputPath: string; manifest: AgentApplicationManifest }> {
  const { manifest } = await loadManifest(rootDir, explicitPath);
  const outputPath = resolve(rootDir, MANIFEST_OUTPUT_PATH);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { outputPath, manifest };
}
