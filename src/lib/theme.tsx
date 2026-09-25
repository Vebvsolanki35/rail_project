"use client";

/**
 * Theme preference, held in an external store (localStorage) rather than in
 * component state.
 *
 * Why: reading the saved preference inside a mount effect and writing it back
 * with setState causes a cascading render, and reading localStorage during
 * render would desync the server and the browser. `useSyncExternalStore` gives
 * the server a deterministic snapshot ("light") and the browser the saved one,
 * so React reconciles the two cleanly. Applying the value to
 * `<html data-theme>` stays an effect, because that IS an external system.
 */
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";

type Theme = "light" | "dark";

interface ThemeCtx {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const Ctx = createContext<ThemeCtx>({
  theme: "light",
  setTheme: () => {},
  toggle: () => {},
});

const STORAGE_KEY = "railrakshak.theme";
const listeners = new Set<() => void>();
let snapshot: Theme | null = null;

function readStored(): Theme {
  if (typeof window === "undefined") return "light";
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved === "dark" || saved === "light" ? saved : "light";
  } catch {
    return "light";
  }
}

function getSnapshot(): Theme {
  if (snapshot === null) snapshot = readStored();
  return snapshot;
}

/** Server + first hydration render: the documented default. */
function getServerSnapshot(): Theme {
  return "light";
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const onStorage = () => {
    snapshot = readStored();
    onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function persist(next: Theme) {
  snapshot = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* private mode — the session still follows the toggle */
  }
  listeners.forEach((notify) => notify());
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const value = useMemo<ThemeCtx>(
    () => ({
      theme,
      setTheme: persist,
      toggle: () => persist(getSnapshot() === "dark" ? "light" : "dark"),
    }),
    [theme]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme() {
  return useContext(Ctx);
}
