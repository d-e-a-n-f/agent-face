import Link from "next/link";

export default function PortalHome() {
  return (
    <main>
      <h1 className="text-2xl font-bold">Welcome back</h1>
      <p className="mt-2 max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">
        This is a working mini-app — clients, onboarding, invoicing, and
        product publication — where the assistant (bottom right) is a real
        colleague. It knows this app&apos;s documentation, sees what&apos;s on
        your screen, moves between screens, and asks for your confirmation
        before anything consequential.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Link
          href="/portal/clients"
          className="rounded-lg border border-neutral-200 p-4 hover:border-neutral-400 dark:border-neutral-800 dark:hover:border-neutral-600"
        >
          <p className="font-semibold">Clients</p>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            The client book: onboard prospects, create and send invoices.
          </p>
        </Link>
        <Link
          href="/portal/products"
          className="rounded-lg border border-neutral-200 p-4 hover:border-neutral-400 dark:border-neutral-800 dark:hover:border-neutral-600"
        >
          <p className="font-semibold">Products</p>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            Share classes: create, validate, approve, publish to workspaces.
          </p>
        </Link>
      </div>
      <div className="mt-8 rounded-lg border border-dashed border-neutral-300 p-4 text-sm text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">
        <p className="font-semibold text-neutral-800 dark:text-neutral-200">
          Things to ask the assistant
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>&ldquo;How do discounts work on invoices?&rdquo;</li>
          <li>
            &ldquo;Onboard Northshore Limited — company number 09876543, UK, 1
            Harbour Street, London EC2A 4BX, contact Maya Chen
            (maya@northshore.example). Save a draft but don&apos;t
            submit.&rdquo;
          </li>
          <li>
            &ldquo;Create an invoice for Wilshire Group for a £1,200 consulting
            day and send it.&rdquo;
          </li>
          <li>
            &ldquo;Create a Sterling institutional share class under Global
            Credit Fund II… and publish it to Apollo and Wilshire once
            approved.&rdquo;
          </li>
        </ul>
      </div>
    </main>
  );
}
