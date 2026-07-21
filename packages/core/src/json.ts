/**
 * JSON-safe value types.
 *
 * AgentFace contracts must stay serialisable so they can later travel over
 * HTTP, WebSocket, JSON-RPC, or model tool definitions (execution closures are
 * the only exception and are never serialised). Positions that hold
 * transport-ready data are typed as {@link JsonValue} rather than `unknown` so
 * the compiler enforces serialisability.
 */

/** A JSON primitive value. */
export type JsonPrimitive = string | number | boolean | null;

/** Any JSON-serialisable value. */
export type JsonValue = JsonPrimitive | readonly JsonValue[] | JsonObject;

/** A JSON-serialisable object. */
export interface JsonObject {
  readonly [key: string]: JsonValue;
}
