import Link from "next/link";
import { OnboardingExample } from "@/features/onboarding";

export default function OnboardingPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <Link href="/" className="text-sm text-neutral-500 hover:underline">
        ← Examples
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Client onboarding</h1>
      <p className="mb-6 mt-1 text-sm text-neutral-600 dark:text-neutral-400">
        The <strong>agent-as-helper</strong> pattern: this is a real form
        (shadcn + react-hook-form) and the human owns it. The assistant fills
        it through the same form state — watch the fields populate, edit
        anything by hand, and submit yourself. Try: <em>&ldquo;Prepare an
        onboarding record for Northshore Limited — company number 09876543 in
        the United Kingdom, 1 Harbour Street, London EC2A 4BX, contact Maya
        Chen (maya@northshore.example). Save a draft but do not
        submit.&rdquo;</em>
      </p>
      <OnboardingExample />
    </main>
  );
}
