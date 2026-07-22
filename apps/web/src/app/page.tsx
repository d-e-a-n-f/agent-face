import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      {/* Brand lockups: dark-on-light and light-on-dark variants. */}
      <Image
        src="/brand/agentface-lockup-horizontal-dark.svg"
        alt="agentface"
        width={280}
        height={40}
        className="h-10 w-auto dark:hidden"
      />
      <Image
        src="/brand/agentface-lockup-horizontal-light.svg"
        alt="agentface"
        width={280}
        height={40}
        className="hidden h-10 w-auto dark:block"
      />
      <p className="mt-1 text-sm font-medium text-neutral-500">Playground</p>
      <p className="mt-4 text-neutral-600 dark:text-neutral-400">
        AgentFace gives every screen a typed, policy-checked interface an AI
        assistant can operate — with the human confirming anything
        consequential.
      </p>
      <div className="mt-8 space-y-4">
        <Link
          href="/portal"
          className="block rounded-lg border-2 border-neutral-300 p-5 hover:border-neutral-500 dark:border-neutral-700 dark:hover:border-neutral-500"
        >
          <p className="text-lg font-semibold">The Portal →</p>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            A working multi-page mini-app — clients, onboarding, invoicing —
            with the assistant as a colleague: it knows
            the app&apos;s docs, works across screens, fills real forms,
            suggests next steps, and pauses on confirmation cards for anything
            that matters.
          </p>
        </Link>
        <Link
          href="/examples/counter"
          className="block rounded-lg border border-neutral-200 p-4 hover:border-neutral-400 dark:border-neutral-800 dark:hover:border-neutral-600"
        >
          <p className="font-semibold">Counter (learning example)</p>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            Not a demo — the smallest possible surface, for learning the API
            shape in thirty seconds.
          </p>
        </Link>
      </div>
    </main>
  );
}
