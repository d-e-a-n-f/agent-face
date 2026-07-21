import type {
  AgentModelAdapter,
  AgentModelRequest,
  AgentModelResponse,
  AssistantContentPart,
} from "@agentface/assistant";

/**
 * TEST FIXTURE — never active outside e2e. The real widget default is the
 * LLM endpoint; this adapter exists solely so Playwright can drive the
 * assistant deterministically (ADR 0006: no real model calls in CI). It is
 * bundled only behind NEXT_PUBLIC_AGENTFACE_MOCK=1, which only the
 * Playwright web server sets.
 *
 * Stateless: every step is derived by pattern-matching the conversation
 * (which tools exist, which tool results have already come back), so it
 * survives multiple sends, either confirmation outcome, and page changes.
 * Three scripted scenarios, selected by the user's instruction text:
 *
 * 1. Invoice: "add a consulting line item … prepare for sending"
 * 2. Product publication (incl. navigation): the Sterling share-class chain
 * 3. Cross-page fill: read the top customer on one screen, navigate, and
 *    use it on the invoice screen
 */

type ToolResult = Extract<AssistantContentPart, { type: "tool-result" }>;

function allResults(request: AgentModelRequest): readonly ToolResult[] {
  return request.messages.flatMap((message) =>
    message.content.filter(
      (part): part is ToolResult => part.type === "tool-result",
    ),
  );
}

function findResult(
  request: AgentModelRequest,
  suffix: string,
): ToolResult | undefined {
  return allResults(request).find((part) => part.toolName.endsWith(suffix));
}

function findTool(
  request: AgentModelRequest,
  suffix: string,
): string | undefined {
  return request.tools.find((tool) => tool.name.endsWith(suffix))?.name;
}

function userInstruction(request: AgentModelRequest): string {
  for (const message of request.messages) {
    if (message.role === "user") {
      const text = message.content.find((part) => part.type === "text");
      if (text !== undefined && text.type === "text") {
        return text.text.toLowerCase();
      }
    }
  }
  return "";
}

function call(
  toolName: string,
  input: unknown,
  text?: string,
): AgentModelResponse {
  return {
    ...(text !== undefined ? { text } : {}),
    toolCalls: [
      { toolCallId: `demo_${toolName}`, toolName, input: input as never },
    ],
    stopReason: "tool-use",
  };
}

function finish(text: string): AgentModelResponse {
  return { text, toolCalls: [], stopReason: "end-turn" };
}

function wasDeclined(result: ToolResult | undefined): boolean {
  return (
    typeof result?.result === "object" &&
    result.result !== null &&
    (result.result as { declined?: boolean }).declined === true
  );
}

/** Scenario 1: the invoice flow (Phase-6 acceptance). */
function invoiceStep(request: AgentModelRequest): AgentModelResponse {
  const sendResult = findResult(request, "__send");
  if (sendResult !== undefined) {
    return finish(
      wasDeclined(sendResult)
        ? "Understood — the invoice was not sent."
        : "All done — the invoice was sent after your confirmation.",
    );
  }
  if (findResult(request, "__add-line-item") !== undefined) {
    const send = findTool(request, "__send");
    if (send !== undefined) {
      return call(
        send,
        {},
        "Line item added. Preparing the invoice for sending — please confirm.",
      );
    }
  }
  const addLineItem = findTool(request, "__add-line-item");
  if (addLineItem !== undefined) {
    return call(
      addLineItem,
      { description: "Consulting", quantity: 1, unitPrice: 100 },
      "Adding the consulting line item.",
    );
  }
  return finish(
    "The demo adapter drives the invoice example — open /examples/invoice.",
  );
}

