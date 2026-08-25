import { useEffect, useState } from "react";

/**
 * Delays reflecting a fast-changing value (a controlled input) until it's
 * stopped changing for `delayMs`. Generic and feature-agnostic — any input
 * that shouldn't fire a request on every keystroke can reuse this, not just
 * the add-item URL field.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timeout);
  }, [value, delayMs]);

  return debounced;
}
