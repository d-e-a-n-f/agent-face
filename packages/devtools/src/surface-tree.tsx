"use client";

import type { AgentDiscoveredSurface } from "@agentface/runtime";
import type { ReactNode } from "react";
import { mergeStyles, styles } from "./styles.js";

interface SurfaceTreeProps {
  readonly surfaces: readonly AgentDiscoveredSurface[];
  readonly selectedInstanceId: string | null;
  readonly onSelect: (instanceId: string) => void;
}

/** The mounted surface instances as a parent/child tree. */
export function SurfaceTree(props: SurfaceTreeProps): ReactNode {
  const { surfaces, selectedInstanceId, onSelect } = props;
  const byId = new Map(
    surfaces.map((surface) => [surface.instance.instanceId, surface]),
  );
  const roots = surfaces.filter(
    (surface) =>
      surface.instance.parentInstanceId === undefined ||
      !byId.has(surface.instance.parentInstanceId),
  );

  function renderNode(
    surface: AgentDiscoveredSurface,
    depth: number,
  ): ReactNode {
    const { instance } = surface;
    const selected = instance.instanceId === selectedInstanceId;
    return (
      <div key={instance.instanceId}>
        <button
          type="button"
          style={mergeStyles(
            styles.treeNode,
            selected && styles.treeNodeSelected,
            { paddingLeft: 6 + depth * 14 },
          )}
          onClick={() => onSelect(instance.instanceId)}
          aria-pressed={selected}
        >
          <span style={styles.cardTitle}>{instance.face.id}</span>
          {instance.entity !== undefined ? (
            <span style={styles.muted}>
              {" "}
              {instance.entity.displayName ?? instance.entity.id}
            </span>
          ) : null}
          <span style={styles.muted}> rev {instance.revision}</span>
        </button>
        {instance.childInstanceIds.map((childId) => {
          const child = byId.get(childId);
          return child !== undefined ? renderNode(child, depth + 1) : null;
        })}
      </div>
    );
  }

  return (
    <section style={styles.section}>
      <h3 style={styles.sectionTitle}>Surfaces</h3>
      {roots.length === 0 ? (
        <p style={styles.muted}>No mounted surfaces.</p>
      ) : (
        roots.map((root) => renderNode(root, 0))
      )}
    </section>
  );
}