/** Scenario 2: the Sterling share-class chain, navigating there if needed. */
function publicationStep(request: AgentModelRequest): AgentModelResponse {
  const createResult = findResult(request, "__create-share-class");
  // Action tool results wrap the execution outcome:
  // { outcome: { status, result: <the action's return value> } }.
  const shareClassId =
    typeof createResult?.result === "object" && createResult.result !== null
      ? String(
          (
            createResult.result as {
              outcome?: { result?: { shareClassId?: string } };
            }
          ).outcome?.result?.shareClassId ?? "",
        )
      : "";

  if (createResult === undefined) {
    const create = findTool(request, "__create-share-class");
    if (create === undefined) {
      const navigate = findTool(request, "__navigate");
      if (navigate !== undefined) {
        return call(
          navigate,
          { path: "/examples/product-publication" },
          "Opening the product publication screen.",
        );
      }
      return finish("Open /examples/product-publication and try again.");
    }
    return call(
      create,
      { name: "Sterling Institutional", currency: "GBP" },
      "Creating the Sterling institutional share class under Global Credit Fund II.",
    );
  }

  const steps: readonly {
    readonly suffix: string;
    readonly input: (id: string) => unknown;
    readonly narration: string;
  }[] = [
    {
      suffix: "__set-minimum-subscription",
      input: (id) => ({ shareClassId: id, minimumSubscription: 5_000_000 }),
      narration: "Overriding the minimum subscription to £5,000,000.",
    },
    {
      suffix: "__apply-fee-schedule",
      input: (id) => ({ shareClassId: id, feeScheduleId: "fee-institutional" }),
      narration: "Applying the institutional fee schedule.",
    },
    {
      suffix: "__attach-document",
      input: (id) => ({
        shareClassId: id,
        documentId: "doc-supplement-2026-06",
      }),
      narration: "Attaching the latest supplement (June 2026).",
    },
    {
      suffix: "__run-validation",
      input: (id) => ({ shareClassId: id }),
      narration: "Running compliance validation.",
    },
    {
      suffix: "__request-approval",
      input: (id) => ({ shareClassId: id, approver: "Sarah" }),
      narration: "Sending to Sarah for approval.",
    },
    {
      suffix: "__approve-share-class",
      input: (id) => ({ shareClassId: id }),
      narration: "Recording Sarah's approval — this needs your confirmation.",
    },
    {
      suffix: "__publish-share-class",
      input: (id) => ({
        shareClassId: id,
        workspaceIds: ["apollo", "wilshire"],
      }),
      narration:
        "Publishing to Apollo and Wilshire — this needs your confirmation.",
    },
  ];

  for (const step of steps) {
    const result = findResult(request, step.suffix);
    if (result === undefined) {
      const tool = findTool(request, step.suffix);
      if (tool === undefined) {
        return finish(`The ${step.suffix} capability is not available here.`);
      }
      return call(tool, step.input(shareClassId), step.narration);
    }
    if (wasDeclined(result)) {
      return finish("Understood — stopping there. Nothing further was done.");
    }
  }

  const publishResult = findResult(request, "__publish-share-class");
  const payload =
    typeof publishResult?.result === "object" && publishResult.result !== null
      ? (publishResult.result as {
          outcome?: {
            result?: {
              results?: readonly {
                workspaceId: string;
                status: string;
                error?: string;
              }[];
            };
          };
        })
      : undefined;
  const perWorkspace = payload?.outcome?.result?.results ?? [];
  const published = perWorkspace.filter(
    (result) => result.status === "published",
  );
  const failed = perWorkspace.filter((result) => result.status === "failed");
  return finish(
    `Done. Sterling Institutional is validated, approved by Sarah, and published to ${published
      .map((result) => result.workspaceId)
      .join(", ")}.${
      failed.length > 0
        ? ` Publication to ${failed
            .map((result) => result.workspaceId)
            .join(", ")} FAILED: ${failed
            .map((result) => result.error)
            .join("; ")} — the successful publications stand; nothing was rolled back.`
        : ""
    }`,
  );
}

