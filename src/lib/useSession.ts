"use client";

/**
 * Reactive session hook — CLIENT ONLY.
 *
 * Kept out of src/lib/auth.ts on purpose: that module is imported by the login
 * API route (a React Server Component context), where `useSyncExternalStore`
 * is not available. `useSyncExternalStore` also keeps hydration clean: the
 * server snapshot is always "no session" and the store supplies the real one on
 * the client, so no setState-in-effect flash.
 */
import { useSyncExternalStore } from "react";
import { getSession, subscribeSession, type Session } from "./auth";

export function useSession(): Session | null {
  return useSyncExternalStore(subscribeSession, getSession, () => null);
}
