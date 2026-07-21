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
 * Portal scenarios, selected by the user's instruction text:
 *
 * 1. "onboard northshore" — navigate to the client's onboarding form, fill
 *    it through the real form state, save a draft, do NOT submit.
 * 2. "invoice for wilshire" — navigate to the client, create an invoice,
 *    open it, add the line item, send (confirmation-gated).
 * 3. "share class" — the publication chain on /portal/products.
 * 4. "discount" question — search the app's help, read the article, answer
 *    grounded in it.
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

/** Unwraps the action-tool result envelope: { outcome: { result: … } }. */
function outcomeOf<T>(result: ToolResult | undefined): T | undefined {
  if (typeof result?.result !== "object" || result.result === null) {
    return undefined;
  }
  return (result.result as { outcome?: { result?: T } }).outcome?.result;
}

function navigateOr(
  request: AgentModelRequest,
  path: string,
  narration: string,
  otherwise: string,
): AgentModelResponse {
  const navigate = findTool(request, "__navigate");
  if (navigate !== undefined) {
    return call(navigate, { path }, narration);
  }
  return finish(otherwise);
}

/** Scenario 1: onboard Northshore — navigate, fill the real form, save. */
function onboardingStep(request: AgentModelRequest): AgentModelResponse {
  if (findResult(request, "__save-draft") !== undefined) {
    return finish(
      "Draft saved. I filled in the company, address, and contact sections — review and edit anything, then submit when you're ready. I did NOT submit it, as requested.",
    );
  }
  if (findResult(request, "__fill-form") !== undefined) {
    const saveDraft = findTool(request, "__save-draft");
    if (saveDraft !== undefined) {
      return call(saveDraft, {}, "Saving the draft — not submitting.");
    }
  }
  const fillForm = findTool(request, "__fill-form");
  if (fillForm === undefined) {
    return navigateOr(
      request,
      "/portal/clients/northshore/onboarding",
      "Opening Northshore Limited's onboarding form.",
      "Open the client's onboarding screen and try again.",
    );
  }
  return call(
    fillForm,
    {
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
    "Filling in the onboarding form.",
  );
}

/** Scenario 2: invoice Wilshire — client page → create → open → add → send. */
function invoiceStep(request: AgentModelRequest): AgentModelResponse {
  const sendResult = findResult(request, "__send");
  if (sendResult !== undefined) {
    return finish(
      wasDeclined(sendResult)
        ? "Understood — the invoice was not sent. It remains a draft."
        : "Done — the invoice for Wilshire Group was created, the consulting day added, and it was sent after your confirmation.",
    );
  }

  if (findResult(request, "__add-line-item") !== undefined) {
    const send = findTool(request, "__send");
    if (send !== undefined) {
      return call(
        send,
        {},
        "Line item added. Sending the invoice — please confirm.",
      );
    }
  }

  const createResult = findResult(request, "__create-invoice");
  if (createResult !== undefined) {
    const invoiceId = outcomeOf<{ invoiceId?: string }>(createResult)?.invoiceId;
    const addLineItem = findTool(request, "__add-line-item");
    if (addLineItem === undefined) {
      return navigateOr(
        request,
        `/portal/invoices/${invoiceId ?? ""}`,
        "Invoice created. Opening it.",
        "Open the new invoice to continue.",
      );
    }
    return call(
      addLineItem,
      { description: "Consulting (day)", quantity: 1, unitPrice: 1200 },
      "Adding the consulting day.",
    );
  }

  const createInvoice = findTool(request, "__create-invoice");
  if (createInvoice === undefined) {
    return navigateOr(
      request,
      "/portal/clients/wilshire",
      "Opening Wilshire Group.",
      "Open the client's page to continue.",
    );
  }
  return call(createInvoice, {}, "Creating a new draft invoice.");
}

/** Scenario 3: the Sterling share-class chain on /portal/products. */
function publicationStep(request: AgentModelRequest): AgentModelResponse {
  const createResult = findResult(request, "__create-share-class");
  const shareClassId =
    outcomeOf<{ shareClassId?: string }>(createResult)?.shareClassId ?? "";

  if (createResult === undefined) {
    const create = findTool(request, "__create-share-class");
    if (create === undefined) {
      return navigateOr(
        request,
        "/portal/products",
        "Opening the products screen.",
        "Open /portal/products and try again.",
      );
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

  const publishOutcome = outcomeOf<{
    results?: readonly {
      workspaceId: string;
      status: string;
      error?: string;
    }[];
  }>(findResult(request, "__publish-share-class"));
  const perWorkspace = publishOutcome?.results ?? [];
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

/** Scenario 4: a "how does X work" question — help-grounded answer. */
function helpStep(request: AgentModelRequest): AgentModelResponse {
  const readResult = findResult(request, "__read-help-article");
  if (readResult !== undefined) {
    const article = outcomeOf<{ title?: string; body?: string }>(readResult);
    const body = article?.body ?? "";
    const summary =
      body.split(". ").slice(0, 3).join(". ") || "See the help article.";
    return finish(
      `From the app's documentation ("${article?.title ?? "Help"}"): ${summary}${summary.endsWith(".") ? "" : "."} Want me to apply a discount for you?`,
    );
  }
  const searchResult = findResult(request, "__search-help");
  if (searchResult !== undefined) {
    const results = outcomeOf<{
      results?: readonly { articleId: string }[];
    }>(searchResult);
    const articleId = results?.results?.[0]?.articleId;
    const read = findTool(request, "__read-help-article");
    if (articleId !== undefined && read !== undefined) {
      return call(read, { articleId }, "Reading the relevant article.");
    }
    return finish("I couldn't find anything relevant in the app's help.");
  }
  const search = findTool(request, "__search-help");
  if (search !== undefined) {
    return call(
      search,
      { query: "invoice discounts approval" },
      "Checking the app's documentation.",
    );
  }
  return finish("This app doesn't expose help content here.");
}

export function createE2eMockAdapter(): AgentModelAdapter {
  return {
    complete(request: AgentModelRequest): Promise<AgentModelResponse> {
      const instruction = userInstruction(request);
      if (instruction.includes("northshore")) {
        return Promise.resolve(onboardingStep(request));
      }
      if (instruction.includes("share class")) {
        return Promise.resolve(publicationStep(request));
      }
      if (instruction.includes("invoice for wilshire")) {
        return Promise.resolve(invoiceStep(request));
      }
      if (instruction.includes("discount")) {
        return Promise.resolve(helpStep(request));
      }
      return Promise.resolve(
        finish(
          "The demo adapter supports the Portal scenarios listed on /portal.",
        ),
      );
    },
  };
}
