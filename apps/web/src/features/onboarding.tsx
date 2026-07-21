"use client";

import { defineAgentFace } from "@agentface/core";
import { fromZod } from "@agentface/core/zod";
import {
  AgentSurface,
  useAgentAction,
  useAgentResource,
  useAgentSurface,
} from "@agentface/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRef, useState } from "react";
import type { FieldPath, FieldPathByValue } from "react-hook-form";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

/**
 * The "agent as helper" pattern: the PRIMARY interface is a real form
 * (shadcn + react-hook-form). AgentFace wraps the same form instance —
 * agent actions write through `form.setValue` with validation, so the human
 * watches fields fill in, can edit anything by hand, and stays in charge of
 * submission.
 */

const onboardingSchema = z.object({
  company: z.object({
    name: z.string().min(1, "Company name is required"),
    registrationNumber: z
      .string()
      .regex(/^\d{8}$/, "Company number is 8 digits"),
    country: z.string().min(2, "Country is required"),
  }),
  address: z.object({
    street: z.string().min(1, "Street is required"),
    city: z.string().min(1, "City is required"),
    postcode: z.string().min(3, "Postcode is required"),
  }),
  contact: z.object({
    name: z.string().min(1, "Contact name is required"),
    email: z.email("A valid email is required"),
  }),
});

type OnboardingValues = z.infer<typeof onboardingSchema>;

const EMPTY_VALUES: OnboardingValues = {
  company: { name: "", registrationNumber: "", country: "" },
  address: { street: "", city: "", postcode: "" },
  contact: { name: "", email: "" },
};

const onboardingFace = defineAgentFace({
  id: "onboarding.application",
  name: "Client onboarding",
  description:
    "A multi-section onboarding form the agent can fill section by section; the human reviews, edits, and stays in charge of submission",
  version: "0.1.0",
  tags: ["example", "onboarding"],
});

const fillCompanyInput = fromZod(
  z.object({
    name: z.string().optional(),
    registrationNumber: z.string().optional().describe("8 digits"),
    country: z.string().optional(),
  }),
);
const fillAddressInput = fromZod(
  z.object({
    street: z.string().optional(),
    city: z.string().optional(),
    postcode: z.string().optional(),
  }),
);
const fillContactInput = fromZod(
  z.object({
    name: z.string().optional(),
    email: z.string().optional(),
  }),
);
const emptyInput = fromZod(z.object({}));

interface Meta {
  readonly savedAt: string | null;
  readonly submittedAt: string | null;
}

function flattenIssues(errors: object, prefix = ""): string[] {
  return Object.entries(errors as Record<string, unknown>).flatMap(
    ([key, value]) => {
      if (value === undefined || value === null) {
        return [];
      }
      const path = prefix === "" ? key : `${prefix}.${key}`;
      if (
        typeof value === "object" &&
        "message" in value &&
        typeof (value as { message?: unknown }).message === "string"
      ) {
        return [`${path}: ${(value as { message: string }).message}`];
      }
      return typeof value === "object"
        ? flattenIssues(value as object, path)
        : [];
    },
  );
}

