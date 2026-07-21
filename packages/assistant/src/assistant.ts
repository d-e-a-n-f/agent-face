import type { JsonObject, JsonValue } from "@agentface/core";
import { isAgentFaceError } from "@agentface/core";
import type {
  AgentDiscoveredSurface,
  AgentRuntime,
  PreparedAgentAction,
  PrincipalContext,
} from "@agentface/runtime";
import type {
  AgentModelAdapter,
  AgentModelToolCall,
  AgentModelToolDefinition,
  AssistantContentPart,
  AssistantMessage,
} from "./types.js";

/** The user's decision on a prepared action awaiting confirmation. */
export type ConfirmationDecision = "confirmed" | "declined";

/** Options for {@link createAssistant}. */
export interface CreateAssistantOptions {
  readonly runtime: AgentRuntime;
  readonly adapter: AgentModelAdapter;
  /**
   * Called when a prepared action requires user confirmation. Resolve
   * `"confirmed"` to execute, `"declined"` to refuse. Confirmation always
   * belongs to the user — it is never exposed to the model as a tool.
   * Defaults to declining every request (safe for headless use).
   */
  readonly requestConfirmation?: (
    prepared: PreparedAgentAction,
  ) => Promise<ConfirmationDecision>;
  /** Prepended to the generated surface context. */
  readonly systemPrompt?: string;
  /** Maximum model round-trips per `send`. Default 12. */
  readonly maxIterations?: number;
  /** Principals the assistant's runtime operations run as. */
  readonly principals?: PrincipalContext;
  /** Notified whenever the conversation changes (for UI binding). */
  readonly onUpdate?: () => void;
}

/** A conversational assistant bound to one AgentFace runtime. */
export interface AgentFaceAssistant {
  /** Sends a user instruction and runs the tool loop until the model finishes. */
  send(text: string): Promise<readonly AssistantMessage[]>;
  getMessages(): readonly AssistantMessage[];
  reset(): void;
}

const DEFAULT_SYSTEM_PROMPT = `You are an assistant operating a software application on the user's behalf through AgentFace, the application's typed agent interface.

Rules:
- Only interact with the application through the provided tools. Never invent tool results or claim an action succeeded without a tool result showing it.
- Read resources before acting when the current state matters.
- Some actions require the user's explicit confirmation; the application will ask them directly. If a result says the user declined, respect that — do not retry.
- If a tool returns an error, explain it to the user plainly and adjust; do not retry the identical call.
- If the app exposes help/knowledge capabilities, search them FIRST when the user asks how something works, what a rule is, or why something happened — and ground your answer in what you find. When the user asks how to do something you can do for them, explain briefly and offer to do it (or do it, if they asked for the outcome).
- Keep final answers short and concrete: what you did, what changed, and anything that needs the user's attention.`;

const EMPTY_OBJECT_SCHEMA: JsonObject = {
  type: "object",
  properties: {},
  additionalProperties: false,
};

