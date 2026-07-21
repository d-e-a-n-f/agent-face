import Link from "next/link";
import { CustomerTableExample } from "@/features/customer-table";

export default function CustomerTablePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <Link href="/" className="text-sm text-neutral-500 hover:underline">
        ← Examples
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Customer table</h1>
      <p className="mb-6 mt-1 text-sm text-neutral-600 dark:text-neutral-400">
        Try it from DevTools: run <code>apply-filter</code> with{" "}
        <code>{"{ \"status\": \"active\", \"minimumValue\": 50000 }"}</code>,
        read <code>results</code>, then <code>select</code> the ids you want.
      </p>
      <CustomerTableExample />
    </main>
  );
}
