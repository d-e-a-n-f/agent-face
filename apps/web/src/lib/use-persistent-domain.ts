"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Demo-grade persistent domain state: seeded on first visit, hydrated from
 * localStorage after mount (never during SSR), persisted on every mutation.
 * Agent closures read through `getValue` so sequential actions always see
 * current state, and domain errors throw synchronously inside execute.
 */
export interface PersistentDomain<T> {
  /** Render-time snapshot. */
  readonly value: T;
  /** Live state for agent closures. */
  getValue(): T;
  mutate(change: (value: T) => T): void;
  readonly hydrated: boolean;
}

export function usePersistentDomain<T>(
  storageKey: string,
  seed: () => T,
  validate: (value: unknown) => value is T,
): PersistentDomain<T> {
  const [value, setValue] = useState<T>(seed);
  const valueRef = useRef(value);
  const [hydrated, setHydrated] = useState(false);

  // One-time post-mount hydration must set state in an effect: reading
  // localStorage during render would mismatch the SSR output.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw !== null) {
        const parsed: unknown = JSON.parse(raw);
        if (validate(parsed)) {
          valueRef.current = parsed;
          setValue(parsed);
        }
      }
    } catch {
      // Corrupt payload — keep the seed.
    }
    setHydrated(true);
    // The key and validators are fixed for a mounted domain.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return {
    value,
    hydrated,
    getValue: () => valueRef.current,
    mutate: (change) => {
      const next = change(valueRef.current);
      valueRef.current = next;
      setValue(next);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Storage full/blocked — continue without persistence.
      }
    },
  };
}
