import { useEffect, useRef, useState } from "react";

export const isBrowser = typeof window !== "undefined";

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function useLocalStorageState<T>(key: string, defaultValue: T) {
  const [value, setValue] = useState<T>(defaultValue);
  const hasHydrated = useRef(false);

  useEffect(() => {
    if (!isBrowser) return;
    const stored = window.localStorage.getItem(key);
    if (stored) {
      try {
        setValue(JSON.parse(stored) as T);
      } catch {
        setValue(defaultValue);
      }
    }
    hasHydrated.current = true;
  }, [key, defaultValue]);

  useEffect(() => {
    if (!isBrowser || !hasHydrated.current) return;
    window.localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue] as const;
}
