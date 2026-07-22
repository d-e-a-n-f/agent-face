---
"@agentface/assistant": minor
"@agentface/ai-sdk": minor
"@agentface/next": minor
---

Assistant UX: streaming, persistence, and token visibility.

- **Streaming**: adapters gain optional `completeStream(request,
  onTextDelta)`; the loop uses it when present. Bedrock and ai-sdk
  adapters stream natively; the HTTP adapter/endpoint speak SSE
  end-to-end (`stream: true` request flag; graceful JSON fallback when
  the server adapter cannot stream; in-stream errors respect
  `redactErrors`). The widget renders the partial reply live.
- **Persistence**: conversations survive reloads (sessionStorage by
  default, `persist="local"|false` to change), keyed by application id;
  a new clear-conversation button empties thread and storage.
- **Usage**: responses carry `usage` token counts; the engine
  accumulates them (`getUsage()`), the hook exposes `usage`, and the
  widget shows in/out tokens in the header.
