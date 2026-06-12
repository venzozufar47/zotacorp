export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Users } from "lucide-react";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { PageHeader } from "@/components/shared/PageHeader";
import { getDividendConsoleData } from "@/lib/actions/yeobo-dividend-console.actions";
import { DividendConsoleClient } from "@/components/admin/finance/dividend-console/DividendConsoleClient";

interface SearchParams {
  month?: string; // YYYY-MM
}

function parseYM(s: string | undefined): { year: number; month: number } | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{1,2})$/.exec(s);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

const ymRank = (y: number, m: number) => y * 100 + m;
const ymStr = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;

// Cabang Yeobo paling awal buka Jul 2023 (Tlogosari).
const MIN_YM = { year: 2023, month: 7 };

/**
 * Konsol Dividen & Payout Yeobo Space. Per bulan: operating profit per
 * cabang, dividen due per investor (per cabang + lintas cabang), input
 * nominal transfer, kumulatif & BEP per investor, riwayat payout.
 *
 * Default bulan = bulan kalender SEBELUMNYA (dividen dibagikan setelah
 * tutup buku). Clamp ke [2023-07 .. bulan berjalan].
 */
export default async function DividenConsolePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const params = await searchParams;

  const now = new Date();
  const curY = now.getFullYear();
  const curM = now.getMonth() + 1; // 1-based
  // Default = bulan sebelumnya.
  let defY = curY;
  let defM = curM - 1;
  if (defM < 1) {
    defM = 12;
    defY -= 1;
  }

  let target = parseYM(params.month) ?? { year: defY, month: defM };
  const minR = ymRank(MIN_YM.year, MIN_YM.month);
  const maxR = ymRank(curY, curM);
  const r = ymRank(target.year, target.month);
  if (r < minR) target = { ...MIN_YM };
  if (r > maxR) target = { year: curY, month: curM };

  const res = await getDividendConsoleData({
    year: target.year,
    month: target.month,
  });

  return (
    <div>
      <Link
        href="/admin/finance?bu=Yeobo%20Space"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3 transition"
      >
        <ArrowLeft size={15} />
        Kembali ke Keuangan
      </Link>
      <PageHeader
        title="Dividen & Payout"
        subtitle="Yeobo Space · bagi hasil per cabang & lintas cabang · sumber payout = riwayat transfer (investor_payouts)"
        action={
          <Link
            href="/admin/investors?tab=payouts"
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-[12.5px] font-medium text-foreground hover:bg-muted transition"
          >
            <Users size={14} />
            Koreksi per kontrak
          </Link>
        }
      />
      {!res.ok ? (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 px-5 py-4 text-sm text-destructive">
          {res.error}
        </div>
      ) : (
        <DividendConsoleClient
          key={ymStr(target.year, target.month)}
          data={res.data!}
          minYm={ymStr(MIN_YM.year, MIN_YM.month)}
          maxYm={ymStr(curY, curM)}
        />
      )}
    </div>
  );
}
