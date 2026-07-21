"use client";

import type { AgentInputSchema, JsonObject, JsonValue } from "@agentface/core";
import { AgentFaceError } from "@agentface/core";
import type { FieldPath, FieldValues, UseFormReturn } from "react-hook-form";
import { useAgentAction } from "./use-agent-action.js";
import { useAgentResource } from "./use-agent-resource.js";

/**
 * Agent-enable a react-hook-form form in one hook: `useAgentForm` derives a
 * live `state` resource (values + outstanding validation issues) and a
 * partial `fill` action from the form you already have. The agent writes
 * through the SAME form instance the human is editing — fields visibly
 * populate, the form's own resolver stays the source of truth, and the
 * human remains in charge of anything you don't expose as further actions
 * (submission, usually).
 *
 * Import from `@agentface/react/hook-form`; `react-hook-form` is an
 * optional peer dependency.
 */

/** A recursive partial of the form's values (arrays are taken whole). */
export type AgentFormPartial<TFieldValues> = {
  [K in keyof TFieldValues]?: TFieldValues[K] extends readonly unknown[]
    ? TFieldValues[K]
    : TFieldValues[K] extends object
      ? AgentFormPartial<TFieldValues[K]>
      : TFieldValues[K];
};

/** Options for {@link useAgentForm}. */
export interface UseAgentFormOptions<TFieldValues extends FieldValues> {
  readonly form: UseFormReturn<TFieldValues>;
  /** Human-readable name, e.g. "Onboarding form". */
  readonly name: string;
  /** What the form is for — the agent decides from this when to fill it. */
  readonly description: string;
  /**
   * Prefix for the derived capability ids: resource `${idPrefix}-state`,
   * action `fill-${idPrefix}`. Default `"form"` — set when a surface hosts
   * several forms.
   */
  readonly idPrefix?: string;
  /** Whether the fill action is currently available (e.g. not yet submitted). */
  readonly isEnabled?: () => boolean;
  /**
   * Overrides the derived fill-input schema. By default the schema is
   * derived structurally from the form's default values (all fields
   * optional), and semantic validation is left to the form's own resolver —
   * whose outstanding issues are returned to the agent after every fill.
   */
  readonly inputSchema?: AgentInputSchema<AgentFormPartial<TFieldValues>>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" && value !== null && !Array.isArray(value)
  );
}

/** Structural JSON Schema from the default values: every field optional. */
function deriveJsonSchema(shape: Record<string, unknown>): JsonObject {
  const properties: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(shape)) {
    if (isPlainObject(value)) {
      properties[key] = deriveJsonSchema(value);
    } else if (Array.isArray(value)) {
      properties[key] = { type: "array" };
    } else if (typeof value === "number") {
      properties[key] = { type: "number" };
    } else if (typeof value === "boolean") {
      properties[key] = { type: "boolean" };
    } else {
      properties[key] = { type: "string" };
    }
  }
  return { type: "object", properties, additionalProperties: false };
}

/**
 * Prunes untrusted input to the form's shape: unknown keys are dropped
 * (reported back as `ignored`), primitive type mismatches are rejected.
 */
function pruneToShape(
  input: Record<string, unknown>,
  shape: Record<string, unknown>,
  prefix: string,
  ignored: string[],
  mismatched: string[],
): Record<string, unknown> {
  const pruned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    if (!(key in shape)) {
      ignored.push(path);
      continue;
    }
    const shapeValue = shape[key];
    if (isPlainObject(shapeValue)) {
      if (isPlainObject(value)) {
        pruned[key] = pruneToShape(value, shapeValue, path, ignored, mismatched);
      } else {
        mismatched.push(path);
      }
      continue;
    }
    if (Array.isArray(shapeValue)) {
      if (Array.isArray(value)) {
        pruned[key] = value;
      } else {
        mismatched.push(path);
      }
      continue;
    }
    const primitive =
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean";
    const matchesShape =
      shapeValue === null || shapeValue === undefined
        ? primitive
        : typeof value === typeof shapeValue;
    if (primitive && matchesShape) {
      pruned[key] = value;
    } else {
      mismatched.push(path);
    }
  }
  return pruned;
}

