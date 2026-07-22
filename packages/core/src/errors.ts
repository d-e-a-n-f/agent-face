import type { JsonValue } from "./json.js";

/**
 * The stable set of AgentFace error codes. Codes are part of the public
 * contract: agents and tooling branch on them, so they must never be renamed.
 */
export const AGENT_ERROR_CODES = [
  "SURFACE_NOT_FOUND",
  "RESOURCE_NOT_FOUND",
  "ACTION_NOT_FOUND",
  "INVALID_INPUT",
  "PRECONDITION_FAILED",
  "POLICY_DENIED",
  "CONFIRMATION_REQUIRED",
  "STALE_STATE",
  "EXECUTION_FAILED",
  "AVAILABILITY_CHECK_FAILED",
  "PRECONDITION_CHECK_FAILED",
  "PREVIEW_FAILED",
  "RESOURCE_READ_FAILED",
  "PRINCIPAL_CHANGED",
] as const;

/** A stable, serialisable AgentFace error code. */
export type AgentErrorCode = (typeof AGENT_ERROR_CODES)[number];

/**
 * The serialisable AgentFace error shape. Crosses package (and, later,
 * transport) boundaries — never throw plain strings between packages.
 *
 * @example
 * ```ts
 * const error: AgentError = {
 *   code: "PRECONDITION_FAILED",
 *   message: "The invoice must still be a draft",
 *   details: { preconditionId: "invoice-is-draft" },
 * };
 * ```
 */
export interface AgentError {
  readonly code: AgentErrorCode;
  readonly message: string;
  readonly details?: JsonValue;
  readonly retryable?: boolean;
}

const CODE_SET: ReadonlySet<string> = new Set(AGENT_ERROR_CODES);

/**
 * Type guard for the serialisable {@link AgentError} shape.
 *
 * @example
 * ```ts
 * if (isAgentError(caught)) console.error(caught.code);
 * ```
 */
export function isAgentError(value: unknown): value is AgentError {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    typeof (value as { code: unknown }).code === "string" &&
    CODE_SET.has((value as { code: string }).code) &&
    "message" in value &&
    typeof (value as { message: unknown }).message === "string"
  );
}

/**
 * The throwable carrier for an {@link AgentError}. Use this (or a subclass)
 * for every error thrown across an AgentFace package boundary.
 *
 * @example
 * ```ts
 * throw new AgentFaceError({
 *   code: "ACTION_NOT_FOUND",
 *   message: `Action "send" is not registered on surface ${instanceId}`,
 * });
 * ```
 */
export class AgentFaceError extends Error implements AgentError {
  readonly code: AgentErrorCode;
  readonly details?: JsonValue;
  readonly retryable?: boolean;

  constructor(error: AgentError) {
    super(error.message);
    this.name = "AgentFaceError";
    this.code = error.code;
    if (error.details !== undefined) {
      this.details = error.details;
    }
    if (error.retryable !== undefined) {
      this.retryable = error.retryable;
    }
  }

  /** The serialisable {@link AgentError} form of this error. */
  toJSON(): AgentError {
    return {
      code: this.code,
      message: this.message,
      ...(this.details !== undefined ? { details: this.details } : {}),
      ...(this.retryable !== undefined ? { retryable: this.retryable } : {}),
    };
  }
}

/** Type guard for the throwable {@link AgentFaceError} class. */
export function isAgentFaceError(value: unknown): value is AgentFaceError {
  return value instanceof AgentFaceError;
}
