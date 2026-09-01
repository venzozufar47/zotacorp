import { getServiceLevelSummary } from "@/lib/actions/pos-service-level.actions";
import type { ServiceLevelOutlet } from "@/lib/pos/service-level-access";
import { serviceLevelTone } from "@/lib/pos/service-level";

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
 *
 * Sengaja diringkas: cuma persentase. Tidak ada sparkline, tidak ada
 * "SKU-jam kosong", tidak ada peringatan opname parsial — rincian itu
 * ada di halaman detail POS (/pos/[branch]/service-level) untuk yang
 * juga assignee POS; panel ini untuk sekilas lihat saja.
 */

function tone(pct: number | null, target: number): string {
  switch (serviceLevelTone(pct, target)) {
    case "success":
      return "text-success";
    case "warning":
      return "text-warning";
    case "destructive":
      return "text-destructive";
    default:
      return "text-muted-foreground";
  }
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
          Kamu penanggung jawab metrik ini.
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
              <div className="flex items-baseline gap-3">
                <span
                  className={`font-display text-4xl sm:text-5xl font-extrabold tabular-nums leading-none ${tone(
                    summary.percent,
                    summary.target
                  )}`}
                >
                  {summary.percent === null
                    ? "—"
                    : `${(summary.percent * 100).toFixed(1)}%`}
                </span>
                <span className="text-xs text-muted-foreground">
                  30 hari · target {(summary.target * 100).toFixed(0)}%
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
