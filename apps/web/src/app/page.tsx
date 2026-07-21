import Link from "next/link";

const examples = [
  {
    href: "/examples/counter",
    title: "Counter",
    description:
      "The smallest possible surface: one resource, three actions, no confirmation.",
  },
  {
    href: "/examples/customer-table",
    title: "Customer table",
    description:
      "Dynamic resources: filters, results, and selection state an agent can read and operate.",
  },
  {
    href: "/examples/invoice",
    title: "Invoice",
    description:
      "The full vertical slice: typed inputs, preconditions, previews, confirmation, and stale-state rejection.",
  },
  {
    href: "/examples/product-publication",
    title: "Product publication",
    description:
      "The reference scenario: nested surfaces, inheritance, compliance, confirmation-gated approval and publication, and explicit partial failure.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-bold">AgentFace Playground</h1>
      <p className="mt-2 text-neutral-600 dark:text-neutral-400">
        Each example exposes an Agent Surface. Open the AgentFace DevTools
        panel at the bottom of any example to discover, inspect, and operate
        it the way an agent would.
      </p>
      <ul className="mt-8 space-y-4">
        {examples.map((example) => (
          <li key={example.href}>
            <Link
              href={example.href}
              className="block rounded-lg border border-neutral-200 p-4 hover:border-neutral-400 dark:border-neutral-800 dark:hover:border-neutral-600"
            >
              <span className="font-semibold">{example.title}</span>
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                {example.description}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
