import type { JsonValue } from "@agentface/core";
import { isAgentFaceError } from "@agentface/core";
import type {
  AgentRuntime,
  PreparedAgentAction,
  PrincipalContext,
} from "@agentface/runtime";
import type { ToolSet } from "ai";
import { dynamicTool, jsonSchema } from "ai";

/** The user's decision on a prepared action awaiting confirmation. */
export type AISDKConfirmationDecision = "confirmed" | "declined";

/** Options for {@link createAISDKTools}. */
export interface CreateAISDKToolsOptions {
  readonly runtime: AgentRuntime;
  /**
   * Principals every runtime operation runs as. The function form is
   * resolved per operation, so login/logout applies immediately.
   */
  readonly principals?: PrincipalContext | (() => PrincipalContext);
  /**
   * Called when a prepared action requires the user's confirmation.
   * Confirmation belongs to the user — it is never delegated to the model.
   * **Defaults to declining every request** (safe for headless use); wire
   * this to your UI to approve actions.
   */
  readonly requestConfirmation?: (
    prepared: PreparedAgentAction,
  ) => Promise<AISDKConfirmationDecision>;
}

/** Model providers cap tool names at 64 characters. */
const MAX_TOOL_NAME_LENGTH = 64;

function sanitizeToolName(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, MAX_TOOL_NAME_LENGTH);
}

function uniqueToolName(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) {
    return base;
  }
  for (let attempt = 2; ; attempt += 1) {
    const suffix = `_${attempt}`;
    const candidate = `${base.slice(0, MAX_TOOL_NAME_LENGTH - suffix.length)}${suffix}`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
}

function errorPayload(caught: unknown): JsonValue {
  if (isAgentFaceError(caught)) {
    return caught.toJSON() as unknown as JsonValue;
  }
  return {
    code: "EXECUTION_FAILED",
    message: caught instanceof Error ? caught.message : String(caught),
  };
}

/**
 * Exposes an AgentFace runtime as a Vercel AI SDK {@link ToolSet}, for
 * teams running their own `generateText`/`streamText`/`Agent` loop instead
 * of the shipped AgentFace assistant.
 *
 * Every tool call still goes through the full policy-mediated lifecycle —
 * validation, availability, preconditions, policy, preview, confirmation,
 * revision checks. Discovery is policy-filtered, so a denied action never
 * becomes a tool. Actions that require confirmation resolve through
 * `requestConfirmation` (default: declined) — the model can never approve
 * its own actions.
 *
 * The returned ToolSet is a **snapshot** of currently mounted surfaces.
 * Executed actions change what is available, so rebuild the tools per
 * model round (the same rule the shipped assistant follows).
 *
 * @example
 * ```ts
 * const tools = await createAISDKTools({ runtime, principals: { user } });
 * const result = await generateText({
 *   model: anthropic("claude-opus-4-8"),
 *   system: "Operate the application on the user's behalf.",
 *   prompt: instruction,
 *   tools,
 * });
 * ```
 */
export async function createAISDKTools(
  options: CreateAISDKToolsOptions,
): Promise<ToolSet> {
  const { runtime } = options;
  const requestConfirmation =
    options.requestConfirmation ?? (async () => "declined" as const);

  function currentPrincipals(): PrincipalContext | undefined {
    return typeof options.principals === "function"
      ? options.principals()
      : options.principals;
  }

  async function runAction(
    instanceId: string,
    actionId: string,
    input: unknown,
  ): Promise<JsonValue> {
    const principals = currentPrincipals();
    let prepared: PreparedAgentAction;
    try {
      prepared = await runtime.prepareAction({
        instanceId,
        actionId,
        input,
        ...(principals !== undefined ? { principals } : {}),
      });
    } catch (caught) {
      return errorPayload(caught);
    }
    if (prepared.confirmationRequired) {
      const decision = await requestConfirmation(prepared);
      if (decision === "declined") {
        return {
          declined: true,
          message: "The user declined this action. Do not retry it.",
          ...(prepared.preview !== undefined
            ? { preview: prepared.preview.summary }
            : {}),
        };
      }
      try {
        await runtime.confirmAction({
          preparationId: prepared.preparationId,
          ...(principals !== undefined ? { principals } : {}),
        });
      } catch (caught) {
        return errorPayload(caught);
      }
    }
    try {
      const execution = await runtime.executeAction({
        preparationId: prepared.preparationId,
        ...(principals !== undefined ? { principals } : {}),
      });
      return {
        ...(prepared.preview !== undefined
          ? { preview: prepared.preview.summary }
          : {}),
        outcome: execution.result,
      } as JsonValue;
    } catch (caught) {
      return errorPayload(caught);
    }
  }

  const principals = currentPrincipals();
  const discovery = await runtime.discover({
    ...(principals !== undefined ? { principals } : {}),
  });

  const tools: ToolSet = {
    read_resource: dynamicTool({
      description: "Read the current value of a resource on a mounted surface.",
      inputSchema: jsonSchema({
        type: "object",
        properties: {
          instanceId: { type: "string", description: "The surface instance id" },
          resourceId: { type: "string", description: "The resource id" },
        },
        required: ["instanceId", "resourceId"],
        additionalProperties: false,
      }),
      execute: async (input) => {
        const read = input as { instanceId?: string; resourceId?: string };
        const current = currentPrincipals();
        try {
          const result = await runtime.readResource({
            instanceId: read.instanceId ?? "",
            resourceId: read.resourceId ?? "",
            ...(current !== undefined ? { principals: current } : {}),
          });
          return { value: result.value, revision: result.revision };
        } catch (caught) {
          return errorPayload(caught);
        }
      },
    }),
  };

  const taken = new Set<string>(Object.keys(tools));
  for (const surface of discovery.surfaces) {
    for (const action of surface.actions) {
      const name = uniqueToolName(
        sanitizeToolName(`${surface.instance.face.id}__${action.id}`),
        taken,
      );
      taken.add(name);
      const entityLabel =
        surface.instance.entity?.displayName ?? surface.instance.entity?.id;
      const instanceId = surface.instance.instanceId;
      const actionId = action.id;
      tools[name] = dynamicTool({
        description: `${action.name} — ${action.description} (surface "${surface.instance.face.name ?? surface.instance.face.id}"${entityLabel !== undefined ? `, ${entityLabel}` : ""}). ${
          action.confirmationPolicy === "never"
            ? ""
            : "May require the user's explicit confirmation before executing."
        }`.trim(),
        inputSchema: jsonSchema(action.inputSchema ?? {
          type: "object",
          properties: {},
          additionalProperties: false,
        }),
        execute: (input) => runAction(instanceId, actionId, input),
      });
    }
  }
  return tools;
}
