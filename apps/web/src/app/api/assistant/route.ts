import type { AgentModelAdapter, AgentModelRequest } from "@agentface/assistant";
import { NextResponse } from "next/server";

/**
 * Server-side model endpoint for the playground assistant. The browser runs
 * the assistant loop against the local runtime; only model completions cross
 * this boundary. Claude is reached via AWS Bedrock using the server's AWS
 * credentials — env-gated so CI and credential-less checkouts degrade
 * gracefully instead of failing.
 */

let adapterPromise: Promise<AgentModelAdapter> | null = null;

function getAdapter(): Promise<AgentModelAdapter> {
  adapterPromise ??= import("@agentface/assistant/bedrock").then(
    ({ createBedrockAdapter }) => createBedrockAdapter(),
  );
  return adapterPromise;
}

export async function POST(request: Request): Promise<NextResponse> {
  if (
    process.env.AWS_REGION === undefined ||
    process.env.AWS_REGION.length === 0
  ) {
    return NextResponse.json(
      {
        error:
          "Claude via Bedrock is not configured: set AWS_REGION (and AWS credentials) for the dev server, or use the mock adapter.",
      },
      { status: 503 },
    );
  }
  try {
    const body = (await request.json()) as AgentModelRequest;
    const adapter = await getAdapter();
    const response = await adapter.complete(body);
    return NextResponse.json(response);
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : String(caught) },
      { status: 502 },
    );
  }
}
