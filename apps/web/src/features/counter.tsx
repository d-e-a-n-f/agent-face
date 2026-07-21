"use client";

import { defineAgentFace } from "@agentface/core";
import { fromZod } from "@agentface/core/zod";
import {
  AgentSurface,
  useAgentAction,
  useAgentResource,
  useAgentSurface,
} from "@agentface/react";
import { useState } from "react";
import { z } from "zod";

const counterFace = defineAgentFace({
  id: "examples.counter",
  name: "Counter",
  description: "A simple counter that agents can read and change",
  version: "0.1.0",
  tags: ["example"],
});

const amountInput = fromZod(
  z.object({
    amount: z.number().int().positive().optional().describe("How much to change by (default 1)"),
  }),
);

const emptyInput = fromZod(z.object({}));

function CounterFeature(): React.JSX.Element {
  const [count, setCount] = useState(0);
  const surface = useAgentSurface();

  const bump = (change: (current: number) => number): void => {
    setCount(change);
    surface?.bumpRevision();
  };

  useAgentResource({
    id: "current-value",
    name: "Current value",
    description: "The counter's current value",
    value: count,
    revision: count,
  });

  useAgentAction({
    id: "increment",
    name: "Increment",
    description: "Increase the counter, by 1 or a given amount",
    input: amountInput,
    execute: (input) => {
      const amount = input.amount ?? 1;
      bump((current) => current + amount);
      return { newValue: count + amount };
    },
  });

  useAgentAction({
    id: "decrement",
    name: "Decrement",
    description: "Decrease the counter, by 1 or a given amount",
    input: amountInput,
    execute: (input) => {
      const amount = input.amount ?? 1;
      bump((current) => current - amount);
      return { newValue: count - amount };
    },
  });

  useAgentAction({
    id: "reset",
    name: "Reset",
    description: "Reset the counter to zero",
    input: emptyInput,
    execute: () => {
      bump(() => 0);
      return { newValue: 0 };
    },
  });

  return (
    <div className="rounded-lg border border-neutral-200 p-6 dark:border-neutral-800">
      <p className="text-5xl font-bold tabular-nums" data-testid="counter-value">
        {count}
      </p>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          className="rounded border border-neutral-300 px-3 py-1 dark:border-neutral-700"
          onClick={() => bump((current) => current - 1)}
        >
          −1
        </button>
        <button
          type="button"
          className="rounded border border-neutral-300 px-3 py-1 dark:border-neutral-700"
          onClick={() => bump((current) => current + 1)}
        >
          +1
        </button>
      </div>
    </div>
  );
}

/** Route 1: proves surface registration, live resources, and simple actions. */
export function CounterExample(): React.JSX.Element {
  return (
    <AgentSurface face={counterFace}>
      <CounterFeature />
    </AgentSurface>
  );
}
