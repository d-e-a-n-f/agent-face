import type { AgentEntityReference } from "./entities.js";
import type { AgentFaceDefinition } from "./faces.js";
import type { AgentSurfaceInstanceId } from "./ids.js";

/**
 * One mounted occurrence of a face. Definitions are reusable
 * (`billing.invoice`); an instance represents that face actually mounted in
 * the application (`billing.invoice:inv_9821:01J2...`), so several instances
 * of the same definition — even for the same entity — can coexist.
 */
export interface AgentSurfaceInstance {
  /** Unique within one runtime session. */
  readonly instanceId: AgentSurfaceInstanceId;
  readonly face: AgentFaceDefinition;
  /** The entity this mounted surface is presenting, when there is one. */
  readonly entity?: AgentEntityReference;
  /** The enclosing mounted surface, when surfaces are nested. */
  readonly parentInstanceId?: AgentSurfaceInstanceId;
  readonly childInstanceIds: readonly AgentSurfaceInstanceId[];
  /** ISO-8601 timestamp of when the surface was mounted. */
  readonly mountedAt: string;
  /**
   * Monotonically increasing state revision. Mutations bump it; prepared
   * actions bind to it so stale operations are rejected with `STALE_STATE`.
   */
  readonly revision: number;
}
