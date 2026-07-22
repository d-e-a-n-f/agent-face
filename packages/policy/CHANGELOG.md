# @agentface/policy

## 0.1.0

### Minor Changes

- 27a30f1: Initial 0.1.0 MVP baseline: contracts, policy engine, runtime lifecycle,
  React bindings (+ hook-form, knowledge, recommendations), assistant (widget,
  Bedrock + mock adapters, HTTP transport), Next.js integration (route handler,
  navigation, AgentFaceApp), DevTools, and deterministic testing utilities.
- 660c1bb: Policy presets and a composable rule library, so adopters get a sound
  policy without designing an engine:
  - Presets: `developmentPolicy()` (allow + confirm confidential),
    `standardUserPolicy()` (require user, delegation-checked agents,
    restricted denied, confidential confirmed, composable extra rules),
    `readOnlyPolicy()`.
  - Rules: `requireUser()`, `requireRole()` (defaults to the user
    principal's roles), `requireSameTenant()`, `requireDelegation()`,
    `limitActionRate()`, `limitMonetaryValue()` (deny above max, confirm
    above threshold, caller-supplied `amountOf`),
    `denyOutsideBusinessHours()` — all deterministic with injectable
    clocks/extractors.

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
