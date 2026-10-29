"use client";

import { useState } from "react";
import { ClipboardList, LineChart as LineChartIcon, Target, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReportEditorsData, SocialReportPage } from "@/lib/actions/social-report.actions";
import type { SocialBrandCard } from "@/lib/actions/social-scorecard.actions";
import { SocialReportWorkspace } from "./SocialReportForm";
import { SocialWeeklyChartsLazy } from "./SocialWeeklyChartsLazy";
import { SocialTargetsEditor } from "./SocialTargetsEditor";
import { SocialEditorsPanel } from "./SocialEditorsPanel";

type Tab = "input" | "bagan" | "target" | "pengisi";

const TABS: { id: Tab; label: string; icon: typeof ClipboardList }[] = [
  { id: "input", label: "Input mingguan", icon: ClipboardList },
  { id: "bagan", label: "Bagan", icon: LineChartIcon },
  { id: "target", label: "Target & ambang", icon: Target },
  { id: "pengisi", label: "Pengisi laporan", icon: Users },
];

/** Halaman Sosmed & KPI (owner): semua input di satu tempat — laporan mingguan, bagan, target scorecard, pengisi. */
export function SocialKpiManager({
  page,
  targets,
  editors,
  initialTab,
}: {
  page: SocialReportPage;
  targets: { month: string; brands: SocialBrandCard[] } | null;
  editors: ReportEditorsData | null;
  initialTab: Tab;
}) {
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

      {tab === "input" && <SocialReportWorkspace page={page} basePath="/admin/social" />}
      {tab === "bagan" && <SocialWeeklyChartsLazy page={page} />}
      {tab === "target" &&
        (targets ? <SocialTargetsEditor brands={targets.brands} month={targets.month} /> : <p className="text-sm text-destructive">Data target tidak tersedia.</p>)}
      {tab === "pengisi" && (editors ? <SocialEditorsPanel data={editors} /> : <p className="text-sm text-destructive">Data tidak tersedia.</p>)}
    </div>
  );
}