/** Flattens react-hook-form's nested error object into `path: message` lines. */
function flattenIssues(errors: object, prefix = ""): string[] {
  return Object.entries(errors as Record<string, unknown>).flatMap(
    ([key, value]) => {
      if (value === undefined || value === null || key === "root") {
        return [];
      }
      const path = prefix === "" ? key : `${prefix}.${key}`;
      if (
        isPlainObject(value) &&
        typeof (value as { message?: unknown }).message === "string"
      ) {
        return [`${path}: ${(value as { message: string }).message}`];
      }
      return isPlainObject(value) ? flattenIssues(value, path) : [];
    },
  );
}

function collectLeafPaths(
  partial: Record<string, unknown>,
  prefix: string,
  out: { path: string; value: unknown }[],
): void {
  for (const [key, value] of Object.entries(partial)) {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    if (isPlainObject(value)) {
      collectLeafPaths(value, path, out);
    } else {
      out.push({ path, value });
    }
  }
}

/**
 * Registers a `${idPrefix}-state` resource and a partial `fill-${idPrefix}`
 * action for a react-hook-form form on the nearest `AgentSurface`.
 *
 * The fill action accepts any subset of the form's fields (nested partials
 * supported), writes each through `form.setValue` with validation, and
 * returns the applied paths, any ignored/mismatched inputs, the resulting
 * values, and the form's outstanding validation issues — so the agent knows
 * exactly what stuck and what still blocks submission.
 *
 * @example
 * ```tsx
 * const form = useForm<OnboardingValues>({ resolver: zodResolver(schema) });
 * useAgentForm({
 *   form,
 *   name: "Onboarding form",
 *   description: "Company, address, and contact details for onboarding",
 *   isEnabled: () => !submitted,
 * });
 * ```
 *
 * @throws when used outside `<AgentFaceProvider>` or `<AgentSurface>`.
 */
export function useAgentForm<TFieldValues extends FieldValues>(
  options: UseAgentFormOptions<TFieldValues>,
): void {
  const { form, name, description, idPrefix = "form" } = options;

  // Contract: react-hook-form values are JSON-safe; the shape comes from the
  // form's default values.
  const shapeOf = (): Record<string, unknown> =>
    (form.formState.defaultValues ?? form.getValues()) as Record<
      string,
      unknown
    >;

  const defaultSchema: AgentInputSchema<AgentFormPartial<TFieldValues>> = {
    parse(input: unknown): AgentFormPartial<TFieldValues> {
      if (!isPlainObject(input)) {
        throw new AgentFaceError({
          code: "INVALID_INPUT",
          message: "Fill input must be an object of form fields",
        });
      }
      const ignored: string[] = [];
      const mismatched: string[] = [];
      const pruned = pruneToShape(input, shapeOf(), "", ignored, mismatched);
      if (mismatched.length > 0) {
        throw new AgentFaceError({
          code: "INVALID_INPUT",
          message: `Wrong value types for: ${mismatched.join(", ")}`,
          details: { mismatched },
        });
      }
      return pruned as AgentFormPartial<TFieldValues>;
    },
    toJSONSchema: () => deriveJsonSchema(shapeOf()),
  };

  useAgentResource({
    id: `${idPrefix}-state`,
    name: `${name} state`,
    description: `Current values and outstanding validation issues of: ${description}`,
    getValue: () => ({
      // Contract: form values are JSON-safe.
      values: form.getValues() as unknown as JsonValue,
      issues: flattenIssues(form.formState.errors),
    }),
  });

  useAgentAction({
    id: `fill-${idPrefix}`,
    name: `Fill ${name}`,
    description: `Fill some or all fields of ${description}. Accepts any subset of the form's fields; the human sees the fields populate and can edit them. Returns the resulting values and any validation issues still outstanding.`,
    input: options.inputSchema ?? defaultSchema,
    ...(options.isEnabled !== undefined
      ? { isAvailable: options.isEnabled }
      : {}),
    execute: (input) => {
      const leaves: { path: string; value: unknown }[] = [];
      collectLeafPaths(input as Record<string, unknown>, "", leaves);
      for (const leaf of leaves) {
        // The path is validated against the form's shape by parse above.
        form.setValue(
          leaf.path as FieldPath<TFieldValues>,
          leaf.value as never,
          { shouldValidate: true, shouldDirty: true, shouldTouch: true },
        );
      }
      return {
        applied: leaves.map((leaf) => leaf.path),
        values: form.getValues() as unknown as JsonValue,
        issues: flattenIssues(form.formState.errors),
      };
    },
  });
}
