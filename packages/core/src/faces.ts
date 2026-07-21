import type { AgentFaceId } from "./ids.js";

/** How one face relates to another in the surface graph. */
export type AgentFaceRelationshipType = "parent" | "child" | "related";

/** A declared relationship between two face definitions. */
export interface AgentFaceRelationship {
  readonly type: AgentFaceRelationshipType;
  readonly targetFaceId: AgentFaceId;
}

/**
 * A reusable description of a feature's agent-facing interface. Definitions
 * are static and shared; a mounted feature is represented separately by an
 * `AgentSurfaceInstance`.
 *
 * Create these with `defineAgentFace` so identifier and version shape are
 * validated at definition time.
 *
 * @example
 * ```ts
 * const invoiceFace = defineAgentFace({
 *   id: "billing.invoice",
 *   name: "Invoice",
 *   description: "View, edit and send a customer invoice",
 *   version: "0.1.0",
 * });
 * ```
 */
export interface AgentFaceDefinition {
  readonly id: AgentFaceId;
  /** Defaults to a humanised form of the id's last segment. */
  readonly name?: string;
  readonly description: string;
  /** Semver-style version of this contract. Defaults to "0.0.0". */
  readonly version?: string;
  readonly tags?: readonly string[];
  readonly relationships?: readonly AgentFaceRelationship[];
}
