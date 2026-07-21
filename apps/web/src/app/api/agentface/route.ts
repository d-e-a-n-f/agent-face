import { createAgentFaceRouteHandler } from "@agentface/next";

// The playground's model choice: Claude via AWS Bedrock, using the server's
// AWS credential chain. The route package itself is provider-neutral.
export const { POST } = createAgentFaceRouteHandler({
  adapter: async () => {
    if (
      process.env.AWS_REGION === undefined ||
      process.env.AWS_REGION.length === 0
    ) {
      throw new Error(
        "Claude via Bedrock is not configured: set AWS_REGION (and AWS credentials) for the dev server.",
      );
    }
    const { createBedrockAdapter } = await import(
      "@agentface/assistant/bedrock"
    );
    return createBedrockAdapter();
  },
});
