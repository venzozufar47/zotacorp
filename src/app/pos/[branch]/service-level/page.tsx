export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { PosShell } from "@/components/pos/PosShell";
import { ServiceLevelHero } from "@/components/pos/ServiceLevelHero";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { findPosAccount } from "@/lib/actions/pos.actions";
import {
  getServiceLevel,
  getServiceLevelSummary,
} from "@/lib/actions/pos-service-level.actions";
import { posBranchFromParam, posBasePath } from "@/lib/pos/branch";
import { jakartaDateString, jakartaDateMinusDays } from "@/lib/utils/jakarta";

/**
 * Halaman detail Service Level di POS.
 *
 * Hero dibaca dari SNAPSHOT (cepat, satu query). Rincian penyebab
 * terbesar dihitung LIVE karena butuh pecahan per-SKU yang tidak
 * disimpan di snapshot — ~3 detik, tapi halaman ini dibuka sengaja,
 * bukan tiap kali kasir melayani.
 */
export default async function PosServiceLevelPage({
  params,
  searchParams,
}: {
  params: Promise<{ branch: string }>;
  searchParams: Promise<{ days?: string }>;
}) {
  const { branch: branchParam } = await params;
  const branch = posBranchFromParam(branchParam);
  if (!branch) redirect("/pospare");
  const basePath = posBasePath(branchParam);

  const user = await getCurrentUser();
  if (!user) redirect("/");
  const account = await findPosAccount(branch);
  if (!account) redirect("/");
  const isAdmin = (await getCurrentRole()) === "admin";

  const sp = await searchParams;
  const days = sp.days === "7" ? 7 : 30;
  const today = jakartaDateString(new Date());
  const fromDate = jakartaDateMinusDays(today, days - 1);

  const [summaryRes, liveRes] = await Promise.all([
    getServiceLevelSummary(account.id, days),
    getServiceLevel(account.id, { fromDate, toDate: today }).catch(() => null),
  ]);

  const summary = summaryRes.ok ? summaryRes.data : null;
  const live = liveRes && liveRes.ok ? liveRes.data : null;

  return (
    <PosShell
      outletName={account.accountName}
      basePath={basePath}
      active="service-level"
      isAdmin={isAdmin}
      showShiftPill={false}
      title="Service Level"
      subtitle="Berapa persen produk ready stock, dirata-rata sepanjang jam buka."
    >
      <div className="space-y-3.5">
        {summary ? (
          <ServiceLevelHero summary={summary} size="hero" days={days} />
        ) : (
          <div className="rounded-2xl border-2 border-foreground bg-card p-5 text-sm text-muted-foreground">
            Metrik belum aktif untuk outlet ini.
          </div>
        )}

        <div className="flex gap-2">
          {[7, 30].map((d) => (
            <a
              key={d}
              href={`${basePath}/service-level?days=${d}`}
              className={`rounded-full border-2 border-foreground px-3 py-1 text-xs font-bold ${
                days === d ? "bg-primary text-primary-foreground" : "bg-card"
              }`}
            >
              {d} hari
            </a>
          ))}
        </div>

        {live && live.worstSkus.length > 0 && (
          <section className="rounded-2xl border-2 border-foreground bg-card p-4">
            <h2 className="font-display text-sm font-bold">Penyebab terbesar</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Produk yang paling lama kosong. Ini daftar produksinya.
            </p>
            <ul className="mt-2.5 space-y-1.5">
              {live.worstSkus.slice(0, 12).map((w) => (
                <li
                  key={`${w.productId}|${w.variantId ?? ""}`}
                  className="flex items-center gap-2 text-xs"
                >
                  <span className="w-10 shrink-0 text-right font-bold tabular-nums text-destructive">
                    {(w.percentOut * 100).toFixed(0)}%
                  </span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full bg-destructive/70"
                      style={{ width: `${w.percentOut * 100}%` }}
                    />
                  </span>
                  <span className="w-[40%] shrink-0 truncate">{w.label}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {live && (
          <section className="rounded-2xl border-2 border-foreground bg-card p-4">
            <h2 className="font-display text-sm font-bold">Per hari</h2>
            <ul className="mt-2 space-y-1">
              {live.days
                .slice()
                .reverse()
                .map((d) => (
                  <li
                    key={d.date}
                    className="flex items-center gap-2 text-xs tabular-nums"
                  >
                    <span className="w-20 shrink-0 text-muted-foreground">
                      {d.date}
                    </span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      {d.percent !== null && (
                        <span
                          className="block h-full rounded-full bg-primary"
                          style={{ width: `${d.percent * 100}%` }}
                        />
                      )}
                    </span>
                    <span className="w-12 shrink-0 text-right font-semibold">
                      {d.percent === null ? "—" : `${(d.percent * 100).toFixed(0)}%`}
                    </span>
                    {d.partialOpname && (
                      <span
                        title="Opname parsial — SKU yang tidak dihitung terbaca habis"
                        className="shrink-0 text-warning"
                      >
                        ⚠
                      </span>
                    )}
                  </li>
                ))}
            </ul>
            <p className="mt-2.5 text-[11px] text-muted-foreground">
              Hari bertanda “—” tidak dihitung: belum ada opname sebagai
              patokan, atau tidak ada aktivitas sama sekali. Sampel diambil
              tiap jam bulat, jadi kekosongan yang muncul dan teratasi di
              antara dua jam tidak terdeteksi.
            </p>
          </section>
        )}
      </div>
    </PosShell>
  );
}
