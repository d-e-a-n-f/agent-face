import { describe, expect, it } from "vitest";

describe("@agentface/runtime", () => {
  it("module loads", async () => {
    const mod = await import("./index.js");
    expect(mod).toBeDefined();
  });
});
