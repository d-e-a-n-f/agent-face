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

  describe("production hardening", () => {
    const okAdapter = {
      complete: (): Promise<AgentModelResponse> =>
        Promise.resolve({ text: "ok", toolCalls: [], stopReason: "end-turn" }),
    };

    it("authorize rejects before the body is parsed", async () => {
      let completed = 0;
      const handler = createAgentFaceRouteHandler({
        adapter: {
          complete: () => {
            completed += 1;
            return Promise.resolve({
              text: "ok",
              toolCalls: [],
              stopReason: "end-turn" as const,
            });
          },
        },
        authorize: (request) =>
          request.headers.get("authorization") === "Bearer secret"
            ? null
            : new Response(null, { status: 401 }),
      });
      const denied = await handler.POST(post(validRequest));
      expect(denied.status).toBe(401);
      expect(completed).toBe(0);

      const allowed = await handler.POST(
        new Request("http://localhost/api/agentface", {
          method: "POST",
          headers: { authorization: "Bearer secret" },
          body: JSON.stringify(validRequest),
        }),
      );
      expect(allowed.status).toBe(200);
    });

    it("rateLimit can reject with 429", async () => {
      const handler = createAgentFaceRouteHandler({
        adapter: okAdapter,
        rateLimit: () => new Response(null, { status: 429 }),
      });
      const result = await handler.POST(post(validRequest));
      expect(result.status).toBe(429);
    });

    it("oversized bodies get 413 even when Content-Length lies", async () => {
      const handler = createAgentFaceRouteHandler({
        adapter: okAdapter,
        maxBodyBytes: 64,
      });
      const big = {
        ...validRequest,
        system: "x".repeat(1000),
      };
      const result = await handler.POST(
        new Request("http://localhost/api/agentface", {
          method: "POST",
          body: JSON.stringify(big),
        }),
      );
      expect(result.status).toBe(413);
    });

    it("disallowed browser origins get 403; same-origin passes", async () => {
      const handler = createAgentFaceRouteHandler({
        adapter: okAdapter,
        allowedOrigins: ["https://app.example.com"],
      });
      const crossOrigin = await handler.POST(
        new Request("http://localhost/api/agentface", {
          method: "POST",
          headers: { origin: "https://evil.example.com" },
          body: JSON.stringify(validRequest),
        }),
      );
      expect(crossOrigin.status).toBe(403);

      const sameOrigin = await handler.POST(post(validRequest));
      expect(sameOrigin.status).toBe(200);
    });

    it("redactErrors hides 5xx details", async () => {
      const handler = createAgentFaceRouteHandler({
        adapter: {
          complete: () =>
            Promise.reject(new Error("aws credentials expired at …")),
        },
        redactErrors: true,
      });
      const result = await handler.POST(post(validRequest));
      expect(result.status).toBe(502);
      await expect(result.json()).resolves.toEqual({
        error: "The model endpoint failed",
      });
    });
  });
});
