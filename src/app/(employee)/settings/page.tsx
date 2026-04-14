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

const OPTIONS: { value: Language; labelKey: "indonesian" | "english"; flag: string }[] = [
  { value: "id", labelKey: "indonesian", flag: "🇮🇩" },
  { value: "en", labelKey: "english", flag: "🇬🇧" },
];

export default function SettingsPage() {
  const { lang, setLang, t } = useTranslation();
  const [savedFlash, setSavedFlash] = useState(false);

  const handleSelect = (next: Language) => {
    if (next === lang) return;
    setLang(next);
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1600);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">{t.settings.title}</h1>
        <p className="text-sm text-muted-foreground">{t.settings.subtitle}</p>
      </div>

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
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSelect(opt.value)}
                className={cn(
                  "flex w-full items-center justify-between rounded-xl border px-4 py-3 text-sm transition-all",
                  active
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border bg-white hover:border-foreground/20"
                )}
              >
                <span className="flex items-center gap-3">
                  <span className="text-lg leading-none">{opt.flag}</span>
                  <span className={active ? "font-semibold" : ""}>
                    {t.settings[opt.labelKey]}
                  </span>
                </span>
                {active && <Check size={16} className="text-primary" />}
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
    </div>
  );
}
