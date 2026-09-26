"use client";

/**
 * UI language (en / hi), held in an external store for the same reasons as the
 * theme: persisted in localStorage, readable without a setState-in-effect, and
 * with a deterministic server snapshot so hydration never mismatches.
 */
import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import dict, { type Lang } from "./translations";

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
}

const Ctx = createContext<LangCtx>({
  lang: "en",
  setLang: () => {},
  t: (k) => k,
});

const STORAGE_KEY = "railrakshak.lang";
const EVENT = "rr-lang";
const listeners = new Set<() => void>();
let snapshot: Lang | null = null;

function readStored(): Lang {
  if (typeof window === "undefined") return "en";
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved === "hi" || saved === "en" ? saved : "en";
  } catch {
    return "en";
  }
}

function getSnapshot(): Lang {
  if (snapshot === null) snapshot = readStored();
  return snapshot;
}

function getServerSnapshot(): Lang {
  return "en";
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const onStorage = () => {
    snapshot = readStored();
    onChange();
  };
  // "rr-lang" keeps the old cross-component contract working; "storage" covers
  // a second tab.
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function LangProvider({ children }: { children: ReactNode }) {
  const lang = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const value = useMemo<LangCtx>(
    () => ({
      lang,
      setLang: (l: Lang) => {
        snapshot = l;
        try {
          window.localStorage.setItem(STORAGE_KEY, l);
        } catch {
          /* private mode */
        }
        window.dispatchEvent(new Event(EVENT));
      },
      t: (key: string) => {
        const entry = dict[key];
        if (!entry) return key;
        return entry[lang] ?? entry.en ?? key;
      },
    }),
    [lang]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLang() {
  return useContext(Ctx);
}
