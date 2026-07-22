/**
 * Identity types. Agent access never simply inherits all user capabilities:
 * the runtime and policies distinguish the human user, the acting agent, and
 * the delegation that links them.
 */

/** The human user of the application. */
export interface UserPrincipal {
  readonly type: "user";
  readonly id: string;
  readonly displayName?: string;
  readonly tenantId?: string;
  readonly roles?: readonly string[];
}

/** An AI agent operating the application. */
export interface AgentPrincipal {
  readonly type: "agent";
  readonly id: string;
  readonly displayName?: string;
  /** The model or system backing the agent, for auditing. */
  readonly model?: string;
}

/** Either kind of principal. Discriminated by `type`. */
export type AgentFacePrincipal = UserPrincipal | AgentPrincipal;

/**
 * The authority a user has delegated to an agent. Policies evaluate this to
 * decide what the agent may read, propose, or execute on the user's behalf.
 */
export interface DelegationContext {
  /** The user who granted the delegation. */
  readonly userId: string;
  /** The agent the delegation was granted to. */
  readonly agentId: string;
  /** ISO-8601 timestamp of the grant. */
  readonly grantedAt: string;
  /** ISO-8601 expiry; absent means session-scoped. */
  readonly expiresAt?: string;
  /** Named scopes limiting what the delegation covers. */
  readonly scopes?: readonly string[];
}
