import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { AgentFaceError } from "./errors.js";
import { fromZod } from "./zod.js";

const sendInput = z.object({
  message: z.string().optional(),
  amount: z.number().positive(),
});

describe("fromZod", () => {
  it("parses valid input to the inferred type", () => {
    const schema = fromZod(sendInput);
    const parsed = schema.parse({ message: "hi", amount: 100 });
    expect(parsed).toEqual({ message: "hi", amount: 100 });
    expectTypeOf(parsed).toEqualTypeOf<{
      message?: string | undefined;
      amount: number;
    }>();
  });

  it("throws AgentFaceError INVALID_INPUT with per-path issues", () => {
    const schema = fromZod(sendInput);
    let caught: unknown;
    try {
      schema.parse({ amount: -5 });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AgentFaceError);
    const error = caught as AgentFaceError;
    expect(error.code).toBe("INVALID_INPUT");
    expect(error.details).toMatchObject({
      issues: [{ path: "amount" }],
    });
    // Details must survive serialisation for transport later.
    expect(JSON.parse(JSON.stringify(error.toJSON()))).toEqual(error.toJSON());
  });

  it("produces JSON Schema for model tool definitions", () => {
    const schema = fromZod(sendInput);
    const jsonSchema = schema.toJSONSchema?.();
    expect(jsonSchema).toMatchObject({
      type: "object",
      required: ["amount"],
    });
  });
});
