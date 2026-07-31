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
      {/* Pembungkus baku halaman POS — max-w-5xl + gutter. Tanpa ini
          konten melar edge-to-edge di layar lebar (lihat riwayat/page.tsx
          dan PosShiftClient yang memakai wrapper yang sama). */}
      <div className="max-w-5xl mx-auto px-3 sm:px-5 py-5 space-y-4">
        {summary ? (
          <ServiceLevelHero summary={summary} size="hero" days={days} />
        ) : (
          <div className="rounded-2xl border-2 border-foreground bg-card p-5 text-sm text-muted-foreground">
            Metrik belum aktif untuk outlet ini.
          </div>
        )}

        <div className="flex gap-2" role="group" aria-label="Rentang waktu">
          {[7, 30].map((d) => (
            <a
              key={d}
              href={`${basePath}/service-level?days=${d}`}
              aria-current={days === d ? "true" : undefined}
              className={`inline-flex h-9 items-center rounded-full border-2 border-foreground px-4 text-xs font-bold transition ${
                days === d
                  ? "bg-primary text-primary-foreground"
                  : "bg-card hover:bg-muted"
              }`}
            >
              {d} hari
            </a>
          ))}
        </div>

        {live && live.worstSkus.length > 0 && (
          <section className="rounded-2xl border-2 border-foreground bg-card p-5">
            <h2 className="font-display text-sm font-bold">Penyebab terbesar</h2>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Produk yang paling lama kosong. Ini daftar produksinya.
            </p>
            {/* Nama DULU, lalu bar, lalu angka. Sebelumnya bar mengambil
                seluruh sisa lebar sehingga labelnya terdampar ~900px di
                kanan — mata harus melompat jauh untuk memasangkan
                keduanya. Track bar dipatok lebarnya supaya tetap dekat
                dengan namanya di layar selebar apa pun. */}
            <ul className="mt-3 space-y-2">
              {live.worstSkus.slice(0, 12).map((w) => (
                <li
                  key={`${w.productId}|${w.variantId ?? ""}`}
                  className="flex items-center gap-3 text-xs"
                >
                  <span className="min-w-0 flex-1 truncate" title={w.label}>
                    {w.label}
                  </span>
                  <span
                    className="h-2.5 w-24 shrink-0 overflow-hidden rounded-full bg-muted sm:w-40"
                    role="img"
                    aria-label={`${w.label} kosong ${(w.percentOut * 100).toFixed(0)} persen waktu`}
                  >
                    <span
                      className="block h-full rounded-full bg-destructive"
                      style={{ width: `${Math.max(2, w.percentOut * 100)}%` }}
                    />
                  </span>
                  <span className="w-10 shrink-0 text-right font-bold tabular-nums text-destructive">
                    {(w.percentOut * 100).toFixed(0)}%
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {live && (
          <section className="rounded-2xl border-2 border-foreground bg-card p-5">
            <h2 className="font-display text-sm font-bold">Per hari</h2>
            <ul className="mt-3 space-y-2">
              {live.days
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
