import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  AgentActionDefinition,
  AgentActionPreview,
  AgentConfirmationRule,
} from "./actions.js";
import {
  defineAgentAction,
  defineAgentEvent,
  defineAgentFace,
  defineAgentResource,
} from "./definitions.js";
import { AgentFaceError } from "./errors.js";
import type { AgentResourceDefinition } from "./resources.js";
import type { AgentInputSchema } from "./schema.js";

const validFace = {
  id: "billing.invoice",
  name: "Invoice",
  description: "View, edit and send a customer invoice",
  version: "0.1.0",
} as const;

interface SendInput {
  readonly message?: string;
}

const sendInputSchema: AgentInputSchema<SendInput> = {
  parse(input: unknown): SendInput {
    if (typeof input !== "object" || input === null) {
      throw new AgentFaceError({
        code: "INVALID_INPUT",
        message: "Expected an object",
      });
    }
    return input as SendInput;
  },
};

function expectInvalidInput(fn: () => unknown): void {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(AgentFaceError);
  expect((caught as AgentFaceError).code).toBe("INVALID_INPUT");
}

describe("defineAgentFace", () => {
  it("returns a frozen definition for valid input", () => {
    const face = defineAgentFace(validFace);
    expect(face).toEqual(validFace);
    expect(Object.isFrozen(face)).toBe(true);
  });

  it("defaults name and version when omitted", () => {
    const face = defineAgentFace({
      id: "billing.invoice",
      description: "An invoice",
    });
    expect(face.name).toBe("Invoice");
    expect(face.version).toBe("0.0.0");
  });

  it("accepts relationships with valid target ids", () => {
    const face = defineAgentFace({
      ...validFace,
      relationships: [{ type: "child", targetFaceId: "billing.invoice.lines" }],
    });
    expect(face.relationships).toHaveLength(1);
  });

  it.each([
    ["empty id", { ...validFace, id: "" }],
    ["whitespace id", { ...validFace, id: "billing invoice" }],
    ["trailing dot id", { ...validFace, id: "billing." }],
    ["empty name", { ...validFace, name: "" }],
    ["blank description", { ...validFace, description: "   " }],
    ["non-semver version", { ...validFace, version: "1.0" }],
    [
      "bad relationship target",
      {
        ...validFace,
        relationships: [{ type: "related" as const, targetFaceId: "!nope" }],
      },
    ],
  ])("rejects %s with INVALID_INPUT", (_label, definition) => {
    expectInvalidInput(() => defineAgentFace(definition));
  });

  it("accepts prerelease versions", () => {
    expect(
      defineAgentFace({ ...validFace, version: "1.0.0-beta.1" }).version,
    ).toBe("1.0.0-beta.1");
  });
});

describe("defineAgentResource", () => {
  it("preserves the value generic through serialize", () => {
    interface Summary {
      readonly total: number;
    }
    const resource = defineAgentResource<Summary>({
      id: "summary",
      name: "Invoice summary",
      description: "The current invoice totals and status",
      serialize: (value) => ({ total: value.total }),
    });
    expectTypeOf(resource).toEqualTypeOf<AgentResourceDefinition<Summary>>();
    expect(Object.isFrozen(resource)).toBe(true);
  });

  it("rejects malformed metadata with INVALID_INPUT", () => {
    expectInvalidInput(() =>
      defineAgentResource({ id: "bad id", name: "x", description: "y" }),
    );
  });
});

describe("defineAgentAction", () => {
  const validAction = {
    id: "send",
    name: "Send invoice",
    description: "Send the completed invoice to the customer",
    input: sendInputSchema,
    execute: (input: SendInput) => ({ sent: true, message: input.message }),
  };

  it("returns a frozen definition preserving generics", () => {
    interface SendResult {
      sent: boolean;
      message: string | undefined;
    }
    const action = defineAgentAction(validAction);
    expect(Object.isFrozen(action)).toBe(true);
    expectTypeOf(action.execute).parameter(0).toEqualTypeOf<SendInput>();
    expectTypeOf(action.execute).returns.toEqualTypeOf<
      SendResult | Promise<SendResult>
    >();
  });

  it("types conditional confirmation against the input", () => {
    const action = defineAgentAction({
      ...validAction,
      confirmation: {
        type: "conditional",
        evaluate: (input) => input.message !== undefined,
      },
    });
    expectTypeOf(action.confirmation).toEqualTypeOf<
      AgentConfirmationRule<SendInput> | undefined
    >();
  });

  it("defaults omitted metadata: name from id, empty input schema", () => {
    const action = defineAgentAction({
      id: "save-draft",
      description: "Save the current draft",
      execute: () => ({ saved: true }),
    });
    expect(action.name).toBe("Save draft");
    // No input declared: only the empty object parses.
    expect(action.input).toBeUndefined();
  });

  it("humanizeId derives names from ids", async () => {
    const { humanizeId, emptyInputSchema } = await import("./index.js");
    expect(humanizeId("save-draft")).toBe("Save draft");
    expect(humanizeId("billing.invoice")).toBe("Invoice");
    expect(humanizeId("create-line-item")).toBe("Create line item");
    expect(emptyInputSchema.parse({})).toEqual({});
    expect(emptyInputSchema.parse(undefined)).toEqual({});
    expectInvalidInput(() => emptyInputSchema.parse({ nope: 1 }));
  });

  it("rejects a missing execute function", () => {
    expectInvalidInput(() =>
      defineAgentAction({
        ...validAction,
        execute: undefined as unknown as (input: SendInput) => void,
      }),
    );
  });

  it("rejects preconditions without a check function", () => {
    expectInvalidInput(() =>
      defineAgentAction({
        ...validAction,
        preconditions: [
          {
            id: "invoice-is-draft",
            description: "The invoice must still be a draft",
            check: undefined as unknown as () => boolean,
          },
        ],
      }),
    );
  });

  it("supports typed previews", () => {
    interface SendPreview extends AgentActionPreview {
      readonly recipient: string;
    }
    const action = defineAgentAction<SendInput, { sent: true }, SendPreview>({
      ...validAction,
      execute: () => ({ sent: true }),
      preview: (input) => ({
        summary: `Send with message ${input.message ?? "(none)"}`,
        recipient: "billing@acme.co",
      }),
    });
    expectTypeOf(action).toEqualTypeOf<
      AgentActionDefinition<SendInput, { sent: true }, SendPreview>
    >();
  });
});

describe("defineAgentEvent", () => {
  it("returns a frozen definition", () => {
    const event = defineAgentEvent({
      id: "status-changed",
      name: "Status changed",
      description: "The invoice status changed",
    });
    expect(Object.isFrozen(event)).toBe(true);
  });

  it("rejects malformed ids", () => {
    expectInvalidInput(() =>
      defineAgentEvent({ id: ".bad", name: "x", description: "y" }),
    );
  });
});
