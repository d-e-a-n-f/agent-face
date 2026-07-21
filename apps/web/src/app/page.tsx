import Link from "next/link";

interface Example {
  readonly href: string;
  readonly title: string;
  readonly description: string;
  readonly instruction?: string;
}

const flows: readonly Example[] = [
  {
    href: "/examples/product-publication",
    title: "Product publication",
    description:
      "The agent-as-PRIMARY-interface flow: the screen is read-only status; setting up, validating, approving, and publishing a share class all happens through the agent — with confirmation gates and honest partial failure.",
    instruction:
      "Create a Sterling institutional share class under Global Credit Fund II… and publish it to Apollo and Wilshire once approved.",
  },
  {
    href: "/examples/onboarding",
    title: "Client onboarding",
    description:
      "The agent-as-HELPER flow: a real form (shadcn + react-hook-form) the human owns. The assistant fills it through the same form state; you review, edit, and submit.",
    instruction:
      "Prepare an onboarding record for Northshore Limited — company number 09876543, UK, 1 Harbour Street, London EC2A 4BX, contact Maya Chen (maya@northshore.example). Save a draft but do not submit.",
  },
  {
    href: "/examples/invoice",
    title: "Invoice",
    description:
      "A complete flow in miniature: build up a draft, apply a discount, and send — typed inputs, preconditions, previews, confirmation, and stale-state rejection.",
    instruction:
      "Add a £100 consulting line item and prepare the invoice for sending.",
  },
  {
    href: "/examples/customer-table",
    title: "Customer table",
    description:
      "Live application state an agent can read and operate: filters, results, selection. Pairs with navigation — read here, act on another screen.",
    instruction:
      "Find our highest-value active customer, then add a £1,200 consulting line item for them on the invoice.",
  },
];

const basics: readonly Example[] = [
  {
    href: "/examples/counter",
    title: "Counter",
    description:
      "Not a demo — the smallest possible surface, for learning the API shape in thirty seconds: one resource, three actions.",
  },
];

function ExampleCard({ example }: { readonly example: Example }) {
  return (
    <li>
      <Link
        href={example.href}
        className="block rounded-lg border border-neutral-200 p-4 hover:border-neutral-400 dark:border-neutral-800 dark:hover:border-neutral-600"
      >
        <span className="font-semibold">{example.title}</span>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          {example.description}
        </p>
        {example.instruction !== undefined ? (
          <p className="mt-2 text-sm italic text-neutral-500">
            Try: &ldquo;{example.instruction}&rdquo;
          </p>
        ) : null}
      </Link>
    </li>
  );
}

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-bold">AgentFace Playground</h1>
      <p className="mt-2 text-neutral-600 dark:text-neutral-400">
        Every screen here exposes an Agent Surface. Open the Assistant
        (bottom right) and give it an instruction — it discovers what is on
        the screen, acts through typed, policy-checked actions, and asks you
        to confirm anything consequential. The DevTools panel at the bottom
        shows the same capabilities the way an agent sees them.
      </p>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-neutral-500">
        Flows
      </h2>
      <ul className="mt-3 space-y-4">
        {flows.map((example) => (
          <ExampleCard key={example.href} example={example} />
        ))}
      </ul>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-neutral-500">
        Basics
      </h2>
      <ul className="mt-3 space-y-4">
        {basics.map((example) => (
          <ExampleCard key={example.href} example={example} />
        ))}
      </ul>
    </main>
  );
}
