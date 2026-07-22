---
"@agentface/ai-sdk": minor
---

New package: Vercel AI SDK integration.

- `createAISDKAdapter({ model })` — use any AI SDK language model as the
  AgentFace assistant's model in one line; one integration covers every AI
  SDK provider (OpenAI, Anthropic, Google, Mistral, Groq, Bedrock, local
  OpenAI-compatible endpoints, …). Tools are declared without execute
  functions, so the AI SDK never runs anything — the AgentFace loop owns
  execution, policy, and confirmation.
- `createAISDKTools({ runtime, principals, requestConfirmation })` — expose
  an AgentFace runtime to your own `generateText`/`streamText`/`Agent`
  loop as an AI SDK ToolSet. Discovery is policy-filtered (denied actions
  never become tools) and confirmation defaults to declined.
