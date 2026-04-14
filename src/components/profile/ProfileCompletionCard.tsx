"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
    <Card className="border-0 shadow-sm border-l-4" style={{ borderLeftColor: "#ff9f0a" }}>
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <div
            className="rounded-full p-2 shrink-0"
            style={{ background: "#fff7ed" }}
          >
            <AlertTriangle size={18} style={{ color: "#ff9f0a" }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">
              {t.profileCompletion.title}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t.profileCompletion.description}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {missingSections.map((s) => {
                const key = EN_TO_KEY[s];
                const label = key ? t.profileForm[key] : s;
                return (
                  <span
                    key={s}
                    className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                    style={{ background: "#fff7ed", color: "#ff9f0a" }}
                  >
                    {label}
                  </span>
                );
              })}
            </div>
            <Link
              href="/profile"
              className="inline-flex items-center justify-center mt-3 h-10 px-4 text-sm font-medium text-white rounded-md"
              style={{ background: "var(--primary)" }}
            >
              {t.profileCompletion.updateButton}
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