function sanitizeToolName(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

interface ActionBinding {
  readonly instanceId: string;
  readonly actionId: string;
}

interface ToolSurface {
  readonly definitions: readonly AgentModelToolDefinition[];
  readonly actionBindings: ReadonlyMap<string, ActionBinding>;
}

function describeSurfaces(
  surfaces: readonly AgentDiscoveredSurface[],
): JsonValue {
  return surfaces.map((surface) => ({
    instanceId: surface.instance.instanceId,
    face: {
      id: surface.instance.face.id,
      name: surface.instance.face.name ?? surface.instance.face.id,
      description: surface.instance.face.description,
    },
    ...(surface.instance.entity !== undefined
      ? {
          entity: {
            type: surface.instance.entity.type,
            id: surface.instance.entity.id,
            ...(surface.instance.entity.displayName !== undefined
              ? { displayName: surface.instance.entity.displayName }
              : {}),
          },
        }
      : {}),
    revision: surface.instance.revision,
    resources: surface.resources.map((resource) => ({
      id: resource.id,
      name: resource.name,
      description: resource.description,
    })),
    actions: surface.actions.map((action) => ({
      id: action.id,
      name: action.name,
      description: action.description,
      confirmationPolicy: action.confirmationPolicy,
    })),
  }));
}

function buildTools(surfaces: readonly AgentDiscoveredSurface[]): ToolSurface {
  const definitions: AgentModelToolDefinition[] = [
    {
      name: "discover_surfaces",
      description:
        "List the currently mounted surfaces with their resources and actions. Use after actions that may have changed what is available.",
      inputSchema: EMPTY_OBJECT_SCHEMA,
    },
    {
      name: "read_resource",
      description:
        "Read the current value of a resource on a mounted surface.",
      inputSchema: {
        type: "object",
        properties: {
          instanceId: { type: "string", description: "The surface instance id" },
          resourceId: { type: "string", description: "The resource id" },
        },
        required: ["instanceId", "resourceId"],
        additionalProperties: false,
      },
    },
  ];
  const actionBindings = new Map<string, ActionBinding>();

  for (const surface of surfaces) {
    for (const action of surface.actions) {
      let name = sanitizeToolName(
        `${surface.instance.face.id}__${action.id}`,
      );
      while (actionBindings.has(name)) {
        name = sanitizeToolName(`${name}_2`);
      }
      actionBindings.set(name, {
        instanceId: surface.instance.instanceId,
        actionId: action.id,
      });
      const entityLabel =
        surface.instance.entity?.displayName ?? surface.instance.entity?.id;
      definitions.push({
        name,
        description: `${action.name} — ${action.description} (surface "${surface.instance.face.name ?? surface.instance.face.id}"${entityLabel !== undefined ? `, ${entityLabel}` : ""}). ${
          action.confirmationPolicy === "never"
            ? ""
            : "May require the user's explicit confirmation before executing."
        }`.trim(),
        inputSchema: action.inputSchema ?? EMPTY_OBJECT_SCHEMA,
      });
    }
  }
  return { definitions, actionBindings };
}

function errorResult(caught: unknown): { result: JsonValue; isError: true } {
  if (isAgentFaceError(caught)) {
    return { result: caught.toJSON() as unknown as JsonValue, isError: true };
  }
  return {
    result: {
      code: "EXECUTION_FAILED",
      message: caught instanceof Error ? caught.message : String(caught),
    },
    isError: true,
  };
}

/**
 * Creates an assistant that lets a model operate an AgentFace runtime.
 *
 * The model never touches application closures: every tool call goes through
 * the runtime's policy-mediated lifecycle, and actions that require
 * confirmation pause for the user's decision via `requestConfirmation` —
 * confirmation is never a model tool.
 *
 * @example
 * ```ts
 * const assistant = createAssistant({
 *   runtime,
 *   adapter: createMockModelAdapter(script),
 *   requestConfirmation: async (prepared) => await askUser(prepared),
 * });
 * await assistant.send("Add a £100 consulting line item.");
 * ```
 */
export function createAssistant(
  options: CreateAssistantOptions,
): AgentFaceAssistant {
  const {
    runtime,
    adapter,
    systemPrompt = DEFAULT_SYSTEM_PROMPT,
    maxIterations = 12,
    principals,
    onUpdate,
  } = options;
  const requestConfirmation =
    options.requestConfirmation ?? (async () => "declined" as const);

  let messages: AssistantMessage[] = [];

  function append(message: AssistantMessage): void {
    messages = [...messages, message];
    onUpdate?.();
  }

  async function runActionTool(
    binding: ActionBinding,
    input: JsonValue,
  ): Promise<{ result: JsonValue; isError?: boolean }> {
    let prepared: PreparedAgentAction;
    try {
      prepared = await runtime.prepareAction({
        instanceId: binding.instanceId,
        actionId: binding.actionId,
        input,
        ...(principals !== undefined ? { principals } : {}),
      });
    } catch (caught) {
      return errorResult(caught);
    }

    if (prepared.confirmationRequired) {
      const decision = await requestConfirmation(prepared);
      if (decision === "declined") {
        return {
          result: {
            declined: true,
            message: "The user declined this action. Do not retry it.",
            ...(prepared.preview !== undefined
              ? { preview: prepared.preview.summary }
              : {}),
          },
        };
      }
      try {
        await runtime.confirmAction({
          preparationId: prepared.preparationId,
          ...(principals !== undefined ? { principals } : {}),
        });
      } catch (caught) {
        return errorResult(caught);
      }
    }

    try {
      const execution = await runtime.executeAction({
        preparationId: prepared.preparationId,
        ...(principals !== undefined ? { principals } : {}),
      });
      return {
        result: {
          ...(prepared.preview !== undefined
            ? { preview: prepared.preview.summary }
            : {}),
          outcome: execution.result,
        } as JsonValue,
        ...(execution.result.status === "failed" ? { isError: true } : {}),
      };
    } catch (caught) {
      return errorResult(caught);
    }
  }

  async function runToolCall(
    call: AgentModelToolCall,
    tools: ToolSurface,
  ): Promise<AssistantContentPart> {
    let outcome: { result: JsonValue; isError?: boolean };
    if (call.toolName === "discover_surfaces") {
      const discovery = await runtime.discover();
      outcome = { result: describeSurfaces(discovery.surfaces) };
    } else if (call.toolName === "read_resource") {
      const input = call.input as { instanceId?: string; resourceId?: string };
      try {
        const read = await runtime.readResource({
          instanceId: input.instanceId ?? "",
          resourceId: input.resourceId ?? "",
          ...(principals !== undefined ? { principals } : {}),
        });
        outcome = {
          result: {
            value: read.value,
            ...(read.revision !== undefined ? { revision: read.revision } : {}),
          },
        };
      } catch (caught) {
        outcome = errorResult(caught);
      }
    } else {
      const binding = tools.actionBindings.get(call.toolName);
      outcome =
        binding === undefined
          ? {
              result: {
                code: "ACTION_NOT_FOUND",
                message: `Unknown tool "${call.toolName}"`,
              },
              isError: true,
            }
          : await runActionTool(binding, call.input);
    }
    return {
      type: "tool-result",
      toolCallId: call.toolCallId,
      toolName: call.toolName,
      result: outcome.result,
      ...(outcome.isError === true ? { isError: true } : {}),
    };
  }

  async function send(text: string): Promise<readonly AssistantMessage[]> {
    const startIndex = messages.length;
    append({ role: "user", content: [{ type: "text", text }] });

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      // Rebuilt every round: executed actions change availability,
      // revisions, and values.
      const discovery = await runtime.discover();
      const tools = buildTools(discovery.surfaces);
      const system = `${systemPrompt}\n\n## Currently mounted surfaces\n${JSON.stringify(describeSurfaces(discovery.surfaces), null, 2)}`;

      const response = await adapter.complete({
        system,
        messages,
        tools: tools.definitions,
      });

      const assistantParts: AssistantContentPart[] = [
        ...(response.text !== undefined && response.text.length > 0
          ? [{ type: "text", text: response.text } as const]
          : []),
        ...response.toolCalls.map(
          (call): AssistantContentPart => ({
            type: "tool-call",
            toolCallId: call.toolCallId,
            toolName: call.toolName,
            input: call.input,
          }),
        ),
      ];
      if (assistantParts.length > 0) {
        append({ role: "assistant", content: assistantParts });
      }

      if (response.toolCalls.length === 0) {
        break;
      }

      // Actions run sequentially (order matters); all results return in one
      // user message.
      const results: AssistantContentPart[] = [];
      for (const call of response.toolCalls) {
        results.push(await runToolCall(call, tools));
      }
      append({ role: "user", content: results });
    }

    return messages.slice(startIndex);
  }

  return {
    send,
    getMessages: () => messages,
    reset: () => {
      messages = [];
      onUpdate?.();
    },
  };
}
