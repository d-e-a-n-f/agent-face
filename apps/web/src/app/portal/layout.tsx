import Link from "next/link";
import { PortalShell } from "@/portal/portal-shell";

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8">
      <header className="mb-8 flex items-center gap-6 border-b border-neutral-200 pb-4 text-sm dark:border-neutral-800">
        <Link href="/portal" className="font-bold">
          Acme Portal
        </Link>
        <nav className="flex gap-4 text-neutral-600 dark:text-neutral-400">
          <Link href="/portal/clients" className="hover:underline">
            Clients
          </Link>
        </nav>
      </header>
      <PortalShell>{children}</PortalShell>
    </div>
  );
}
