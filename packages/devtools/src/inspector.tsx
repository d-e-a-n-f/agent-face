"use client";

import { isAgentFaceError } from "@agentface/core";
import type { AgentPolicyDecision } from "@agentface/runtime";
import type { AgentSurfaceSnapshot } from "@agentface/runtime";
import { useAgentRuntime } from "@agentface/react";
import type { ReactNode } from "react";
import { useState } from "react";
import { mergeStyles, styles } from "./styles.js";

function DecisionBadge({
  decision,
}: {
  readonly decision: AgentPolicyDecision;
}): ReactNode {
  const style =
    decision.effect === "allow"
      ? styles.badgeOk
      : decision.effect === "confirm"
        ? styles.badgeWarn
        : styles.badgeErr;
  return (
    <span
      style={mergeStyles(styles.badge, style)}
      title={decision.effect === "allow" ? undefined : decision.reason}
    >
      {decision.effect}
    </span>
  );
}

interface ResourceInspectorProps {
  readonly snapshot: AgentSurfaceSnapshot;
}

/** Resources of the selected surface, with on-demand value reads. */
export function ResourceInspector(props: ResourceInspectorProps): ReactNode {
  const runtime = useAgentRuntime();
  const { snapshot } = props;
  const [values, setValues] = useState<Readonly<Record<string, string>>>({});

  async function readValue(resourceId: string): Promise<void> {
    const key = `${snapshot.instance.instanceId}:${resourceId}`;
    try {
      const result = await runtime.readResource({
        instanceId: snapshot.instance.instanceId,
        resourceId,
      });
      setValues((current) => ({
        ...current,
        [key]: JSON.stringify(
          { value: result.value, revision: result.revision },
          null,
          2,
        ),
      }));
    } catch (caught) {
      setValues((current) => ({
        ...current,
        [key]: isAgentFaceError(caught)
          ? `${caught.code}: ${caught.message}`
          : String(caught),
      }));
    }
  }

  return (
    <section style={styles.section}>
      <h3 style={styles.sectionTitle}>Resources</h3>
      {snapshot.resources.length === 0 ? (
        <p style={styles.muted}>No resources registered.</p>
      ) : (
        snapshot.resources.map((resource) => {
          const key = `${snapshot.instance.instanceId}:${resource.id}`;
          const value = values[key];
          return (
            <div key={resource.id} style={styles.card}>
              <div>
                <span style={styles.cardTitle}>{resource.name}</span>
                <span style={styles.muted}> ({resource.id})</span>
                {resource.sensitivity !== undefined ? (
                  <span style={mergeStyles(styles.badge, styles.badgeWarn)}>
                    {resource.sensitivity}
                  </span>
                ) : null}
                <DecisionBadge decision={resource.readDecision} />
              </div>
              <div style={styles.muted}>{resource.description}</div>
              {resource.revision !== undefined ? (
                <div style={styles.muted}>revision {resource.revision}</div>
              ) : null}
              <button
                type="button"
                style={styles.buttonSecondary}
                onClick={() => void readValue(resource.id)}
              >
                Read {resource.name}
              </button>
              {value !== undefined ? <pre style={styles.pre}>{value}</pre> : null}
            </div>
          );
        })
      )}
    </section>
  );
}

interface ActionInspectorProps {
  readonly snapshot: AgentSurfaceSnapshot;
}

/** Actions of the selected surface: schema, availability, confirmation, preconditions. */
export function ActionInspector(props: ActionInspectorProps): ReactNode {
  const { snapshot } = props;
  return (
    <section style={styles.section}>
      <h3 style={styles.sectionTitle}>Actions</h3>
      {snapshot.actions.length === 0 ? (
        <p style={styles.muted}>No actions registered.</p>
      ) : (
        snapshot.actions.map((action) => (
          <div key={action.id} style={styles.card}>
            <div>
              <span style={styles.cardTitle}>{action.name}</span>
              <span style={styles.muted}> ({action.id})</span>
              <span
                style={mergeStyles(
                  styles.badge,
                  action.available ? styles.badgeOk : styles.badgeErr,
                )}
              >
                {action.available ? "available" : "unavailable"}
              </span>
              {action.sensitivity !== undefined ? (
                <span style={mergeStyles(styles.badge, styles.badgeWarn)}>
                  {action.sensitivity}
                </span>
              ) : null}
              <DecisionBadge decision={action.inspectDecision} />
            </div>
            <div style={styles.muted}>{action.description}</div>
            <div style={styles.muted}>
              confirmation: {action.confirmationPolicy}
            </div>
            {action.preconditions.length > 0 ? (
              <div style={styles.muted}>
                preconditions:{" "}
                {action.preconditions
                  .map((precondition) => precondition.id)
                  .join(", ")}
              </div>
            ) : null}
            {action.inputSchema !== undefined ? (
              <pre style={styles.pre}>
                {JSON.stringify(action.inputSchema, null, 2)}
              </pre>
            ) : null}
          </div>
        ))
      )}
    </section>
  );
}
