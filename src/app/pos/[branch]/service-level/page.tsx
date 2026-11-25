export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { PosShell } from "@/components/pos/PosShell";
import { ServiceLevelHero } from "@/components/pos/ServiceLevelHero";
import { ServiceLevelCauses } from "@/components/pos/ServiceLevelCauses";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { findPosAccount } from "@/lib/actions/pos.actions";
import { getServiceLevelSummary } from "@/lib/actions/pos-service-level.actions";
import { posBranchFromParam, posBasePath } from "@/lib/pos/branch";
import { isMonthToDate } from "@/lib/scorecard/month-window";
import { jakartaDateString, jakartaDateMinusDays } from "@/lib/utils/jakarta";

/**
 * Halaman detail Service Level di POS. Angka besar, penyebab terbesar, dan rincian per hari berasal dari rekaman harian
 * yang sama dengan kartu kasir, scorecard, dan admin.
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
  const today = jakartaDateString(new Date());
  // Pilihan bawaan: 30 hari, atau "Bulan ini" sejak aturan tanggal 1 berlaku.
  const monthMode = isMonthToDate(today);
  const isDefault = sp.days !== "7";
  const days = !isDefault ? 7 : monthMode ? Number(today.slice(8, 10)) : 30;
  const periodLabel = isDefault && monthMode ? "Bulan ini" : `${days} hari`;
  const summaryRes = await getServiceLevelSummary(account.id, { fromDate: jakartaDateMinusDays(today, days - 1), toDate: today }, { detail: true });
  const summary = summaryRes.ok ? summaryRes.data : null;
  const detail = summary?.detail ?? null;

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
      {/* Pembungkus baku halaman POS — max-w-5xl + gutter. Tanpa ini
          konten melar edge-to-edge di layar lebar (lihat riwayat/page.tsx
          dan PosShiftClient yang memakai wrapper yang sama). */}
      <div className="max-w-5xl mx-auto px-3 sm:px-5 py-5 space-y-4">
        {summary ? (
          <>
            <ServiceLevelHero summary={summary} size="hero" periodLabel={periodLabel} />
            {summary.computedAt && (
              <p className="text-[11px] text-muted-foreground">
                Diperbarui {new Date(summary.computedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} WIB. Dihitung ulang tiap jam.
              </p>
            )}
          </>
        ) : (
          <div className="rounded-2xl border-2 border-foreground bg-card p-5 text-sm text-muted-foreground">
            Metrik belum aktif untuk outlet ini.
          </div>
        )}

        <div className="flex gap-2" role="group" aria-label="Rentang waktu">
          {[
            { value: "7", label: "7 hari", active: !isDefault },
            { value: "30", label: monthMode ? "Bulan ini" : "30 hari", active: isDefault },
          ].map((o) => (
            <a
              key={o.value}
              href={`${basePath}/service-level?days=${o.value}`}
              aria-current={o.active ? "true" : undefined}
              className={`inline-flex h-9 items-center rounded-full border-2 border-foreground px-4 text-xs font-bold transition ${
                o.active
                  ? "bg-primary text-primary-foreground"
                  : "bg-card hover:bg-muted"
              }`}
            >
              {o.label}
            </a>
          ))}
        </div>

        {detail && !detail.complete && (
          <p className="text-xs text-muted-foreground">Rincian penyebab per produk muncul setelah rekaman rentang ini diperbarui.</p>
        )}

        {summary && detail && detail.causes.length > 0 && (
          <section className="rounded-2xl border-2 border-foreground bg-card p-5">
            <h2 className="font-display text-sm font-bold">Penyebab terbesar</h2>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Seberapa besar tiap produk menurunkan service level ({periodLabel.toLowerCase()}). Jika dijumlah = 100% − service level.
            </p>
            <ServiceLevelCauses
              skus={detail.causes}
              lostShare={summary.totalSkuSamples > 0 ? summary.lostSkuHours / summary.totalSkuSamples : 0}
              limit={12}
            />
          </section>
        )}

        {detail && (
          <section className="rounded-2xl border-2 border-foreground bg-card p-5">
            <h2 className="font-display text-sm font-bold">Per hari</h2>
            <ul className="mt-3 space-y-2">
              {detail.days
                .slice()
                .reverse()
                .map((d) => (
                  <li
                    key={d.date}
                    className="flex items-center gap-3 text-xs tabular-nums"
                  >
                    <span className="w-[5.5rem] shrink-0 text-muted-foreground">
                      {d.date}
                    </span>
                    <span
                      className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
                      role="img"
                      aria-label={
                        d.percent === null
                          ? `${d.date} tidak dihitung`
                          : `${d.date}: ${(d.percent * 100).toFixed(0)} persen`
                      }
                    >
                      {d.percent !== null && (
                        <span
                          className="block h-full rounded-full bg-primary"
                          style={{ width: `${Math.max(2, d.percent * 100)}%` }}
                        />
                      )}
                    </span>
                    <span className="w-10 shrink-0 text-right font-semibold">
                      {d.percent === null ? "—" : `${(d.percent * 100).toFixed(0)}%`}
                    </span>
                    <span className="w-4 shrink-0 text-center text-warning">
                      {d.partialOpname && (
                        <span title="Opname parsial — SKU yang tidak dihitung terbaca habis">
                          ⚠
                        </span>
                      )}
                    </span>
                  </li>
                ))}
            </ul>
            <p className="mt-4 border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground">
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
