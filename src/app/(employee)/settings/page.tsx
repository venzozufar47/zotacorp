"use client";

import { LanguageCard } from "@/components/settings/LanguageCard";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

export default function SettingsPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">{t.settings.title}</h1>
        <p className="text-sm text-muted-foreground">{t.settings.subtitle}</p>
      </div>
      <LanguageCard />
    </div>
  );
}
