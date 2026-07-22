"use client";

import type { AgentApplicationManifest } from "@agentface/core";
import type { AgentDiscoveryResult } from "@agentface/runtime";
import type { ReactNode } from "react";
import { styles } from "./styles.js";

interface CoverageFinding {
  readonly level: "ok" | "warn" | "fail";
  readonly text: string;
}

/**
 * Computes the agent-readiness report: the manifest (what the app declares)
 * diffed against live mounts (what actually exists right now), plus static
 * quality checks on the mounted capabilities. Exported for tests.
 */
export function computeCoverage(
  manifest: AgentApplicationManifest,
  discovery: AgentDiscoveryResult,
): { readonly score: number; readonly findings: readonly CoverageFinding[] } {
  const findings: CoverageFinding[] = [];
  const declaredFaces = new Set(
    manifest.routes.flatMap((route) => route.surfaces),
  );
  const mountedFaces = new Set(
    discovery.surfaces.map((surface) => surface.instance.face.id),
  );

  const routeCount = manifest.routes.length;
  const routesWithoutSurfaces = manifest.routes.filter(
    (route) => route.surfaces.length === 0,
  );
  findings.push({
    level: "ok",
    text: `${routeCount} route${routeCount === 1 ? "" : "s"} declared, ${declaredFaces.size} face(s), ${discovery.surfaces.length} currently mounted`,
  });
  if (routesWithoutSurfaces.length > 0) {
    findings.push({
      level: "fail",
      text: `${routesWithoutSurfaces.length} route(s) expose no surfaces: ${routesWithoutSurfaces
        .map((route) => route.path)
        .join(", ")}`,
    });
  }

  const undeclaredMounted = [...mountedFaces].filter(
    (faceId) => !declaredFaces.has(faceId) && faceId !== "app.navigation" && faceId !== "app.knowledge",
  );
  if (undeclaredMounted.length > 0) {
    findings.push({
      level: "warn",
      text: `Mounted but not in the manifest: ${undeclaredMounted.join(", ")}`,
    });
  }

  let previewMissing = 0;
  let confirmationMissing = 0;
  for (const surface of discovery.surfaces) {
    for (const action of surface.actions) {
      const sensitive =
        action.sensitivity === "confidential" ||
        action.sensitivity === "restricted";
      if (sensitive && !action.hasPreview) {
        previewMissing += 1;
      }
      if (sensitive && action.confirmationPolicy === "never") {
        confirmationMissing += 1;
      }
    }
  }
  if (previewMissing > 0) {
    findings.push({
      level: "warn",
      text: `${previewMissing} sensitive action(s) have no preview — the user confirms blind`,
    });
  }
  if (confirmationMissing > 0) {
    findings.push({
      level: "warn",
      text: `${confirmationMissing} sensitive action(s) declare no confirmation (policy may still confirm)`,
    });
  }

  const checks = [
    routesWithoutSurfaces.length === 0,
    undeclaredMounted.length === 0,
    previewMissing === 0,
    confirmationMissing === 0,
  ];
  const score = Math.round(
    (checks.filter(Boolean).length / checks.length) * 100,
  );
  return { score, findings };
}

const LEVEL_ICON = { ok: "✓", warn: "⚠", fail: "✕" } as const;
const LEVEL_COLOR = { ok: "#2e7d32", warn: "#b26a00", fail: "#c62828" } as const;

/** The "Agent readiness" section: manifest vs live mounts, scored. */
export function CoverageReport({
  manifest,
  discovery,
}: {
  readonly manifest: AgentApplicationManifest;
  readonly discovery: AgentDiscoveryResult;
}): ReactNode {
  const { score, findings } = computeCoverage(manifest, discovery);
  return (
    <section style={styles.section} data-testid="coverage-report">
      <h3 style={styles.sectionTitle}>Agent readiness: {score}%</h3>
      <ul style={{ margin: 0, paddingLeft: 4, listStyle: "none" }}>
        {findings.map((finding, index) => (
          <li
            key={index}
            style={{ color: LEVEL_COLOR[finding.level], fontSize: 11 }}
          >
            {LEVEL_ICON[finding.level]} {finding.text}
          </li>
        ))}
      </ul>
    </section>
  );
}
