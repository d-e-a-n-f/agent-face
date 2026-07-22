---
"@agentface/core": minor
"@agentface/policy": minor
"@agentface/runtime": minor
"@agentface/react": minor
"@agentface/testing": minor
"@agentface/devtools": minor
"@agentface/assistant": minor
"@agentface/next": minor
---

Safety and release hardening (pre-0.1 external review):

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
