# 0007 — Zod behind a schema interface

## Status

Accepted

## Context

Action inputs need runtime validation and (for model tool definitions) a JSON Schema representation. Zod is the obvious first library, but coupling every core contract to Zod's API would make the SDK hostage to one library's major-version churn and block future support for Standard Schema, Valibot, TypeBox, or generated OpenAPI schemas.

## Decision

Core contracts depend only on a minimal internal abstraction:

```ts
interface AgentInputSchema<TInput> {
  parse(input: unknown): TInput; // throws AgentFaceError INVALID_INPUT
  toJSONSchema?(): JsonObject;
}
```

A Zod adapter (`fromZod`) ships in a separate entry point, `@agentface/core/zod`, with `zod` as an optional peer dependency:

- The main `@agentface/core` entry has zero runtime dependencies.
- `parse` failures are normalised to `AgentFaceError` with code `INVALID_INPUT` and serialisable per-path issue details, so downstream packages never handle library-specific error shapes.
- JSON Schema generation uses Zod 4's built-in `z.toJSONSchema`.

## Consequences

- Runtime, policy, DevTools, and assistant packages validate through one interface and stay schema-library-agnostic.
- Additional adapters are additive (new entry points), not breaking.
- The abstraction is deliberately minimal; capabilities like async refinement or partial parsing are not exposed until a real consumer needs them.

## Alternatives considered

- **Direct Zod coupling**: simplest today; rejected for lock-in and error-shape leakage across package boundaries.
- **Standard Schema spec only**: attractive, but JSON Schema output — which tool generation requires — is not part of the spec; can be adopted later as another adapter.
- **JSON Schema as the primary format**: transport-friendly but loses TypeScript inference, which is the heart of the developer experience.
