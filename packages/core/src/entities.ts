/**
 * A reference to the business entity a surface is currently presenting,
 * e.g. the invoice open in an invoice editor.
 *
 * @example
 * ```ts
 * const entity: AgentEntityReference = {
 *   type: "invoice",
 *   id: "inv_9821",
 *   displayName: "Invoice #9821",
 * };
 * ```
 */
export interface AgentEntityReference {
  /** The business entity type, e.g. `"invoice"` or `"customer"`. */
  readonly type: string;
  /** The application's identifier for the entity. */
  readonly id: string;
  /** The tenant the entity belongs to, in multi-tenant applications. */
  readonly tenantId?: string;
  /** A human-readable label for the entity. */
  readonly displayName?: string;
}
