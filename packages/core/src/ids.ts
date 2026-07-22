/**
 * Identifier types used across all AgentFace contracts.
 *
 * These are plain string aliases for the first implementation (branding may be
 * introduced later without changing call sites that go through the `defineX`
 * helpers, which validate identifier shape at definition time).
 */

/** Identifies a reusable face definition, e.g. `"billing.invoice"`. */
export type AgentFaceId = string;

/**
 * Identifies one mounted surface instance within a runtime session,
 * e.g. `"billing.invoice:inv_9821:01J2..."`. Unique per session — the same
 * face + entity may be mounted in several views at once.
 */
export type AgentSurfaceInstanceId = string;

/** Identifies a resource within its surface, e.g. `"summary"`. */
export type AgentResourceId = string;

/** Identifies an action within its surface, e.g. `"send"`. */
export type AgentActionId = string;

/** Identifies an event definition within its surface. */
export type AgentEventId = string;

/** Correlates all runtime events emitted by one logical operation. */
export type AgentTraceId = string;
