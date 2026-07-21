import type { AgentError } from "./errors.js";
import type {
  AgentActionId,
  AgentFaceId,
  AgentResourceId,
  AgentSurfaceInstanceId,
  AgentTraceId,
} from "./ids.js";
import type { AgentSurfaceInstance } from "./surfaces.js";

/** Policy effect as it appears in trace events (structurally matches `@agentface/policy` decisions). */
export type AgentPolicyEffect = "allow" | "confirm" | "deny";

/**
 * Structured events emitted by the runtime. These replace ad-hoc logging:
 * DevTools and the playground render them; packages never `console.log`.
 * Discriminated by `type` — handle exhaustively.
 */
export type AgentRuntimeEvent =
  | {
      readonly type: "surface.registered";
      readonly surface: AgentSurfaceInstance;
    }
  | {
      readonly type: "surface.unregistered";
      readonly instanceId: AgentSurfaceInstanceId;
      readonly faceId: AgentFaceId;
    }
  | {
      readonly type: "resource.read";
      readonly instanceId: AgentSurfaceInstanceId;
      readonly resourceId: AgentResourceId;
      readonly revision?: number;
    }
  | {
      readonly type: "action.preparing";
      readonly instanceId: AgentSurfaceInstanceId;
      readonly actionId: AgentActionId;
    }
  | {
      readonly type: "action.prepared";
      readonly instanceId: AgentSurfaceInstanceId;
      readonly actionId: AgentActionId;
      readonly preparationId: string;
      readonly confirmationRequired: boolean;
    }
  | {
      readonly type: "action.confirmation-required";
      readonly instanceId: AgentSurfaceInstanceId;
      readonly actionId: AgentActionId;
      readonly preparationId: string;
      readonly reason?: string;
    }
  | {
      readonly type: "action.confirmed";
      readonly instanceId: AgentSurfaceInstanceId;
      readonly actionId: AgentActionId;
      readonly preparationId: string;
    }
  | {
      readonly type: "action.executing";
      readonly instanceId: AgentSurfaceInstanceId;
      readonly actionId: AgentActionId;
      readonly preparationId: string;
    }
  | {
      readonly type: "action.succeeded";
      readonly instanceId: AgentSurfaceInstanceId;
      readonly actionId: AgentActionId;
      readonly preparationId: string;
      readonly durationMs?: number;
    }
  | {
      readonly type: "action.failed";
      readonly instanceId: AgentSurfaceInstanceId;
      readonly actionId: AgentActionId;
      readonly preparationId?: string;
      readonly error: AgentError;
    }
  | {
      readonly type: "policy.decided";
      readonly operation: string;
      readonly effect: AgentPolicyEffect;
      readonly instanceId?: AgentSurfaceInstanceId;
      readonly reason?: string;
    };

/** The discriminant values of {@link AgentRuntimeEvent}. */
export type AgentRuntimeEventType = AgentRuntimeEvent["type"];

/**
 * A runtime event stamped with trace correlation data, as stored in the
 * runtime's trace buffer and rendered by DevTools.
 */
export type AgentTraceEvent = AgentRuntimeEvent & {
  readonly traceId: AgentTraceId;
  /** ISO-8601 timestamp. */
  readonly timestamp: string;
};
