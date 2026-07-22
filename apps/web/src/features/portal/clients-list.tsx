"use client";

import { defineAgentFace } from "@agentface/core";
import { fromZod } from "@agentface/core/zod";
import {
  AgentSurface,
  useAgentAction,
  useAgentResource,
  useAgentSurface,
} from "@agentface/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { usePortalStore } from "@/portal/store";

const clientsFace = defineAgentFace({
  id: "portal.clients",
  name: "Clients",
  description: "Browse and filter the client book",
  version: "0.1.0",
  tags: ["portal", "clients"],
});

// A type alias (not interface) so it satisfies JsonValue structurally —
// action results must be JSON-serialisable.
type Filters = {
  readonly status: "all" | "prospect" | "active" | "churned";
  readonly minimumValue: number;
};

const applyFilterInput = fromZod(
  z.object({
    status: z.enum(["all", "prospect", "active", "churned"]).optional(),
    minimumValue: z.number().nonnegative().optional(),
  }),
);

function statusBadge(status: string) {
  return (
    <Badge
      variant={
        status === "active"
          ? "default"
          : status === "prospect"
            ? "secondary"
            : "outline"
      }
    >
      {status}
    </Badge>
  );
}

function ClientsListFeature(): React.JSX.Element {
  const { store, getStore } = usePortalStore();
  const [filters, setFilters] = useState<Filters>({
    status: "all",
    minimumValue: 0,
  });
  const [revision, setRevision] = useState(0);
  const surface = useAgentSurface();

  const results = useMemo(
    () =>
      store.clients.filter(
        (client) =>
          (filters.status === "all" || client.status === filters.status) &&
          client.annualValue >= filters.minimumValue,
      ),
    [store, filters],
  );

  useAgentResource({
    id: "clients",
    name: "Clients",
    description:
      "The clients matching the current filters: id, name, status, annual value. Use the id with /portal/clients/:clientId.",
    getValue: () =>
      getStore().clients.filter(
        (client) =>
          (filters.status === "all" || client.status === filters.status) &&
          client.annualValue >= filters.minimumValue,
      ),
    getRevision: () => revision,
  });

  useAgentAction({
    id: "apply-filter",
    name: "Apply filter",
    description: "Filter the client list by status and/or minimum annual value",
    input: applyFilterInput,
    execute: (input) => {
      const next: Filters = {
        status: input.status ?? filters.status,
        minimumValue: input.minimumValue ?? filters.minimumValue,
      };
      setFilters(next);
      setRevision((current) => current + 1);
      surface?.bumpRevision();
      return { filters: next };
    },
  });

  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-800">
      <div className="flex items-center gap-3 border-b border-neutral-200 p-3 text-sm dark:border-neutral-800">
        <label>
          Status{" "}
          <select
            className="rounded border border-neutral-300 px-1 py-0.5 dark:border-neutral-700 dark:bg-neutral-900"
            value={filters.status}
            onChange={(event) => {
              setFilters((current) => ({
                ...current,
                status: event.target.value as Filters["status"],
              }));
              setRevision((current) => current + 1);
            }}
          >
            <option value="all">all</option>
            <option value="prospect">prospect</option>
            <option value="active">active</option>
            <option value="churned">churned</option>
          </select>
        </label>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {results.map((client) => (
            <tr
              key={client.id}
              className="border-b border-neutral-100 last:border-0 dark:border-neutral-900"
            >
              <td className="p-3 font-medium">
                <Link
                  href={`/portal/clients/${client.id}`}
                  className="hover:underline"
                >
                  {client.name}
                </Link>
              </td>
              <td className="p-3">{statusBadge(client.status)}</td>
              <td className="p-3 tabular-nums">
                £{client.annualValue.toLocaleString()}
              </td>
              <td className="p-3">{client.renewalQuarter}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ClientsList(): React.JSX.Element {
  return (
    <AgentSurface face={clientsFace}>
      <ClientsListFeature />
    </AgentSurface>
  );
}
