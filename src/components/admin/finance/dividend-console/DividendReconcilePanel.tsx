/**
 * Panel rekonsiliasi dividen: keputusan konsol vs uang yang benar-benar
 * keluar di rekening koran.
 *
 * Read-only dan sengaja tidak mengoreksi apa pun. Keduanya memang boleh
 * berbeda — nominal bank ikut memuat biaya transfer — jadi tugas panel
 * ini menampakkan selisihnya, bukan meniadakannya. Lihat
 * `yeobo-dividend-reconcile.actions.ts` untuk alasan lengkapnya.
 *
 * Server component: tidak ada state, detail per bulan pakai <details>
 * bawaan browser supaya tidak perlu JS di klien.
 */

import { AlertTriangle, Check, Info } from "lucide-react";
import { formatRp } from "@/lib/cashflow/format";
import { MONTH_FULL_NAMES } from "@/lib/utils/date-formats";
import type {
  ReconcilePeriod,
  ReconcileStatus,
} from "@/lib/actions/yeobo-dividend-reconcile.actions";

const STATUS_LABEL: Record<ReconcileStatus, string> = {
  cocok: "Cocok",
  "biaya-transfer": "Selisih = biaya transfer",
  "ledger-kurang": "Ledger lebih kecil",
  "selisih-besar": "Selisih terlalu besar",
  "belum-ditransfer": "Belum ada di rekening koran",
  "tanpa-keputusan": "Tidak ada keputusan konsol",
  kosong: "—",
};

/** Merah = perlu ditindak. Amber = timpang, belum tentu salah. */
const STATUS_TONE: Record<ReconcileStatus, "ok" | "warn" | "bad"> = {
  cocok: "ok",
  "biaya-transfer": "ok",
  "ledger-kurang": "bad",
  "selisih-besar": "bad",
  "belum-ditransfer": "warn",
  "tanpa-keputusan": "warn",
  kosong: "ok",
};

const TONE_CLASS = {
  ok: "bg-muted text-muted-foreground",
  warn: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  bad: "bg-destructive/10 text-destructive",
} as const;

function StatusBadge({ status }: { status: ReconcileStatus }) {
  const tone = STATUS_TONE[status];
  const Icon = tone === "ok" ? Check : tone === "warn" ? Info : AlertTriangle;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${TONE_CLASS[tone]}`}
    >
      <Icon size={11} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function DividendReconcilePanel({
  periods,
}: {
  periods: ReconcilePeriod[];
}) {
  const shown = periods.filter((p) => p.status !== "kosong");
  if (shown.length === 0) return null;

  const bermasalah = shown.filter(
    (p) => STATUS_TONE[p.status] !== "ok"
  ).length;

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-foreground">
          Rekonsiliasi dengan rekening koran
        </h2>
        <span className="text-[11.5px] text-muted-foreground">
          {bermasalah === 0
            ? `${shown.length} bulan diperiksa, semua wajar`
            : `${bermasalah} dari ${shown.length} bulan perlu dilihat`}
        </span>
      </div>
      <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
        Konsol menyimpan keputusan pembagian; rekening koran mencatat uang
        yang keluar. Keduanya tidak saling terhubung, jadi nominal bank
        wajar sedikit lebih besar karena biaya transfer. Yang perlu
        diperiksa adalah ledger yang lebih <em>kecil</em>, atau selisih
        yang kelewat besar.
      </p>

      <div className="mt-3 space-y-2">
        {shown.map((p) => (
          <details
            key={`${p.year}-${p.month}`}
            className="group rounded-xl border border-border bg-background"
            open={STATUS_TONE[p.status] !== "ok"}
          >
            <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-[12.5px] marker:content-none">
              <span className="min-w-[92px] font-semibold text-foreground">
                {MONTH_FULL_NAMES[p.month - 1]} {p.year}
              </span>
              <span className="text-muted-foreground">
                konsol {formatRp(p.consoleTotal)}
              </span>
              <span className="text-muted-foreground">
                bank {formatRp(p.ledgerTotal)}
              </span>
              <span
                className={
                  p.diff === 0
                    ? "text-muted-foreground"
                    : p.diff < 0
                      ? "font-semibold text-destructive"
                      : "text-foreground"
                }
              >
                selisih {p.diff > 0 ? "+" : ""}
                {formatRp(p.diff)}
              </span>
              <span className="ml-auto">
                <StatusBadge status={p.status} />
              </span>
            </summary>

            <div className="border-t border-border px-3 py-2.5">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="pb-1 font-medium">Cabang</th>
                    <th className="pb-1 text-right font-medium">Konsol</th>
                    <th className="pb-1 text-right font-medium">Bank</th>
                    <th className="pb-1 text-right font-medium">Selisih</th>
                  </tr>
                </thead>
                <tbody>
                  {p.branches.map((b) => (
                    <tr key={b.branch} className="border-t border-border/60">
                      <td className="py-1 text-foreground">{b.branch}</td>
                      <td className="py-1 text-right tabular-nums text-muted-foreground">
                        {formatRp(b.consoleTotal)}
                      </td>
                      <td className="py-1 text-right tabular-nums text-muted-foreground">
                        {formatRp(b.ledgerTotal)}
                      </td>
                      <td
                        className={`py-1 text-right tabular-nums ${
                          b.diff === 0
                            ? "text-muted-foreground"
                            : b.diff < 0
                              ? "font-semibold text-destructive"
                              : "text-foreground"
                        }`}
                      >
                        {b.diff > 0 ? "+" : ""}
                        {formatRp(b.diff)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {p.ledgerRows.length > 0 && (
                <div className="mt-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Baris rekening koran di bulan ini
                  </div>
                  <ul className="mt-1 space-y-1">
                    {p.ledgerRows.map((r) => (
                      <li key={r.id} className="text-[11.5px] leading-snug">
                        <span className="tabular-nums text-foreground">
                          {formatRp(r.amount)}
                        </span>
                        <span className="text-muted-foreground">
                          {" · "}
                          {r.date}
                          {" · cabang "}
                          {r.branchTag ?? "—"}
                        </span>
                        {r.bucketFromTxDate && (
                          <span
                            className="ml-1 rounded px-1 py-px text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10"
                            title="Periode efektif kosong — bulan diambil dari tanggal transaksi, bisa salah bucket"
                          >
                            periode dari tanggal transaksi
                          </span>
                        )}
                        <div className="text-muted-foreground">
                          {r.description}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
