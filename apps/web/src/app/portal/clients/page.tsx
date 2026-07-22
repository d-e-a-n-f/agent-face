import { ClientsList } from "@/features/portal/clients-list";

export default function ClientsPage() {
  return (
    <main>
      <h1 className="mb-4 text-2xl font-bold">Clients</h1>
      <ClientsList />
    </main>
  );
}
