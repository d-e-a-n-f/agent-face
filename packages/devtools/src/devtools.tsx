"use client";

import { useAgentContext } from "@agentface/react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { ActionRunner } from "./action-runner.js";
import { CoverageReport } from "./coverage.js";
import { ActionInspector, ResourceInspector } from "./inspector.js";
import { styles } from "./styles.js";
import { SurfaceTree } from "./surface-tree.js";
import { TraceViewer } from "./trace-viewer.js";
import {
  useDiscovery,
  useRuntimeVersion,
  useSurfaceSnapshot,
} from "./use-runtime-data.js";

/** Props for {@link AgentFaceDevTools}. */
export interface AgentFaceDevToolsProps {
  /** Whether the panel body starts expanded. Defaults to false. */
  readonly defaultOpen?: boolean;
}

let warnedInProduction = false;

/**
 * The embeddable AgentFace development panel: surface tree, resource and
 * action inspectors, a manual action runner (prepare → preview → confirm →
 * execute), and the runtime trace stream.
 *
 * Development-only: it warns when loaded in a production build and should be
 * excluded from production bundles. It never mutates application state except
 * through actions the developer explicitly runs.
 *
 * Must be rendered inside an `<AgentFaceProvider>`.
 *
 * @example
 * ```tsx
 * {process.env.NODE_ENV !== "production" ? <AgentFaceDevTools /> : null}
 * ```
 */
export function AgentFaceDevTools(props: AgentFaceDevToolsProps): ReactNode {
  const [open, setOpen] = useState(props.defaultOpen ?? false);
  const version = useRuntimeVersion();
  const discovery = useDiscovery(version);
  const { manifest } = useAgentContext();
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (process.env.NODE_ENV === "production" && !warnedInProduction) {
      warnedInProduction = true;
      console.warn(
        "AgentFaceDevTools is running in a production build. Exclude it from production bundles.",
      );
    }
  }, []);

  // Keep a valid selection as surfaces mount and unmount.
  const selectionValid = discovery.surfaces.some(
    (surface) => surface.instance.instanceId === selectedInstanceId,
  );
  const effectiveSelection = selectionValid
    ? selectedInstanceId
    : (discovery.surfaces[0]?.instance.instanceId ?? null);

  const snapshot = useSurfaceSnapshot(effectiveSelection, version);

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span style={styles.headerTitle}>AgentFace DevTools</span>
        <button
          type="button"
          style={styles.toggle}
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
        >
          {open ? "Close" : "Open"}
        </button>
      </div>
      {open ? (
        <div style={styles.body}>
          <div style={{ ...styles.column, maxWidth: 260 }}>
            <SurfaceTree
              surfaces={discovery.surfaces}
              selectedInstanceId={effectiveSelection}
              onSelect={setSelectedInstanceId}
            />
            {manifest !== undefined ? (
              <CoverageReport manifest={manifest} discovery={discovery} />
            ) : null}
            <TraceViewer version={version} />
          </div>
          <div style={styles.column}>
            {snapshot === null ? (
              <p style={styles.muted}>Select a surface to inspect it.</p>
            ) : (
              <>
                <ResourceInspector snapshot={snapshot} />
                <ActionInspector snapshot={snapshot} />
                <ActionRunner snapshot={snapshot} />
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
