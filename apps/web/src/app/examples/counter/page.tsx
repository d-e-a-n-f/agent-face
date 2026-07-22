import Link from "next/link";
import { CounterExample } from "@/features/counter";

export default function CounterPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <Link href="/" className="text-sm text-neutral-500 hover:underline">
        ← Examples
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Counter</h1>
      <p className="mb-6 mt-1 text-sm text-neutral-600 dark:text-neutral-400">
        Try it from DevTools: read <code>current-value</code>, then run{" "}
        <code>increment</code> with <code>{"{ \"amount\": 3 }"}</code>.
      </p>
      <CounterExample />
    </main>
  );
}
