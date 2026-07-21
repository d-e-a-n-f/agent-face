"use client";

import type { AgentTraceEvent } from "@agentface/core";
import { useAgentRuntime } from "@agentface/react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { styles } from "./styles.js";

function describePayload(event: AgentTraceEvent): string {
  switch (event.type) {
    case "surface.registered":
      return event.surface.instanceId;
    case "surface.unregistered":
      return event.instanceId;
    case "resource.read":
      return `${event.resourceId} @ ${event.instanceId}`;
    case "policy.decided":
      return `${event.operation} → ${event.effect}${event.reason !== undefined ? ` (${event.reason})` : ""}`;
    case "action.failed":
      return `${event.actionId}: ${event.error.code}`;
    case "action.preparing":
    case "action.prepared":
    case "action.confirmation-required":
    case "action.confirmed":
    case "action.executing":
    case "action.succeeded":
      return event.actionId;
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}

interface TraceViewerProps {
  /** Bumps when new structural events arrive; reads pull the buffer fresh. */
  readonly version: number;
}

/** The runtime's trace buffer, newest first, filterable by trace id. */
export function TraceViewer(props: TraceViewerProps): ReactNode {
  const runtime = useAgentRuntime();
  const [filter, setFilter] = useState("");
  // The buffer is read in an effect keyed on version (not during render) so
  // memoizing compilers see the dependency and refresh the list.
  const [events, setEvents] = useState<readonly AgentTraceEvent[]>([]);
  useEffect(() => {
    setEvents(runtime.getTraceEvents());
  }, [runtime, props.version]);
  const filtered =
    filter.trim() === ""
      ? events
      : events.filter((event) => event.traceId.includes(filter.trim()));

  return (
    <section style={styles.section}>
      <h3 style={styles.sectionTitle}>Trace</h3>
      <input
        style={styles.input}
        aria-label="Filter by trace id"
        placeholder="Filter by trace id…"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
      />
      <div style={styles.traceList}>
        {[...filtered].reverse().map((event, index) => (
          <div
            key={`${event.traceId}-${filtered.length - index}`}
            style={styles.traceRow}
          >
            <span style={styles.muted}>
              {event.timestamp.slice(11, 23)}
            </span>
            <span style={styles.cardTitle}>{event.type}</span>
            <span style={styles.muted}>{describePayload(event)}</span>
            <span style={styles.muted}>{event.traceId}</span>
          </div>
        ))}
        {filtered.length === 0 ? (
          <p style={styles.muted}>No trace events.</p>
        ) : null}
      </div>
    </section>
  );
}
