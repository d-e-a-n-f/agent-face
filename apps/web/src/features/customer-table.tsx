"use client";

import { defineAgentFace } from "@agentface/core";
import { fromZod } from "@agentface/core/zod";
import {
  AgentSurface,
  useAgentAction,
  useAgentResource,
  useAgentSurface,
} from "@agentface/react";
import { useMemo, useState } from "react";
import { z } from "zod";

interface Customer {
  readonly id: string;
  readonly name: string;
  readonly status: "active" | "churned";
  readonly annualValue: number;
  readonly renewalQuarter: string;
}

const CUSTOMERS: readonly Customer[] = [
  { id: "cus_1", name: "Northshore Limited", status: "active", annualValue: 82000, renewalQuarter: "2026-Q3" },
  { id: "cus_2", name: "Apollo Partners", status: "active", annualValue: 45000, renewalQuarter: "2026-Q4" },
  { id: "cus_3", name: "Wilshire Group", status: "active", annualValue: 120000, renewalQuarter: "2026-Q3" },
  { id: "cus_4", name: "Meridian Foods", status: "churned", annualValue: 18000, renewalQuarter: "2026-Q1" },
  { id: "cus_5", name: "Harbourline Ltd", status: "active", annualValue: 56000, renewalQuarter: "2027-Q1" },
  { id: "cus_6", name: "Beacon Analytics", status: "churned", annualValue: 9000, renewalQuarter: "2026-Q2" },
];

interface Filters {
  readonly status: "all" | "active" | "churned";
  readonly minimumValue: number;
}

const customersFace = defineAgentFace({
  id: "customers.table",
  name: "Customer table",
  description: "Browse, filter, and select customers",
  version: "0.1.0",
  tags: ["example", "customers"],
});

const applyFilterInput = fromZod(
  z.object({
    status: z.enum(["all", "active", "churned"]).optional(),
    minimumValue: z.number().nonnegative().optional(),
  }),
);

const selectInput = fromZod(
  z.object({
    customerIds: z.array(z.string()).min(1).describe("Customer ids to select"),
  }),
);

const emptyInput = fromZod(z.object({}));

function CustomerTableFeature(): React.JSX.Element {
  const [filters, setFilters] = useState<Filters>({ status: "all", minimumValue: 0 });
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [revision, setRevision] = useState(0);
  const surface = useAgentSurface();

  const results = useMemo(
    () =>
      CUSTOMERS.filter(
        (customer) =>
          (filters.status === "all" || customer.status === filters.status) &&
          customer.annualValue >= filters.minimumValue,
      ),
    [filters],
  );

  const touch = (): void => {
    setRevision((current) => current + 1);
    surface?.bumpRevision();
  };

  useAgentResource({
    id: "filters",
    name: "Active filters",
    description: "The filters currently applied to the customer table",
    value: filters,
    revision,
  });

  useAgentResource({
    id: "results",
    name: "Filtered customers",
    description: "The customers matching the current filters",
    getValue: () => results,
    getRevision: () => revision,
  });

  useAgentResource({
    id: "selection",
    name: "Selected customers",
    description: "The customers currently selected in the table",
    getValue: () => CUSTOMERS.filter((customer) => selectedIds.includes(customer.id)),
    getRevision: () => revision,
  });

  useAgentAction({
    id: "apply-filter",
    name: "Apply filter",
    description: "Filter the table by status and/or minimum annual value",
    input: applyFilterInput,
    execute: (input) => {
      const next: Filters = {
        status: input.status ?? filters.status,
        minimumValue: input.minimumValue ?? filters.minimumValue,
      };
      setFilters(next);
      touch();
      return { filters: next };
    },
  });

  useAgentAction({
    id: "select",
    name: "Select customers",
    description: "Add the given customers to the selection",
    input: selectInput,
    preconditions: [
      {
        id: "customers-exist",
        description: "Selected ids must exist in the table",
        check: () => true,
      },
    ],
    execute: (input) => {
      const known = new Set(CUSTOMERS.map((customer) => customer.id));
      const unknown = input.customerIds.filter((id) => !known.has(id));
      if (unknown.length > 0) {
        throw new Error(`Unknown customer ids: ${unknown.join(", ")}`);
      }
      const merged = [...new Set([...selectedIds, ...input.customerIds])];
      setSelectedIds(merged);
      touch();
      return { selectedIds: merged };
    },
  });

  useAgentAction({
    id: "clear-selection",
    name: "Clear selection",
    description: "Clear all selected customers",
    input: emptyInput,
    execute: () => {
      setSelectedIds([]);
      touch();
      return { cleared: true };
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
              touch();
            }}
          >
            <option value="all">all</option>
            <option value="active">active</option>
            <option value="churned">churned</option>
          </select>
        </label>
        <span className="text-neutral-500" data-testid="selection-count">
          {selectedIds.length} selected
        </span>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {results.map((customer) => (
            <tr
              key={customer.id}
              className="border-b border-neutral-100 last:border-0 dark:border-neutral-900"
            >
              <td className="p-3">
                <input
                  type="checkbox"
                  aria-label={`Select ${customer.name}`}
                  checked={selectedIds.includes(customer.id)}
                  onChange={(event) => {
                    setSelectedIds((current) =>
                      event.target.checked
                        ? [...current, customer.id]
                        : current.filter((id) => id !== customer.id),
                    );
                    touch();
                  }}
                />
              </td>
              <td className="p-3 font-medium">{customer.name}</td>
              <td className="p-3">{customer.status}</td>
              <td className="p-3 tabular-nums">
                £{customer.annualValue.toLocaleString()}
              </td>
              <td className="p-3">{customer.renewalQuarter}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Route 2: proves dynamic resources — filters, results, and selection. */
export function CustomerTableExample(): React.JSX.Element {
  return (
    <AgentSurface face={customersFace}>
      <CustomerTableFeature />
    </AgentSurface>
  );
}
