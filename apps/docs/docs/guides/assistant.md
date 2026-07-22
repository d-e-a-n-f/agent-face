---
title: The assistant
---

# The assistant

## The widget

`<AgentFaceApp>` mounts it by default; standalone:

```tsx
import { AgentFaceAssistant } from "@agentface/assistant/react";

<AgentFaceAssistant title="Assistant" position="bottom-right" />
```

A floating launcher opens a chat bound to whatever is mounted on the current
screen. It locks input while working, shows an animated working indicator,
renders inline **confirmation cards** (preview + confirm/decline), and offers
[recommended next steps](./recommendations.md) as one-tap buttons.

## Build your own UI

The widget is built on a headless hook — use it directly:

```tsx
import { useAgentFaceAssistant } from "@agentface/assistant/react";

const { messages, busy, pendingConfirmation, send, confirm, decline, reset } =
  useAgentFaceAssistant();
```

## How the loop works

Each round, the assistant discovers the mounted surfaces, exposes
`discover_surfaces` and `read_resource` plus **one tool per discovered
action** (JSON Schema included), and calls your model. Tool calls execute
through the runtime's full lifecycle; typed errors return to the model as
structured results. Confirmation is **never** a model tool — required
confirmations pause on the user.

## Adapters and the model endpoint

`AgentModelRequest`/`AgentModelResponse` are JSON-serialisable and
provider-neutral, so the browser loop talks to a server-side endpoint and
credentials never reach the client:

```ts title="app/api/agentface/route.ts"
import { createAgentFaceRouteHandler } from "@agentface/next";

export const { POST } = createAgentFaceRouteHandler({
  adapter: async () => {
    const { createBedrockAdapter } = await import("@agentface/assistant/bedrock");
    return createBedrockAdapter();
  },
});
```

- **`createAISDKAdapter`** (`@agentface/ai-sdk`) — any Vercel AI SDK model:
  OpenAI, Anthropic, Google, Mistral, Groq, Bedrock, local
  OpenAI-compatible endpoints, and every other AI SDK provider.
  ```ts
  import { createAISDKAdapter } from "@agentface/ai-sdk";
  import { anthropic } from "@ai-sdk/anthropic";
  const adapter = createAISDKAdapter({ model: anthropic("claude-opus-4-8") });
  ```
- `createBedrockAdapter` — Claude on AWS Bedrock directly (server-side; AWS
  credential chain; `AWS_REGION` required).
- `createHttpModelAdapter` — the browser half; defaults to `/api/agentface`.
- `createModelEndpoint` — the framework-neutral server half (wrap it for
  NestJS/Express).
- `createMockModelAdapter` — deterministic scripted completions for tests; CI
  never calls a real model.

Writing another provider is implementing one method:
`complete(request) → Promise<response>`.

## Bring your own agent loop

Already running your own `generateText`/`streamText`/`Agent` loop with the
AI SDK? Expose the runtime to it as tools instead — AgentFace keeps owning
capability, policy, preview, and confirmation; your loop keeps owning the
model:

```ts
import { createAISDKTools } from "@agentface/ai-sdk";

const tools = await createAISDKTools({
  runtime,
  principals: { user },
  requestConfirmation: async (prepared) => await askUser(prepared),
});
const result = await generateText({ model, prompt: instruction, tools });
```

Discovery is policy-filtered (a denied action never becomes a tool), and
confirmation defaults to **declined** — the model can never approve its own
actions. Rebuild the tools each round: executed actions change what is
mounted.

## Securing the endpoint in production

:::warning
The endpoint is a **model proxy**: anyone who can POST to it consumes your
model provider account. In production you MUST authenticate it and should
rate-limit it.
:::

```ts title="app/api/agentface/route.ts"
export const { POST } = createAgentFaceRouteHandler({
  adapter,
  // Reject unauthenticated requests before anything is parsed:
  authorize: async (request) =>
    (await isSignedIn(request)) ? null : new Response(null, { status: 401 }),
  // Per-user quotas / throttles (return a 429 Response to reject):
  rateLimit: (request) => checkQuota(request),
  // Cross-origin browsers are rejected unless listed:
  allowedOrigins: ["https://app.example.com"],
  // 1 MiB default; enforced on actual bytes, not the Content-Length header:
  maxBodyBytes: 1_048_576,
  // Keep provider/config details out of client-visible 5xx bodies:
  redactErrors: true,
});
```

The demo playground runs without `authorize` because it is a local
development app — do not copy that into a deployment.
