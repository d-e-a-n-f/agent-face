import { describe, expect, it } from "vitest";
import { createHttpModelAdapter, createModelEndpoint } from "./http.js";
import type { AgentModelRequest, AgentModelResponse } from "./types.js";

const request: AgentModelRequest = {
  system: "test",
  messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
  tools: [],
};

const finalResponse: AgentModelResponse = {
  text: "Hello there",
  toolCalls: [],
  stopReason: "end-turn",
  usage: { inputTokens: 10, outputTokens: 5 },
};

function sseResponse(frames: readonly unknown[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream" },
  });
}

describe("createHttpModelAdapter.completeStream", () => {
  it("parses SSE deltas and resolves with the final response", async () => {
    const adapter = createHttpModelAdapter({
      fetchImpl: async () =>
        sseResponse([
          { type: "delta", text: "Hello " },
          { type: "delta", text: "there" },
          { type: "response", response: finalResponse },
        ]),
    });
    const deltas: string[] = [];
    const response = await adapter.completeStream?.(request, (delta) =>
      deltas.push(delta),
    );
    expect(deltas).toEqual(["Hello ", "there"]);
    expect(response).toEqual(finalResponse);
  });

  it("falls back to JSON when the server does not stream", async () => {
    const adapter = createHttpModelAdapter({
      fetchImpl: async () => Response.json(finalResponse),
    });
    const deltas: string[] = [];
    const response = await adapter.completeStream?.(request, (delta) =>
      deltas.push(delta),
    );
    expect(deltas).toEqual([]);
    expect(response).toEqual(finalResponse);
  });

  it("surfaces in-stream errors as thrown errors", async () => {
    const adapter = createHttpModelAdapter({
      fetchImpl: async () =>
        sseResponse([{ type: "error", error: "model unavailable" }]),
    });
    await expect(
      adapter.completeStream?.(request, () => undefined),
    ).rejects.toThrow("model unavailable");
  });
});

describe("createModelEndpoint.handleStream", () => {
  it("emits delta frames then the final response frame", async () => {
    const endpoint = createModelEndpoint({
      complete: async () => finalResponse,
      completeStream: async (_request, onDelta) => {
        onDelta("Hello ");
        onDelta("there");
        return finalResponse;
      },
    });
    const result = await endpoint.handleStream(request);
    expect(result.kind).toBe("stream");
    if (result.kind !== "stream") {
      return;
    }
    const text = await new Response(result.stream).text();
    const frames = text
      .split("\n\n")
      .filter((frame) => frame.startsWith("data: "))
      .map((frame) => JSON.parse(frame.slice(6)) as { type: string });
    expect(frames.map((frame) => frame.type)).toEqual([
      "delta",
      "delta",
      "response",
    ]);
  });

  it("returns a JSON result when the adapter cannot stream", async () => {
    const endpoint = createModelEndpoint({ complete: async () => finalResponse });
    const result = await endpoint.handleStream(request);
    expect(result).toMatchObject({ kind: "json", status: 200 });
  });

  it("streams an error frame when the adapter fails mid-stream", async () => {
    const endpoint = createModelEndpoint({
      complete: async () => finalResponse,
      completeStream: async (_request, onDelta) => {
        onDelta("partial");
        throw new Error("provider exploded");
      },
    });
    const result = await endpoint.handleStream(request);
    if (result.kind !== "stream") {
      throw new Error("expected stream");
    }
    const text = await new Response(result.stream).text();
    expect(text).toContain('"type":"error"');
    expect(text).toContain("provider exploded");
  });
});
