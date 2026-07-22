import { ClientDetail } from "@/features/portal/client-detail";

export default async function ClientPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  return (
    <main>
      <ClientDetail clientId={clientId} />
    </main>
  );
}
