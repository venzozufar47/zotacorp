"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { dictionary, type Dictionary, type Language } from "./dictionary";

const STORAGE_KEY = "zota.language";
const COOKIE_KEY = "zota_lang";
const DEFAULT_LANG: Language = "en";

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
 * Client-only language provider. Reads preference from localStorage on mount
 * and falls back to `DEFAULT_LANG` so SSR output matches the first paint.
 * The brief hydration flash for non-English users is acceptable for MVP.
 */
export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>(DEFAULT_LANG);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "en" || stored === "id") {
        setLangState(stored);
        writeCookie(stored);
      }
    } catch {
      // ignore
    }
  }, []);

  const setLang = useCallback((next: Language) => {
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
  }, []);

  const value = useMemo<Ctx>(
    () => ({ lang, setLang, t: dictionary[lang] }),
    [lang, setLang]
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
