"use client";

import { fromZod } from "@agentface/core/zod";
import {
  AgentSurface,
  useAgentAction,
  useAgentResource,
} from "@agentface/react";
import { useState } from "react";
import { z } from "zod";

/**
 * The smallest possible AgentFace setup — this whole file is the example.
 * One inline surface, one resource, three actions. Ids double as names,
 * zero-input actions need no schema, faces need no ceremony.
 */
function Counter(): React.JSX.Element {
  const [count, setCount] = useState(0);

  useAgentResource({
    id: "current-value",
    description: "The counter's current value",
    value: count,
  });

  useAgentAction({
    id: "increment",
    description: "Increase the counter, by 1 or a given amount",
    input: fromZod(z.object({ amount: z.number().int().positive().optional() })),
    execute: ({ amount = 1 }) => {
      setCount((current) => current + amount);
      return { newValue: count + amount };
    },
  });

  useAgentAction({
    id: "decrement",
    description: "Decrease the counter, by 1 or a given amount",
    input: fromZod(z.object({ amount: z.number().int().positive().optional() })),
    execute: ({ amount = 1 }) => {
      setCount((current) => current - amount);
      return { newValue: count - amount };
    },
  });

  useAgentAction({
    id: "reset",
    description: "Reset the counter to zero",
    execute: () => {
      setCount(0);
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
          onClick={() => setCount((current) => current - 1)}
        >
          −1
        </button>
        <button
          type="button"
          className="rounded border border-neutral-300 px-3 py-1 dark:border-neutral-700"
          onClick={() => setCount((current) => current + 1)}
        >
          +1
        </button>
      </div>
    </div>
  );
}

export function CounterExample(): React.JSX.Element {
  return (
    <AgentSurface id="examples.counter" description="A simple counter">
      <Counter />
    </AgentSurface>
  );
}
