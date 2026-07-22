import { describe, expect, it } from "vitest";
import {
  AGENT_ERROR_CODES,
  AgentFaceError,
  isAgentError,
  isAgentFaceError,
} from "./errors.js";

describe("AgentFaceError", () => {
  it("carries code, message, details and retryable", () => {
    const error = new AgentFaceError({
      code: "PRECONDITION_FAILED",
      message: "The invoice must still be a draft",
      details: { preconditionId: "invoice-is-draft" },
      retryable: false,
    });
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe("PRECONDITION_FAILED");
    expect(error.message).toBe("The invoice must still be a draft");
    expect(error.details).toEqual({ preconditionId: "invoice-is-draft" });
    expect(error.retryable).toBe(false);
  });

  it("serialises to the AgentError shape, omitting absent optionals", () => {
    const error = new AgentFaceError({
      code: "SURFACE_NOT_FOUND",
      message: "No such surface",
    });
    expect(error.toJSON()).toEqual({
      code: "SURFACE_NOT_FOUND",
      message: "No such surface",
    });
    expect(JSON.parse(JSON.stringify(error.toJSON()))).toEqual(error.toJSON());
  });
});

describe("isAgentError", () => {
  it("accepts every stable code", () => {
    for (const code of AGENT_ERROR_CODES) {
      expect(isAgentError({ code, message: "m" })).toBe(true);
    }
  });

  it("accepts a thrown AgentFaceError", () => {
    expect(
      isAgentError(new AgentFaceError({ code: "STALE_STATE", message: "m" })),
    ).toBe(true);
  });

  it.each([
    ["null", null],
    ["a string", "EXECUTION_FAILED"],
    ["an unknown code", { code: "NOT_A_CODE", message: "m" }],
    ["a missing message", { code: "EXECUTION_FAILED" }],
    ["a plain Error", new Error("boom")],
  ])("rejects %s", (_label, value) => {
    expect(isAgentError(value)).toBe(false);
  });
});

describe("isAgentFaceError", () => {
  it("distinguishes the class from the plain shape", () => {
    const shape = { code: "EXECUTION_FAILED" as const, message: "m" };
    expect(isAgentFaceError(shape)).toBe(false);
    expect(isAgentFaceError(new AgentFaceError(shape))).toBe(true);
  });
});
