import Link from "next/link";
import { InvoiceExample } from "@/features/invoice";

export default function InvoicePage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <Link href="/" className="text-sm text-neutral-500 hover:underline">
        ← Examples
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Invoice</h1>
      <p className="mb-6 mt-1 text-sm text-neutral-600 dark:text-neutral-400">
        The vertical slice. Try it from DevTools: read <code>summary</code>,
        run <code>add-line-item</code>, then prepare <code>send</code> — it
        always requires confirmation, and its preparation goes stale if the
        invoice changes first.
      </p>
      <InvoiceExample />
    </main>
  );
}