/** Scenario 3: cross-page fill — read the top customer, navigate, use it. */
function crossPageStep(request: AgentModelRequest): AgentModelResponse {
  if (findResult(request, "__add-line-item") !== undefined) {
    return finish(
      "Done — I added the consulting line item for Wilshire Group, our highest-value active customer, using what I read on the customers screen.",
    );
  }

  const readResult = findResult(request, "read_resource");
  if (readResult !== undefined) {
    const addLineItem = findTool(request, "__add-line-item");
    if (addLineItem === undefined) {
      const navigate = findTool(request, "__navigate");
      if (navigate !== undefined) {
        return call(
          navigate,
          { path: "/examples/invoice" },
          "Found the top customer. Opening the invoice screen.",
        );
      }
      return finish("I need the invoice screen to continue.");
    }
    // Back on the invoice screen with the customer data still in context.
    const value =
      typeof readResult.result === "object" && readResult.result !== null
        ? (
            readResult.result as {
              value?: readonly { name?: string; annualValue?: number }[];
            }
          ).value
        : undefined;
    const top = [...(value ?? [])].sort(
      (a, b) => (b.annualValue ?? 0) - (a.annualValue ?? 0),
    )[0];
    return call(
      addLineItem,
      {
        description: `Consulting for ${top?.name ?? "top customer"}`,
        quantity: 1,
        unitPrice: 1200,
      },
      `The highest-value active customer is ${top?.name ?? "unknown"}. Adding the line item on the invoice.`,
    );
  }

  if (findResult(request, "__apply-filter") !== undefined) {
    const match = /"instanceId": "(customers\.table[^"]*)"/.exec(
      request.system,
    );
    return call(
      "read_resource",
      { instanceId: match?.[1] ?? "", resourceId: "results" },
      "Reading the filtered customers.",
    );
  }

  const applyFilter = findTool(request, "__apply-filter");
  if (applyFilter !== undefined) {
    return call(
      applyFilter,
      { status: "active", minimumValue: 50_000 },
      "Filtering to active customers over £50,000.",
    );
  }
  return finish("Start on /examples/customer-table for the cross-page demo.");
}


/** Scenario 4: fill the onboarding form section by section; save, don't submit. */
function onboardingStep(request: AgentModelRequest): AgentModelResponse {
  if (findResult(request, "__save-draft") !== undefined) {
    return finish(
      "Draft saved. I have filled in the company, address, and contact sections — review and edit anything, then submit when you're ready. I did NOT submit it, as requested.",
    );
  }
  const steps: readonly {
    readonly suffix: string;
    readonly input: unknown;
    readonly narration: string;
  }[] = [
    {
      suffix: "__fill-form",
      input: {
        company: {
          name: "Northshore Limited",
          registrationNumber: "09876543",
          country: "United Kingdom",
        },
        address: {
          street: "1 Harbour Street",
          city: "London",
          postcode: "EC2A 4BX",
        },
        contact: { name: "Maya Chen", email: "maya@northshore.example" },
      },
      narration: "Filling in the onboarding form.",
    },
    {
      suffix: "__save-draft",
      input: {},
      narration: "Saving the draft — not submitting.",
    },
  ];
  for (const step of steps) {
    if (findResult(request, step.suffix) === undefined) {
      const tool = findTool(request, step.suffix);
      if (tool === undefined) {
        const navigate = findTool(request, "__navigate");
        if (navigate !== undefined) {
          return call(
            navigate,
            { path: "/examples/onboarding" },
            "Opening the onboarding screen.",
          );
        }
        return finish("Open /examples/onboarding and try again.");
      }
      return call(tool, step.input, step.narration);
    }
  }
  return finish("Draft saved.");
}

export function createE2eMockAdapter(): AgentModelAdapter {
  return {
    complete(request: AgentModelRequest): Promise<AgentModelResponse> {
      const instruction = userInstruction(request);
      if (instruction.includes("share class")) {
        return Promise.resolve(publicationStep(request));
      }
      if (instruction.includes("northshore")) {
        return Promise.resolve(onboardingStep(request));
      }
      if (instruction.includes("highest-value")) {
        return Promise.resolve(crossPageStep(request));
      }
      return Promise.resolve(invoiceStep(request));
    },
  };
}
