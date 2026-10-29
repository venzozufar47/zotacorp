"use client";

import { useState } from "react";
import { ClipboardList, LineChart as LineChartIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SocialReportPage } from "@/lib/actions/social-report.actions";
import { SocialReportWorkspace } from "./SocialReportForm";
import { SocialWeeklyChartsLazy } from "./SocialWeeklyChartsLazy";

type Tab = "input" | "bagan";

const TABS: { id: Tab; label: string; icon: typeof ClipboardList }[] = [
  { id: "input", label: "Input mingguan", icon: ClipboardList },
  { id: "bagan", label: "Bagan", icon: LineChartIcon },
];

/**
 * Halaman pengisi laporan (/sosmed): input mingguan dan bagan rekap. Data `page` sudah disaring di server ke brand milik
 * pengisi (laporan dan riwayat brand lain tidak ikut terkirim), jadi bagan hanya menampilkan akunnya sendiri.
 */
export function SosmedEditorView({ page, initialTab = "input" }: { page: SocialReportPage; initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  return (
    <div className="space-y-5">
      <div role="tablist" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "inline-flex h-10 items-center gap-1.5 rounded-full border-2 px-4 text-[13px] font-semibold transition",
              tab === t.id ? "border-foreground bg-primary text-primary-foreground" : "border-border bg-card hover:border-foreground/50"
            )}
          >
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>
      {tab === "input" ? <SocialReportWorkspace page={page} basePath="/sosmed" /> : <SocialWeeklyChartsLazy page={page} />}
    </div>
  );
}
