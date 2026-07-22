"use client";

import { isAgentFaceError } from "@agentface/core";
import type {
  AgentActionExecutionResult,
  AgentSurfaceSnapshot,
  PreparedAgentAction,
} from "@agentface/runtime";
import { useAgentRuntime } from "@agentface/react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { mergeStyles, styles } from "./styles.js";

interface ActionRunnerProps {
  readonly snapshot: AgentSurfaceSnapshot;
}

interface RunnerState {
  readonly prepared: PreparedAgentAction | null;
  readonly confirmed: boolean;
  readonly execution: AgentActionExecutionResult | null;
  readonly error: string | null;
}

const IDLE: RunnerState = {
  prepared: null,
  confirmed: false,
  execution: null,
  error: null,
};

function describeError(caught: unknown): string {
  if (isAgentFaceError(caught)) {
    const details =
      caught.details !== undefined
        ? `\n${JSON.stringify(caught.details, null, 2)}`
        : "";
    return `${caught.code}: ${caught.message}${details}`;
  }
  return caught instanceof Error ? caught.message : String(caught);
}

/**
 * Drives the full action lifecycle by hand: pick an action, enter JSON
 * input, prepare, review the preview and policy outcome, confirm the exact
 * preparation, execute, and see the structured result. This is the proof
 * that the runtime works without a language model.
 */
export function ActionRunner(props: ActionRunnerProps): ReactNode {
  const runtime = useAgentRuntime();
  const { snapshot } = props;
  const instanceId = snapshot.instance.instanceId;

  const [actionId, setActionId] = useState<string>(
    snapshot.actions[0]?.id ?? "",
  );
  const [inputText, setInputText] = useState("{}");
  const [state, setState] = useState<RunnerState>(IDLE);

  // Selecting a different surface or action abandons the current preparation.
  useEffect(() => {
    setState(IDLE);
  }, [instanceId, actionId]);
  useEffect(() => {
    if (!snapshot.actions.some((action) => action.id === actionId)) {
      setActionId(snapshot.actions[0]?.id ?? "");
    }
  }, [snapshot, actionId]);

  const stale =
    state.prepared !== null &&
    state.prepared.expectedRevision !== undefined &&
    state.prepared.expectedRevision !== snapshot.instance.revision;

  async function prepare(): Promise<void> {
    let input: unknown;
    try {
      input = JSON.parse(inputText) as unknown;
    } catch (caught) {
      setState({ ...IDLE, error: `Input is not valid JSON: ${describeError(caught)}` });
      return;
    }
    try {
      const prepared = await runtime.prepareAction({
        instanceId,
        actionId,
        input,
      });
      setState({ ...IDLE, prepared });
    } catch (caught) {
      setState({ ...IDLE, error: describeError(caught) });
    }
  }

  async function confirm(): Promise<void> {
    if (state.prepared === null) {
      return;
    }
    try {
      await runtime.confirmAction({
        preparationId: state.prepared.preparationId,
      });
      setState((current) => ({ ...current, confirmed: true, error: null }));
    } catch (caught) {
      setState({ ...IDLE, error: describeError(caught) });
    }
  }

  async function execute(): Promise<void> {
    if (state.prepared === null) {
      return;
    }
    try {
      const execution = await runtime.executeAction({
        preparationId: state.prepared.preparationId,
      });
      setState((current) => ({ ...current, execution, error: null }));
    } catch (caught) {
      setState((current) => ({ ...current, error: describeError(caught) }));
    }
  }

  const executeBlocked =
    state.prepared === null ||
    state.execution !== null ||
    (state.prepared.confirmationRequired && !state.confirmed);

  return (
    <section style={styles.section}>
      <h3 style={styles.sectionTitle}>Action runner</h3>
      {snapshot.actions.length === 0 ? (
        <p style={styles.muted}>No actions to run.</p>
      ) : (
        <div style={styles.card}>
          <label>
            Action{" "}
            <select
              style={styles.select}
              value={actionId}
              onChange={(event) => setActionId(event.target.value)}
            >
              {snapshot.actions.map((action) => (
                <option key={action.id} value={action.id}>
                  {action.name} ({action.id})
                </option>
              ))}
            </select>
          </label>
          <textarea
            style={styles.textarea}
            aria-label="Action input JSON"
            value={inputText}
            onChange={(event) => setInputText(event.target.value)}
          />
          <div>
            <button type="button" style={styles.button} onClick={() => void prepare()}>
              Prepare
            </button>
            {state.prepared !== null &&
            state.prepared.confirmationRequired &&
            state.execution === null ? (
              <button
                type="button"
                style={mergeStyles(
                  styles.button,
                  state.confirmed && styles.buttonDisabled,
                )}
                disabled={state.confirmed}
                onClick={() => void confirm()}
              >
                Confirm
              </button>
            ) : null}
            {state.prepared !== null && state.execution === null ? (
              <button
                type="button"
                style={mergeStyles(
                  styles.button,
                  executeBlocked && styles.buttonDisabled,
                )}
                disabled={executeBlocked}
                onClick={() => void execute()}
              >
                Execute
              </button>
            ) : null}
          </div>

          {state.error !== null ? (
            <pre style={mergeStyles(styles.pre, { color: "#a11d33" })}>
              {state.error}
            </pre>
          ) : null}

          {state.prepared !== null ? (
            <div>
              {state.prepared.preview !== undefined ? (
                <div>
                  <div style={styles.cardTitle}>Preview</div>
                  <div>{state.prepared.preview.summary}</div>
                  {state.prepared.preview.changes !== undefined ? (
                    <pre style={styles.pre}>
                      {JSON.stringify(state.prepared.preview.changes, null, 2)}
                    </pre>
                  ) : null}
                </div>
              ) : null}
              {state.prepared.confirmationRequired && state.execution === null ? (
                <div>
                  <span style={mergeStyles(styles.badge, styles.badgeWarn)}>
                    confirmation required
                  </span>{" "}
                  <span style={styles.muted}>
                    {state.prepared.confirmationReason}
                  </span>
                </div>
              ) : null}
              {stale && state.execution === null ? (
                <div>
                  <span style={mergeStyles(styles.badge, styles.badgeErr)}>
                    stale
                  </span>{" "}
                  <span style={styles.muted}>
                    State changed since preparation — execution will fail with
                    STALE_STATE.
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}

          {state.execution !== null ? (
            <div>
              <div style={styles.cardTitle}>
                Result
                <span
                  style={mergeStyles(
                    styles.badge,
                    state.execution.result.status === "succeeded"
                      ? styles.badgeOk
                      : styles.badgeErr,
                  )}
                >
                  {state.execution.result.status}
                </span>
              </div>
              <pre style={styles.pre}>
                {JSON.stringify(state.execution.result, null, 2)}
              </pre>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
