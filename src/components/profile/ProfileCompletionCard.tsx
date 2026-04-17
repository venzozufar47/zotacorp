"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

interface ProfileCompletionCardProps {
  /** Section keys (stable, non-translated). The card maps them to localized titles. */
  missingSections: string[];
}

/** Map stable English section keys (emitted by dashboard) to the
 * localized label key under dictionary.profileForm. */
const EN_TO_KEY: Record<
  string,
  "sectionPersonal" | "sectionCurrentResidence" | "sectionHometown" | "sectionWork" | "sectionContact" | "sectionEmergency"
> = {
  "Personal Information": "sectionPersonal",
  "Current Residence": "sectionCurrentResidence",
  "Hometown": "sectionHometown",
  "Work Information": "sectionWork",
  "Contact Information": "sectionContact",
  "Emergency Contact": "sectionEmergency",
};

export function ProfileCompletionCard({ missingSections }: ProfileCompletionCardProps) {
  const { t } = useTranslation();
  if (missingSections.length === 0) return null;

  return (
    <div className="rounded-2xl border-2 border-foreground bg-tertiary/30 shadow-hard p-5 animate-fade-up">
      <div className="flex items-start gap-3">
        <div className="size-11 rounded-full border-2 border-foreground flex items-center justify-center shrink-0 bg-tertiary">
          <AlertTriangle size={20} strokeWidth={2.5} className="text-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display text-base font-bold text-foreground">
            {t.profileCompletion.title}
          </p>
          <p className="text-xs text-foreground/70 mt-0.5 font-medium">
            {t.profileCompletion.description}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {missingSections.map((s) => {
              const key = EN_TO_KEY[s];
              const label = key ? t.profileForm[key] : s;
              return (
                <span
                  key={s}
                  className="text-[10px] px-2 py-0.5 rounded-full font-display font-bold uppercase tracking-wider border-2 border-foreground bg-card text-foreground"
                >
                  {label}
                </span>
              );
            })}
          </div>
          <Link
            href="/profile"
            className="inline-flex items-center justify-center mt-4 h-11 px-5 text-sm font-display font-bold rounded-full border-2 border-foreground bg-primary text-primary-foreground shadow-hard hover:-translate-y-0.5 hover:shadow-hard-hover transition-all"
          >
            {t.profileCompletion.updateButton}
          </Link>
        </div>
      </div>
    </div>
  );
}
