import type { AgentModelRequest, AgentModelResponse } from "@agentface/assistant";
import { describe, expect, it } from "vitest";
import { createAgentFaceRouteHandler } from "./index.js";

const validRequest: AgentModelRequest = {
  system: "You are a test.",
  messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
  tools: [],
};

function post(body: unknown): Request {
  return new Request("http://localhost/api/agentface", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("createAgentFaceRouteHandler", () => {
  it("forwards valid requests to the adapter", async () => {
    const response: AgentModelResponse = {
      text: "Hello",
      toolCalls: [],
      stopReason: "end-turn",
    };
    const handler = createAgentFaceRouteHandler({
      adapter: { complete: () => Promise.resolve(response) },
    });
    const result = await handler.POST(post(validRequest));
    expect(result.status).toBe(200);
    await expect(result.json()).resolves.toEqual(response);
  });

  it("rejects malformed JSON with 400", async () => {
    const handler = createAgentFaceRouteHandler({
      adapter: { complete: () => Promise.reject(new Error("unreachable")) },
    });
    const result = await handler.POST(post("{not json"));
    expect(result.status).toBe(400);
  });

  it("rejects bodies that are not model requests with 400", async () => {
    const handler = createAgentFaceRouteHandler({
      adapter: { complete: () => Promise.reject(new Error("unreachable")) },
    });
    const result = await handler.POST(post({ nope: true }));
    expect(result.status).toBe(400);
    await expect(result.json()).resolves.toMatchObject({
      error: expect.stringContaining("AgentModelRequest"),
    });
  });

  it("reports adapter factory failures as 503", async () => {
    const handler = createAgentFaceRouteHandler({
      adapter: () => {
        throw new Error("AWS_REGION is not set");
      },
    });
    const result = await handler.POST(post(validRequest));
    expect(result.status).toBe(503);
    await expect(result.json()).resolves.toEqual({
      error: "AWS_REGION is not set",
    });
  });

  it("reports completion failures as 502", async () => {
    const handler = createAgentFaceRouteHandler({
      adapter: {
        complete: () => Promise.reject(new Error("model unavailable")),
      },
    });
    const result = await handler.POST(post(validRequest));
    expect(result.status).toBe(502);
    await expect(result.json()).resolves.toEqual({
      error: "model unavailable",
    });
  });
});
