import Link from "next/link";
import { ProductPublicationExample } from "@/features/product-publication";

export default function ProductPublicationPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <Link href="/" className="text-sm text-neutral-500 hover:underline">
        ← Examples
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Product publication</h1>
      <p className="mb-6 mt-1 text-sm text-neutral-600 dark:text-neutral-400">
        The reference scenario. Ask the assistant: <em>&ldquo;Create a Sterling
        institutional share class under Global Credit Fund II. Inherit the
        product configuration, change the minimum subscription to £5 million,
        apply the institutional fee schedule, attach the latest supplement,
        run compliance validation, send it to Sarah for approval, and publish
        it to the Apollo and Wilshire workspaces once approved.&rdquo;</em>{" "}
        Approval and publication will ask for your confirmation — and Wilshire
        will fail, on purpose.
      </p>
      <ProductPublicationExample />
    </main>
  );
}
