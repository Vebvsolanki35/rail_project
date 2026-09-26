"use client";

/**
 * Ticking clock for the header, exposed as an external store.
 *
 * Why not `useState` + `useEffect`? Writing state synchronously inside an effect
 * causes a cascading render, and reading `Date.now()` during render is impure
 * (and would mismatch between the server and the browser). `useSyncExternalStore`
 * gives React a stable snapshot that only changes on the tick, with a
 * deterministic server snapshot (0) so hydration stays clean.
 */
import { useSyncExternalStore } from "react";

export function useNow(intervalMs = 1000): number {
  return useSyncExternalStore(
    (onChange) => {
      const timer = setInterval(onChange, intervalMs);
      return () => clearInterval(timer);
    },
    // Snapped to the interval so repeated calls return an identical value.
    () => Math.floor(Date.now() / intervalMs) * intervalMs,
    () => 0
  );
}
