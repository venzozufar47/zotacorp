export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import {
  getCurrentProfile,
  getCurrentRole,
  getCurrentUser,
} from "@/lib/supabase/cached";
import { createClient } from "@/lib/supabase/server";
import { getMyInvestorAccess } from "@/lib/investor/access";
import { fetchInvestorDashboardData } from "@/lib/investor/dashboard";
import { countCommentsForBu } from "@/lib/actions/investor-comments.actions";
import { InvestorDashboardView } from "@/components/investor/InvestorDashboardView";
import { Sparkles, ShieldCheck } from "lucide-react";

interface SearchParams {
  bu?: string;
  period?: string;
  from?: string;
  to?: string;
}

function resolvePeriod(sp: SearchParams): {
  id: string;
  from: { year: number; month: number };
  to: { year: number; month: number };
  initial: { id: string; from?: string; to?: string };
} {
  const now = new Date();
  const curY = now.getFullYear();
  const curM = now.getMonth() + 1;
  const to = { year: curY, month: curM };
  const period = sp.period ?? "12m";
  let from: { year: number; month: number };
  if (period === "custom" && sp.from && sp.to) {
    const [fy, fm] = sp.from.split("-").map(Number);
    const [ty, tm] = sp.to.split("-").map(Number);
    return {
      id: "custom",
      from: { year: fy, month: fm },
      to: { year: ty, month: tm },
      initial: { id: "custom", from: sp.from, to: sp.to },
    };
  }
  if (period === "3m") {
    let y = curY,
      m = curM - 2;
    while (m < 1) {
      m += 12;
      y -= 1;
    }
    from = { year: y, month: m };
  } else if (period === "6m") {
    let y = curY,
      m = curM - 5;
    while (m < 1) {
      m += 12;
      y -= 1;
    }
    from = { year: y, month: m };
  } else if (period === "ytd") {
    from = { year: curY, month: 1 };
  } else if (period === "all") {
    // arbitrary deep history — 36 bulan ke belakang
    let y = curY,
      m = curM - 35;
    while (m < 1) {
      m += 12;
      y -= 1;
    }
    from = { year: y, month: m };
  } else {
    let y = curY,
      m = curM - 11;
    while (m < 1) {
      m += 12;
      y -= 1;
    }
    from = { year: y, month: m };
  }
  return { id: period, from, to, initial: { id: period } };
}

export default async function InvestorHomePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const profile = await getCurrentProfile();
  const role = await getCurrentRole();
  const isAdmin = role === "admin";

  const { businessUnits } = await getMyInvestorAccess();

  // No assignment → render pending state.
  if (businessUnits.length === 0) {
    return <PendingState firstName={profile?.full_name?.split(/\s+/)[0] ?? "Investor"} />;
  }

  const sp = await searchParams;
  const activeBu =
    sp.bu && businessUnits.includes(sp.bu) ? sp.bu : businessUnits[0];
  const period = resolvePeriod(sp);

  const supabase = await createClient();
  const [data, commentCounts] = await Promise.all([
    fetchInvestorDashboardData({
      supabase,
      userId: user.id,
      businessUnit: activeBu,
      from: period.from,
      to: period.to,
    }),
    countCommentsForBu(activeBu),
  ]);

  return (
    <InvestorDashboardView
      investorName={profile?.full_name ?? "Investor"}
      userId={user.id}
      businessUnit={activeBu}
      businessUnits={businessUnits}
      data={data}
      initialPeriod={
        period.initial as {
          id: "3m" | "6m" | "12m" | "ytd" | "all" | "custom";
          from?: string;
          to?: string;
        }
      }
      commentCounts={commentCounts}
      isAdmin={isAdmin}
    />
  );
}

function PendingState({ firstName }: { firstName: string }) {
  return (
    <div className="space-y-6">
      <section className="animate-fade-up">
        <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-card to-card p-6 sm:p-8 relative overflow-hidden">
          <div
            aria-hidden
            className="absolute -right-12 -top-16 size-48 rounded-full bg-primary/10 blur-2xl pointer-events-none"
          />
          <p className="eyebrow text-primary">Investor portal</p>
          <h1 className="mt-2 text-2xl sm:text-3xl font-semibold text-foreground leading-tight">
            Selamat datang, {firstName}.
          </h1>
          <p className="mt-2 text-sm sm:text-base text-muted-foreground max-w-xl">
            Terima kasih sudah menjadi bagian dari Zota Corp. Portal ini
            memberi Anda akses transparan ke kinerja unit bisnis yang
            Anda dukung.
          </p>
        </div>
      </section>

      <section className="animate-fade-up animate-fade-up-delay-1">
        <div className="rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <span className="flex items-center justify-center size-12 rounded-full bg-primary/15 text-primary shrink-0">
              <ShieldCheck size={22} strokeWidth={2.2} />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-foreground">
                Akun Anda sudah aktif — menunggu aktivasi akses
              </h2>
              <p className="mt-1.5 text-sm text-muted-foreground max-w-2xl">
                Admin sedang meninjau dan menambahkan unit bisnis tempat
                Anda berinvestasi. Setelah aktif, dashboard ini akan
                menampilkan kontrak, KPI, profit &amp; loss bulanan,
                dan akses ke ledger transaksi lengkap (mode baca).
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="animate-fade-up animate-fade-up-delay-2">
        <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles size={18} strokeWidth={2.2} className="text-primary" />
            <p className="text-sm font-semibold text-foreground">
              Membangun bisnis yang berkelanjutan, transparan, dan
              berdampak.
            </p>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Membangun dan mengembangkan unit-unit usaha yang memberikan
            nilai kebaikan kepada komunitas, masyarakat, karyawan, dan
            pemegang saham.
          </p>
        </div>
      </section>
    </div>
  );
}
