"use client";

import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { cn } from "@/lib/utils";
import type { Language } from "@/lib/i18n/dictionary";

/**
 * Compact language toggle for the logged-out auth pages. Sits in the
 * top-right corner of the auth layout so users can flip between ID and
 * EN *before* signing in. Writing the cookie triggers a full reload
 * (handled inside LanguageProvider.setLang) so server-rendered copy
 * reflects the new language immediately.
 */
export function AuthLanguageSwitcher() {
  const { lang, setLang, t } = useTranslation();

  const OPTIONS: { value: Language; label: string }[] = [
    { value: "id", label: "ID" },
    { value: "en", label: "EN" },
  ];

  return (
    <div
      role="group"
      aria-label={t.authLayout.langSwitcherAria}
      className="absolute top-4 right-4 md:top-6 md:right-6 z-20 inline-flex items-center gap-0.5 p-0.5 rounded-full border-2 border-foreground bg-card shadow-hard-sm"
    >
      {OPTIONS.map((opt) => {
        const active = lang === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => !active && setLang(opt.value)}
            aria-pressed={active}
            className={cn(
              "font-display text-[10px] font-bold tracking-wider uppercase rounded-full h-7 min-w-[34px] px-2.5 transition-colors",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
