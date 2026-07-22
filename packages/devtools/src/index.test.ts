import { describe, expect, it } from "vitest";

describe("@agentface/devtools", () => {
  it("module loads", async () => {
    const mod = await import("./index.js");
    expect(mod).toBeDefined();
  });
});
