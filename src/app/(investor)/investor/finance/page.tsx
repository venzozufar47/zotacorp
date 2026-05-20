export const dynamic = "force-dynamic";

import Link from "next/link";
import { ArrowRight, LineChart, Lock } from "lucide-react";
import { getMyInvestorAccess } from "@/lib/investor/access";

export default async function InvestorFinanceLandingPage() {
  const { businessUnits } = await getMyInvestorAccess();

  return (
    <div className="space-y-5">
      <header>
        <p className="eyebrow text-muted-foreground">Keuangan</p>
        <h1 className="mt-1 text-xl sm:text-2xl font-semibold text-foreground">
          Pilih unit bisnis
        </h1>
        <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
          Anda dapat melihat ringkasan profit &amp; loss bulanan
          serta detail ledger keuangan unit bisnis di bawah ini
          (mode baca).
        </p>
      </header>

      {businessUnits.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
          <Lock size={28} className="mx-auto opacity-50" strokeWidth={1.8} />
          <p className="mt-2 font-medium text-foreground">
            Belum ada unit bisnis yang aktif.
          </p>
          <p className="mt-1">
            Hubungi admin untuk mengaktifkan akses ke unit bisnis yang
            Anda investasikan.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {businessUnits.map((bu) => (
            <li key={bu}>
              <Link
                href={`/investor/finance/${encodeURIComponent(bu)}`}
                className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-4 hover:border-primary/40 transition-colors"
              >
                <span className="flex items-center justify-center size-11 rounded-full bg-primary/10 text-primary shrink-0">
                  <LineChart size={20} strokeWidth={2.2} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-semibold text-foreground">
                    {bu}
                  </p>
                  <p className="text-[12px] text-muted-foreground">
                    PnL bulanan + ledger cashflow (read-only)
                  </p>
                </div>
                <ArrowRight
                  size={16}
                  className="text-muted-foreground group-hover:text-primary shrink-0"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
