# @agentface/devtools

## 0.1.0

### Minor Changes

- fb74184: Static application manifest (`defineAgentApplication`) — app-wide agent
  planning from one declaration:
  - Core: `defineAgentApplication({ id, routes: [{ path, description,
surfaces, entities }] })`, validated and frozen.
  - `<AgentFaceApp manifest={...}>` derives navigation routes from it,
    exposes it as the navigation surface's `application-map` resource, and
    appends an "Application screens" section to the assistant's system
    prompt (assistants plan across screens they haven't visited).
  - Runtime action descriptors now report `hasPreview`.
  - DevTools gains the **Agent readiness** report: the manifest diffed
    against live mounts + quality checks (routes exposing no surfaces,
    undeclared mounted faces, sensitive actions without previews or
    confirmation), scored out of 100.
  - `DEFAULT_ASSISTANT_SYSTEM_PROMPT` is exported so callers can extend
    rather than replace the default prompt.

- 27a30f1: Initial 0.1.0 MVP baseline: contracts, policy engine, runtime lifecycle,
  React bindings (+ hook-form, knowledge, recommendations), assistant (widget,
  Bedrock + mock adapters, HTTP transport), Next.js integration (route handler,
  navigation, AgentFaceApp), DevTools, and deterministic testing utilities.
- f426699: Safety and release hardening (pre-0.1 external review):
  - Entity identity binds at surface registration; identity changes remount
    (React) and invalidate every outstanding preparation (runtime,
    `surface.entity-changed` trace event) — a confirmation captured for one
    entity can never execute against another.
  - Preparations carry a principal fingerprint; confirmation/execution reject
    principal drift (`PRINCIPAL_CHANGED`) and re-evaluate execute policy at
    execution time. `AgentFaceApp` and the assistant resolve principals per
    operation from live React context.
  - Discovery filters policy-denied capabilities (`discover({ principals })`)
    — a denied action never becomes a model tool. `preview-action` policy is
    enforced (deny withholds the preview).
  - Action results are constrained to `JsonValue` (compile-time) and
    runtime-checked, as are resource values; application closure failures
    normalise to stable codes (`AVAILABILITY_CHECK_FAILED`,
    `PRECONDITION_CHECK_FAILED`, `PREVIEW_FAILED`, `RESOURCE_READ_FAILED`).
  - Assistant: tool-name collisions resolve within the 64-char budget (no
    infinite loop), concurrent `send()`s queue, `cancel()` stops the loop,
    the widget gains a Stop control. Ids capped at 48 chars.
  - `createAgentFaceRouteHandler` gains `authorize`, `rateLimit`,
    `allowedOrigins`, `maxBodyBytes` (1 MiB default, enforced on real bytes),
    and `redactErrors` — the endpoint is a model proxy and must be
    authenticated in production.

### Patch Changes

- Updated dependencies [fb74184]
- Updated dependencies [27a30f1]
- Updated dependencies [f426699]
  - @agentface/core@0.1.0
  - @agentface/react@0.1.0
  - @agentface/runtime@0.1.0
