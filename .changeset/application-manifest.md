---
"@agentface/core": minor
"@agentface/react": minor
"@agentface/runtime": minor
"@agentface/next": minor
"@agentface/devtools": minor
---

Static application manifest (`defineAgentApplication`) — app-wide agent
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
