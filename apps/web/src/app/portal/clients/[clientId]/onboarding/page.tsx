import Link from "next/link";
import { OnboardingForm } from "@/features/portal/onboarding-form";

export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  return (
    <main>
      <Link
        href={`/portal/clients/${clientId}`}
        className="text-sm text-neutral-500 hover:underline"
      >
        ← Back to client
      </Link>
      <h1 className="mb-4 mt-2 text-2xl font-bold">Client onboarding</h1>
      <OnboardingForm clientId={clientId} />
    </main>
  );
}
