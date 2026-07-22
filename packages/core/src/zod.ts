import { z } from "zod";
import { AgentFaceError } from "./errors.js";
import type { JsonObject } from "./json.js";
import type { AgentInputSchema } from "./schema.js";

/**
 * Adapts a Zod schema to the {@link AgentInputSchema} abstraction. Import
 * from `@agentface/core/zod` — the main entry point has no Zod dependency.
 *
 * @throws the returned schema's `parse` throws an `AgentFaceError` with code
 * `INVALID_INPUT`; `details.issues` lists each failing path.
 *
 * @example
 * ```ts
 * import { fromZod } from "@agentface/core/zod";
 * import { z } from "zod";
 *
 * const input = fromZod(z.object({ message: z.string().optional() }));
 * const parsed = input.parse({ message: "hi" }); // { message?: string }
 * ```
 */
export function fromZod<TSchema extends z.ZodType>(
  schema: TSchema,
): AgentInputSchema<z.output<TSchema>> {
  return {
    parse(input: unknown): z.output<TSchema> {
      const result = schema.safeParse(input);
      if (!result.success) {
        throw new AgentFaceError({
          code: "INVALID_INPUT",
          message: "Input validation failed",
          details: {
            issues: result.error.issues.map((issue) => ({
              path: issue.path.map(String).join("."),
              code: issue.code,
              message: issue.message,
            })),
          },
        });
      }
      return result.data;
    },
    toJSONSchema(): JsonObject {
      return z.toJSONSchema(schema) as JsonObject;
    },
  };
}
