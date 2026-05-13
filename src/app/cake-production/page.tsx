export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Factory, ChevronRight, ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/cached";
import { getMyCakeAccess } from "@/lib/cake-orders/access";
import { listMySlips } from "@/lib/actions/cake-slips.actions";
import { SlipStatusBadge } from "@/components/cake/SlipStatusBadge";
import { BranchBadge } from "@/components/cake/BranchBadge";
import type { CakeProductionSlipStatus } from "@/lib/cake-orders/types";

/**
 * Production-team lobby: list of slips visible to the user. RLS
 * already filters out drafts for production-only assignees, so we
 * don't need to filter here.
 */
export default async function CakeProductionPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const access = await getMyCakeAccess();
  if (!access.hasProduction && !access.hasOrders) redirect("/dashboard");

  const slipsRes = await listMySlips();
  const slips = slipsRes.ok ? slipsRes.data ?? [] : [];

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-2">
        <Link
          href="/dashboard"
          className="rounded-full p-1.5 hover:bg-muted text-muted-foreground"
          aria-label="Kembali ke dashboard"
        >
          <ArrowLeft size={16} strokeWidth={2.5} />
        </Link>
        <span className="flex items-center justify-center size-9 rounded-full bg-tertiary text-foreground border-2 border-foreground shrink-0">
          <Factory size={16} strokeWidth={2.5} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-base sm:text-lg font-semibold text-foreground leading-tight">
            Produksi Cake
          </h1>
          <p className="text-[11px] text-muted-foreground leading-snug">
            Slip pesanan yang sudah diverifikasi admin.
          </p>
        </div>
      </header>

      {slips.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border bg-card p-8 text-center text-muted-foreground">
          <Factory size={28} className="mx-auto" strokeWidth={2} />
          <p className="text-sm mt-2">Belum ada slip masuk.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {slips.map((s) => (
            <li key={s.id}>
              <Link
                href={`/cake-production/${s.id}`}
                className="flex items-center gap-3 rounded-2xl border-2 border-foreground bg-card p-3 sm:p-4 hover:bg-muted/30 transition-colors"
              >
                <span className="flex items-center justify-center size-12 rounded-xl bg-pop-pink/30 text-foreground border-2 border-foreground shrink-0 font-display font-bold text-sm">
                  {format(new Date(`${s.target_date}T00:00:00`), "d MMM", {
                    locale: idLocale,
                  })}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-foreground flex items-center gap-1.5 flex-wrap">
                    {format(
                      new Date(`${s.target_date}T00:00:00`),
                      "EEEE, d MMM yyyy",
                      { locale: idLocale }
                    )}
                    <BranchBadge branch={s.branch} size="sm" />
                  </div>
                  <div className="mt-0.5">
                    <SlipStatusBadge
                      status={s.status as CakeProductionSlipStatus}
                      emphasiseSent
                    />
                  </div>
                </div>
                <ChevronRight
                  size={16}
                  className="text-muted-foreground shrink-0"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
