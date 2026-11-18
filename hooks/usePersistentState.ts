"use client";

import { useEffect, useState } from "react";

/**
 * useState backed by localStorage. Only use in components rendered on the
 * client (the planner is loaded with ssr: false), so the lazy read is safe.
 */
export function usePersistentState<T>(key: string, initial: () => T, validate?: (v: unknown) => v is T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (!validate || validate(parsed)) return parsed as T;
      }
    } catch {
      /* private mode / corrupted data → fall back to defaults */
    }
    return initial();
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* quota or disabled storage: keep working in memory */
    }
  }, [key, value]);

  return [value, setValue] as const;
}
