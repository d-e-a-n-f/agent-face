import { InvoiceEditor } from "@/features/portal/invoice-editor";

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const { invoiceId } = await params;
  return (
    <main>
      <InvoiceEditor invoiceId={invoiceId} />
    </main>
  );
}
