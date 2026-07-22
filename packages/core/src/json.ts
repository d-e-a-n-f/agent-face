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

/**
 * Runtime check that a value is JSON-serialisable: primitives, plain
 * arrays/objects, no cycles, no functions/symbols/bigints/class instances,
 * finite numbers only. `undefined` is tolerated in object property position
 * (dropped at serialisation) but nowhere else.
 *
 * Returns the first offending path (e.g. `"result.total"`), or `null` when
 * the value is JSON-safe. Callers turn a non-null result into a typed error
 * with the code appropriate to their boundary.
 */
export function findJsonUnsafePath(
  value: unknown,
  path = "value",
  seen?: Set<object>,
): string | null {
  if (value === null) {
    return null;
  }
  switch (typeof value) {
    case "string":
    case "boolean":
      return null;
    case "number":
      return Number.isFinite(value) ? null : path;
    case "object":
      break;
    default:
      return path;
  }
  const active = seen ?? new Set<object>();
  const container = value as object;
  if (active.has(container)) {
    return path;
  }
  active.add(container);
  try {
    if (Array.isArray(container)) {
      for (let index = 0; index < container.length; index += 1) {
        const found = findJsonUnsafePath(
          container[index],
          `${path}[${index}]`,
          active,
        );
        if (found !== null) {
          return found;
        }
      }
      return null;
    }
    const prototype = Object.getPrototypeOf(container);
    if (prototype !== Object.prototype && prototype !== null) {
      return path;
    }
    for (const [key, entry] of Object.entries(container)) {
      if (entry === undefined) {
        continue;
      }
      const found = findJsonUnsafePath(entry, `${path}.${key}`, active);
      if (found !== null) {
        return found;
      }
    }
    return null;
  } finally {
    active.delete(container);
  }
}

/** Any JSON-serialisable value. */
export type JsonValue = JsonPrimitive | readonly JsonValue[] | JsonObject;

/**
 * A JSON-serialisable object. Property values may be `undefined` — such
 * properties are dropped at serialisation (matching `JSON.stringify`), which
 * keeps objects with inferred optional properties assignable.
 */
export interface JsonObject {
  readonly [key: string]: JsonValue | undefined;
}
