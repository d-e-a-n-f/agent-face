"use client";

import { usePortalStore } from "./store";

/** Persistent demos need an escape hatch. */
export function ResetDemoButton(): React.JSX.Element {
  const { reset } = usePortalStore();
  return (
    <button
      type="button"
      className="rounded border border-neutral-300 px-3 py-1 text-xs text-neutral-600 hover:border-neutral-500 dark:border-neutral-700 dark:text-neutral-400"
      onClick={() => {
        reset();
        window.location.assign("/portal");
      }}
    >
      Reset demo data
    </button>
  );
}
