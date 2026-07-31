import { AlertTriangle } from "lucide-react";
import { getServiceLevelSummary } from "@/lib/actions/pos-service-level.actions";
import type { ServiceLevelOutlet } from "@/lib/pos/service-level-access";

/**
 * Panel Service Level di dashboard karyawan, untuk penanggung jawab metrik.
 *
 * MANDIRI — menampilkan angkanya sendiri tanpa tautan ke halaman POS.
 * Penanggung jawab belum tentu punya akses POS, jadi tautan ke sana bisa
 * berujung penolakan. Dibaca dari SNAPSHOT saja, tidak menghitung live:
 * selain ~3 detik, RLS tabel POS mentah memang tertutup untuk mereka.
 *
 * Gaya mengikuti idiom dashboard karyawan (`.panel-sticker`), bukan gaya
 * POS — dua permukaan itu punya bahasa visual berbeda.
 */

function tone(pct: number | null): string {
  if (pct === null) return "text-muted-foreground";
  if (pct >= 0.95) return "text-success";
  if (pct >= 0.85) return "text-warning";
  return "text-destructive";
}

/** Sparkline sederhana: satu batang per hari, tinggi = persentase. */
function Sparkline({ trend }: { trend: Array<{ date: string; percent: number | null }> }) {
  const last = trend.slice(-30);
  if (last.length === 0) return null;
  return (
    <div className="flex items-end gap-[2px] h-8" aria-hidden>
      {last.map((d) => (
        <div
          key={d.date}
          title={`${d.date}: ${d.percent === null ? "tidak dihitung" : (d.percent * 100).toFixed(0) + "%"}`}
          className={`flex-1 min-w-[2px] rounded-sm ${
            d.percent === null ? "bg-border" : "bg-primary"
          }`}
          style={{
            height: d.percent === null ? "4px" : `${Math.max(6, d.percent * 100)}%`,
          }}
        />
      ))}
    </div>
  );
}

export async function ServiceLevelPanel({
  outlets,
}: {
  outlets: ServiceLevelOutlet[];
}) {
  if (outlets.length === 0) return null;

  const summaries = await Promise.all(
    outlets.map(async (o) => {
      const res = await getServiceLevelSummary(o.bankAccountId, 30);
      return { outlet: o, summary: res.ok ? res.data : null };
    })
  );

  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <h2 className="font-display text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
          Service Level
        </h2>
        <span className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
      </div>

      <div className="panel-sticker p-5 space-y-4">
        <p className="text-xs text-muted-foreground">
          Berapa persen produk ready stock, dirata-rata sepanjang jam buka.
          Target 100%. Kamu penanggung jawab metrik ini.
        </p>

        {summaries.map(({ outlet, summary }) => (
          <div key={outlet.bankAccountId} className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {outlet.branch ?? outlet.accountName}
            </p>
            {!summary || summary.daysCounted === 0 ? (
              <p className="text-sm text-muted-foreground">
                Belum ada data terhitung.
              </p>
            ) : (
              <>
                <div className="flex items-baseline gap-3">
                  <span
                    className={`font-display text-4xl sm:text-5xl font-extrabold tabular-nums leading-none ${tone(
                      summary.percent
                    )}`}
                  >
                    {summary.percent === null
                      ? "—"
                      : `${(summary.percent * 100).toFixed(1)}%`}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    30 hari · {summary.lostSkuHours.toLocaleString("id-ID")}{" "}
                    SKU-jam kosong
                  </span>
                </div>
                <Sparkline trend={summary.trend} />
                {summary.hasPartialOpname && (
                  <p className="flex items-start gap-1.5 text-[11px] text-warning">
                    <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                    Ada hari dengan opname parsial — SKU yang tidak ikut
                    dihitung saat opname terbaca habis.
                  </p>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
