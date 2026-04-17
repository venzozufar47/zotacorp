"use client";

import { useState } from "react";
import { Check, Globe } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { Language } from "@/lib/i18n/dictionary";
import { cn } from "@/lib/utils";

/**
 * Inline SVG flag components — rendered as vector graphics so they look
 * identical across Windows (which doesn't bundle regional-indicator emoji
 * glyphs) and iOS/macOS. Sized to match a ~20px emoji line-box.
 */
function FlagID({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 30 20"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={className}
    >
      <rect width="30" height="10" fill="#e70011" />
      <rect y="10" width="30" height="10" fill="#ffffff" />
    </svg>
  );
}

function FlagGB({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 60 30"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={className}
    >
      <clipPath id="gb-clip">
        <path d="M0,0 v30 h60 v-30 z" />
      </clipPath>
      <rect width="60" height="30" fill="#012169" />
      <g clipPath="url(#gb-clip)">
        <path d="M0,0 L60,30 M60,0 L0,30" stroke="#ffffff" strokeWidth="6" />
        <path
          d="M0,0 L60,30 M60,0 L0,30"
          stroke="#c8102e"
          strokeWidth="4"
          clipPath="url(#gb-clip)"
        />
        <path d="M30,0 v30 M0,15 h60" stroke="#ffffff" strokeWidth="10" />
        <path d="M30,0 v30 M0,15 h60" stroke="#c8102e" strokeWidth="6" />
      </g>
    </svg>
  );
}

const OPTIONS: {
  value: Language;
  labelKey: "indonesian" | "english";
  Flag: (props: { className?: string }) => React.ReactElement;
}[] = [
  { value: "id", labelKey: "indonesian", Flag: FlagID },
  { value: "en", labelKey: "english", Flag: FlagGB },
];

/**
 * Language selector card — usable on both the employee /settings page and
 * the admin /admin/settings page. Writes preference to localStorage via
 * the LanguageProvider context.
 */
export function LanguageCard() {
  const { lang, setLang, t } = useTranslation();
  const [savedFlash, setSavedFlash] = useState(false);

  const handleSelect = (next: Language) => {
    if (next === lang) return;
    setLang(next);
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1600);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe size={18} />
          {t.settings.language}
        </CardTitle>
        <CardDescription>{t.settings.languageDescription}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {OPTIONS.map((opt) => {
          const active = lang === opt.value;
          const Flag = opt.Flag;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleSelect(opt.value)}
              className={cn(
                "flex w-full items-center justify-between rounded-2xl border-2 px-4 py-3 text-sm transition-all duration-200",
                active
                  ? "border-foreground bg-accent shadow-hard-sm font-bold"
                  : "border-border bg-card hover:border-foreground/40 hover:bg-muted"
              )}
            >
              <span className="flex items-center gap-3">
                <Flag className="h-5 w-7 rounded-sm border-2 border-foreground" />
                <span className={active ? "font-display font-bold" : "font-medium"}>
                  {t.settings[opt.labelKey]}
                </span>
              </span>
              {active && (
                <span className="flex items-center justify-center size-6 rounded-full border-2 border-foreground bg-quaternary">
                  <Check size={12} strokeWidth={3} className="text-foreground" />
                </span>
              )}
            </button>
          );
        })}
        <div
          className={cn(
            "text-xs text-muted-foreground transition-opacity",
            savedFlash ? "opacity-100" : "opacity-0"
          )}
          aria-live="polite"
        >
          {t.settings.saved}
        </div>
      </CardContent>
    </Card>
  );
}
