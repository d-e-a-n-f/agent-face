import { ProductPublicationExample } from "@/features/product-publication";

export default function ProductsPage() {
  return (
    <main>
      <h1 className="mb-1 text-2xl font-bold">Products</h1>
      <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
        Agent-first: this screen is read-only status — setting up, validating,
        approving, and publishing share classes happens through the assistant.
      </p>
      <ProductPublicationExample />
    </main>
  );
}
