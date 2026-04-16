"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { Dictionary, Language } from "./dictionary";

// Storage keys bumped to `.v2` / `_v2` the day we flipped the app default
// from English to Indonesian. Old preferences saved under the v1 keys are
// intentionally discarded on next load so every existing user lands on
// Indonesian on first visit after this deploy. Anyone who prefers English
// can re-pick it in Settings and the choice sticks under the new keys.
const STORAGE_KEY = "zota.language.v2";
const COOKIE_KEY = "zota_lang_v2";

/** Max-age in seconds for the language cookie (1 year). */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function writeCookie(next: Language) {
  try {
    document.cookie = `${COOKIE_KEY}=${next}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
  } catch {
    // ignore
  }
}

type Ctx = {
  lang: Language;
  setLang: (lang: Language) => void;
  t: Dictionary;
};

const LanguageContext = createContext<Ctx | null>(null);

/**
 * Language provider. The server reads the `zota_lang_v2` cookie in
 * layout.tsx and passes the resolved language + dictionary subset as
 * props. This eliminates:
 *
 *  1. The hydration flash (SSR and client start from the same lang).
 *  2. The full-dictionary client bundle (~38KB → ~19KB) — only the
 *     active language's strings ship in the initial JS.
 *
 * Language switches still do a full-page reload so server components
 * re-render with the new cookie value.
 */
export function LanguageProvider({
  children,
  initialLang,
  initialDictionary,
}: {
  children: React.ReactNode;
  /** Resolved server-side from the cookie. */
  initialLang: Language;
  /** The dictionary subset for `initialLang`. */
  initialDictionary: Dictionary;
}) {
  const [lang, setLangState] = useState<Language>(initialLang);
  const [dict, setDict] = useState<Dictionary>(initialDictionary);

  const setLang = useCallback(
    (next: Language) => {
      setLangState(next);
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // ignore
      }
      writeCookie(next);
      // Reload so server components re-render with the new language cookie.
      try {
        window.location.reload();
      } catch {
        // ignore
      }
    },
    []
  );

  const value = useMemo<Ctx>(
    () => ({ lang, setLang, t: dict }),
    [lang, setLang, dict]
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation(): Ctx {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useTranslation must be used within a LanguageProvider");
  }
  return ctx;
}
