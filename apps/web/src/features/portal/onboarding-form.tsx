"use client";

import { defineAgentFace } from "@agentface/core";
import { fromZod } from "@agentface/core/zod";
import { AgentSurface, useAgentAction, useAgentSurface } from "@agentface/react";
import { useAgentForm } from "@agentface/react/hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { FieldPathByValue } from "react-hook-form";
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
import type { OnboardingValues } from "@/portal/store";
import {
  saveOnboarding,
  submitOnboarding,
  usePortalStore,
} from "@/portal/store";

/**
 * The agent-as-helper pattern in the Portal: a real form the human owns,
 * agent-enabled with one useAgentForm call. Saving and submitting persist to
 * the shared portal store; submitting activates the client.
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

const onboardingFace = defineAgentFace({
  id: "portal.onboarding",
  name: "Client onboarding",
  description:
    "The onboarding form for one client; the human reviews, edits, and stays in charge of submission. Submitting activates the client.",
  version: "0.1.0",
  tags: ["portal", "onboarding"],
});

const emptyInput = fromZod(z.object({}));

function OnboardingFormFeature({
  clientId,
}: {
  readonly clientId: string;
}): React.JSX.Element {
  const { store, getStore, mutate } = usePortalStore();
  const surface = useAgentSurface();
  const client = store.clients.find((candidate) => candidate.id === clientId);
  const record = store.onboarding[clientId];

  const form = useForm<OnboardingValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: record?.values ?? {
      company: { name: client?.name ?? "", registrationNumber: "", country: "" },
      address: { street: "", city: "", postcode: "" },
      contact: { name: "", email: client?.email ?? "" },
    },
    mode: "onChange",
  });

  const notSubmitted = () =>
    getStore().onboarding[clientId]?.submittedAt == null;
  const touch = () => surface?.bumpRevision();

  useAgentForm({
    form,
    name: "Onboarding form",
    description: `the onboarding form for ${client?.name ?? clientId}: company (name, 8-digit registration number, country), registered address (street, city, postcode), and primary contact (name, email)`,
    isEnabled: notSubmitted,
  });

  useAgentAction({
    id: "save-draft",
    name: "Save draft",
    description:
      "Save the onboarding form as a draft without submitting. Does not change the client's status.",
    input: emptyInput,
    confirmation: "never",
    isAvailable: notSubmitted,
    recommend: {
      when: () =>
        form.formState.isDirty &&
        getStore().onboarding[clientId]?.savedAt == null &&
        notSubmitted(),
      reason: "There are unsaved changes",
      instruction: "Save the onboarding draft",
      priority: 5,
    },
    execute: () => {
      const savedAt = new Date().toISOString();
      mutate((current) =>
        saveOnboarding(current, clientId, form.getValues(), savedAt),
      );
      touch();
      return { savedAt };
    },
  });

  useAgentAction({
    id: "submit",
    name: "Submit onboarding",
    description:
      "Submit the completed onboarding record and activate the client. The whole form must be valid, and the user must confirm.",
    input: emptyInput,
    sensitivity: "confidential",
    confirmation: "always",
    isAvailable: notSubmitted,
    recommend: {
      when: () => form.formState.isValid && notSubmitted(),
      reason: "Every section is complete and valid",
      instruction: "Submit the onboarding form",
      priority: 10,
    },
    preconditions: [
      {
        id: "form-is-valid",
        description: "Every section must pass validation before submission",
        check: () => form.trigger(),
      },
    ],
    preview: () => ({
      summary: `Submit onboarding for ${form.getValues("company.name") || "the company"} and activate the client`,
      changes: [
        { path: "status", from: "draft", to: "submitted" },
        { path: "client.status", from: client?.status ?? "prospect", to: "active" },
      ],
    }),
    execute: () => {
      const submittedAt = new Date().toISOString();
      mutate((current) =>
        submitOnboarding(current, clientId, form.getValues(), submittedAt),
      );
      touch();
      return { submittedAt };
    },
  });

  const submitted = record?.submittedAt != null;

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

  if (client === undefined) {
    return <p className="text-sm text-neutral-500">Unknown client.</p>;
  }

  return (
    <Form {...form}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          // The human path: a deliberate click on a valid form submits
          // directly — confirmation cards are for the agent path.
          void form.handleSubmit(() => {
            mutate((current) =>
              submitOnboarding(
                current,
                clientId,
                form.getValues(),
                new Date().toISOString(),
              ),
            );
            touch();
          })(event);
        }}
      >
        <div className="flex items-center gap-2" data-testid="onboarding-status">
          {submitted ? (
            <Badge>Submitted</Badge>
          ) : record?.savedAt != null ? (
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
            onClick={() => {
              mutate((current) =>
                saveOnboarding(
                  current,
                  clientId,
                  form.getValues(),
                  new Date().toISOString(),
                ),
              );
              touch();
            }}
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

export function OnboardingForm({
  clientId,
}: {
  readonly clientId: string;
}): React.JSX.Element {
  const { store } = usePortalStore();
  const client = store.clients.find((candidate) => candidate.id === clientId);
  return (
    <AgentSurface
      face={onboardingFace}
      entity={{
        type: "client",
        id: clientId,
        ...(client !== undefined ? { displayName: client.name } : {}),
      }}
    >
      <OnboardingFormFeature clientId={clientId} />
    </AgentSurface>
  );
}