function OnboardingFeature(): React.JSX.Element {
  const form = useForm<OnboardingValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: EMPTY_VALUES,
    mode: "onChange",
  });
  const [meta, setMeta] = useState<Meta>({ savedAt: null, submittedAt: null });
  // Agent closures read the ref so sequential actions in one run see
  // current state; the state mirrors it for rendering.
  const metaRef = useRef(meta);
  const surface = useAgentSurface();

  const updateMeta = (next: Partial<Meta>): void => {
    metaRef.current = { ...metaRef.current, ...next };
    setMeta(metaRef.current);
    surface?.bumpRevision();
  };

  const notSubmitted = () => metaRef.current.submittedAt === null;

  /** The agent's write-path: through the SAME form the human is editing. */
  function fillSection<TSection extends keyof OnboardingValues>(
    section: TSection,
    values: Partial<OnboardingValues[TSection]>,
  ): { readonly values: OnboardingValues[TSection]; readonly issues: string[] } {
    for (const [key, value] of Object.entries(values)) {
      if (typeof value === "string") {
        form.setValue(
          `${section}.${key}` as FieldPath<OnboardingValues>,
          value,
          { shouldValidate: true, shouldDirty: true, shouldTouch: true },
        );
      }
    }
    const sectionErrors = form.formState.errors[section];
    return {
      values: form.getValues(section),
      issues: sectionErrors !== undefined ? flattenIssues(sectionErrors) : [],
    };
  }

  useAgentResource({
    id: "form-state",
    name: "Onboarding form state",
    description:
      "The current values of the onboarding form, plus draft/submission status",
    getValue: () => ({
      values: form.getValues(),
      savedAt: metaRef.current.savedAt,
      submittedAt: metaRef.current.submittedAt,
    }),
  });

  useAgentResource({
    id: "validation",
    name: "Form validation",
    description: "Outstanding validation issues preventing submission",
    getValue: () => ({
      issues: flattenIssues(form.formState.errors),
    }),
  });

  useAgentAction({
    id: "fill-company",
    name: "Fill company details",
    description:
      "Fill some or all of the company section (name, 8-digit registration number, country). The human sees the fields populate and can edit them.",
    input: fillCompanyInput,
    isAvailable: notSubmitted,
    execute: (input) => fillSection("company", input),
  });

  useAgentAction({
    id: "fill-address",
    name: "Fill registered address",
    description:
      "Fill some or all of the address section (street, city, postcode).",
    input: fillAddressInput,
    isAvailable: notSubmitted,
    execute: (input) => fillSection("address", input),
  });

  useAgentAction({
    id: "fill-contact",
    name: "Fill primary contact",
    description: "Fill some or all of the primary contact (name, email).",
    input: fillContactInput,
    isAvailable: notSubmitted,
    execute: (input) => fillSection("contact", input),
  });

  useAgentAction({
    id: "save-draft",
    name: "Save draft",
    description: "Save the form as a draft without submitting it.",
    input: emptyInput,
    confirmation: "never",
    isAvailable: notSubmitted,
    execute: () => {
      const savedAt = new Date().toISOString();
      updateMeta({ savedAt });
      return { savedAt };
    },
  });

  useAgentAction({
    id: "submit",
    name: "Submit onboarding",
    description:
      "Submit the completed onboarding record. The whole form must be valid, and the user must confirm.",
    input: emptyInput,
    sensitivity: "confidential",
    confirmation: "always",
    preconditions: [
      {
        id: "form-is-valid",
        description: "Every section must pass validation before submission",
        check: () => form.trigger(),
      },
    ],
    preview: () => ({
      summary: `Submit onboarding for ${form.getValues("company.name") || "the company"}`,
      changes: [{ path: "status", from: "draft", to: "submitted" }],
    }),
    execute: () => {
      const submittedAt = new Date().toISOString();
      updateMeta({ submittedAt });
      return { submittedAt };
    },
  });

  const submitted = meta.submittedAt !== null;

  const sectionField = (
    name: FieldPathByValue<OnboardingValues, string>,
    label: string,
    placeholder: string,
  ) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input placeholder={placeholder} disabled={submitted} {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <Form {...form}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          // The human path: a deliberate click on a valid form submits
          // directly — confirmation cards are for the agent path.
          void form.handleSubmit(() => {
            updateMeta({ submittedAt: new Date().toISOString() });
          })(event);
        }}
      >
        <div
          className="flex items-center gap-2"
          data-testid="onboarding-status"
        >
          {submitted ? (
            <Badge>Submitted</Badge>
          ) : meta.savedAt !== null ? (
            <Badge variant="secondary">Draft saved</Badge>
          ) : (
            <Badge variant="outline">New</Badge>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Company</CardTitle>
            <CardDescription>The legal entity being onboarded</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            {sectionField("company.name", "Company name", "Northshore Limited")}
            {sectionField(
              "company.registrationNumber",
              "Company number",
              "09876543",
            )}
            {sectionField("company.country", "Country", "United Kingdom")}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Registered address</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            {sectionField("address.street", "Street", "1 Harbour Street")}
            {sectionField("address.city", "City", "London")}
            {sectionField("address.postcode", "Postcode", "EC2A 4BX")}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Primary contact</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {sectionField("contact.name", "Contact name", "Maya Chen")}
            {sectionField(
              "contact.email",
              "Contact email",
              "maya@northshore.example",
            )}
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={submitted}
            onClick={() => updateMeta({ savedAt: new Date().toISOString() })}
          >
            Save draft
          </Button>
          <Button type="submit" disabled={submitted}>
            Submit
          </Button>
        </div>
      </form>
    </Form>
  );
}

/** Route 4 — a proper form as the primary interface, with the agent as helper. */
export function OnboardingExample(): React.JSX.Element {
  return (
    <AgentSurface face={onboardingFace}>
      <OnboardingFeature />
    </AgentSurface>
  );
}
