/**
 * Vercel AI SDK integration for AgentFace.
 *
 * Two directions, pick per architecture:
 *
 * - {@link createAISDKAdapter} — use any AI SDK model **inside the
 *   AgentFace assistant** (our loop, our widget). One integration covers
 *   every provider the AI SDK supports.
 * - {@link createAISDKTools} — expose an AgentFace runtime **to your own
 *   AI SDK loop** (`generateText`/`streamText`/`Agent`) as a ToolSet.
 *   AgentFace keeps owning capability, policy, preview, and confirmation;
 *   the AI SDK keeps owning the model loop.
 *
 * @packageDocumentation
 */

export { createAISDKAdapter } from "./adapter.js";
export type { CreateAISDKAdapterOptions } from "./adapter.js";
export { createAISDKTools } from "./tools.js";
export type {
  AISDKConfirmationDecision,
  CreateAISDKToolsOptions,
} from "./tools.js";
