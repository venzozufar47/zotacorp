import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRp } from "@/lib/cashflow/format";
import { VARIANCE_REASONS } from "@/lib/procurement/cycle-count";
import { UNLINKED_SPEND_LIMIT, type LeakageReport, type LeakRow, type UnmeasuredKind } from "@/lib/procurement/leakage";

export const LEAKAGE_RANGES = [
  { key: "14", label: "14 hari", days: 14 },
  { key: "30", label: "30 hari", days: 30 },
  { key: "all", label: "Semua", days: null },
] as const;
export type LeakageRangeKey = (typeof LEAKAGE_RANGES)[number]["key"];

const TOP_N = 5;

const qty = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: Math.abs(n) < 10 ? 1 : 0,
  }).format(n);
const signed = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + qty(Math.abs(n));
const pct = (r: number, digits = 0) =>
  `${r > 0 ? "+" : r < 0 ? "−" : ""}${new Intl.NumberFormat("id-ID", { maximumFractionDigits: digits }).format(Math.abs(r) * 100)}%`;
const day = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));
const reasonLabel = (k: string) => VARIANCE_REASONS.find((r) => r.key === k)?.label ?? k;

const UNMEASURED_LABEL: Record<UnmeasuredKind, string> = {
  belum_ulang: "Baru dihitung sekali",
  tanpa_resep: "Tanpa pemakaian resep",
  singkat: "Jarak hitungan kurang dari 3 hari",
  ragu: "Hitungan tak wajar",
  tanpa_harga: "Belum ada harga bahan",
};

const CONFIDENCE = {
  rendah: {
    label: "Keyakinan rendah",
    tone: "text-warning",
    note: "Baca sebagai arah, bukan angka pasti.",
  },
  sedang: {
    label: "Keyakinan sedang",
    tone: "text-warning",
    note: "Cukup untuk menunjuk bahan yang perlu diawasi.",
  },
  baik: {
    label: "Keyakinan baik",
    tone: "text-success",
    note: "Angka ini layak dipakai untuk keputusan.",
  },
} as const;

/** Bagian yang bisa dilipat. `<details>` bawaan: tanpa JavaScript, bisa dioperasikan dengan papan ketik. */
function Fold({
  title,
  count,
  children,
  className,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
  className?: string;
}) {
  if (count === 0) return null;
  return (
    <details className={cn("group rounded-xl border border-border bg-card", className)}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 py-2.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <span>
          {title} <span className="ml-1 font-normal text-muted-foreground tabular-nums">{count}</span>
        </span>
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="border-t border-border">{children}</div>
    </details>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("tabular-nums", strong && "font-semibold")}>{value}</dd>
    </div>
  );
}

function LeakItem({ r }: { r: LeakRow }) {
  const u = r.unit;
  const tone =
    r.status === "bocor" ? "text-destructive" : r.status === "minus" ? "text-warning" : "text-muted-foreground";
  return (
    <details className="group border-b border-border last:border-b-0">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-2.5 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{r.name}</p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {pct(r.ratio)} dari resep · {signed(r.diff)} {u}
          </p>
        </div>
        <span className="hidden w-28 shrink-0 text-right text-sm tabular-nums text-muted-foreground lg:block">
          {qty(r.actual)} {u}
        </span>
        <span className="hidden w-28 shrink-0 text-right text-sm tabular-nums text-muted-foreground lg:block">
          {qty(r.theoretical)} {u}
        </span>
        <span className={cn("shrink-0 text-right text-sm font-semibold tabular-nums lg:w-28", tone)}>
          {r.value >= 0 ? "+" : "−"}
          {formatRp(Math.abs(Math.round(r.value)))}
        </span>
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="px-4 pb-4 text-sm lg:grid lg:grid-cols-2 lg:gap-x-8">
        <dl className="space-y-1">
          <Line label="Barang masuk" value={`${qty(r.incoming)} ${u}`} />
          <Line
            label={r.stockChange <= 0 ? "Stok turun" : "Stok naik"}
            value={`${qty(Math.abs(r.stockChange))} ${u}`}
          />
          <Line label="Terpakai (masuk − perubahan stok)" value={`${qty(r.actual)} ${u}`} strong />
        </dl>
        <dl className="mt-3 space-y-1 border-t border-border pt-3 lg:mt-0 lg:border-t-0 lg:pt-0">
          <Line label="Seharusnya (resep × produksi)" value={`${qty(r.theoretical)} ${u}`} />
          <Line label="Selisih" value={`${signed(r.diff)} ${u} (${pct(r.ratio)})`} strong />
          <Line label="Batas wajar" value={`±${Math.round(r.tolerance * 100)}%`} />
        </dl>
        <div className="mt-3 space-y-1 text-xs text-muted-foreground lg:col-span-2">
          <p>
            {day(r.from)} sampai {day(r.to)} · {r.spanDays} hari · {r.pairs} pasang hitungan
          </p>
          {r.reasons.length > 0 && <p>Alasan dari staf: {r.reasons.map(reasonLabel).join(", ")}</p>}
        </div>
      </div>
    </details>
  );
}

export function LeakageTab({ brand, range, report }: { brand: string; range: LeakageRangeKey; report: LeakageReport }) {
  const conf = CONFIDENCE[report.confidence];
  const covered = report.coverageCost == null ? 0 : Math.round(report.coverageCost * 100);
  const hasMeasured = report.measuredCount > 0;
  const noData = report.recipeCount === 0 && report.unmeasured.length === 0 && report.checks.length === 0;
  const topLeaks = report.leaks.slice(0, TOP_N);
  const moreLeaks = report.leaks.slice(TOP_N);

  const unmeasuredGroups = (Object.keys(UNMEASURED_LABEL) as UnmeasuredKind[])
    .map((k) => ({
      kind: k,
      rows: report.unmeasured.filter((u) => u.kind === k),
    }))
    .filter((g) => g.rows.length > 0 && g.kind !== "ragu");

  return (
    <section className="grid gap-3 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start lg:gap-6">
      <div className="space-y-3 lg:sticky lg:top-4">
        <div role="group" aria-label="Periode" className="inline-flex rounded-lg bg-muted p-0.5">
          {LEAKAGE_RANGES.map((o) => (
            <Link
              key={o.key}
              href={`/admin/costing?tab=kebocoran&bu=${encodeURIComponent(brand)}&r=${o.key}`}
              aria-current={o.key === range ? "true" : undefined}
              className={cn(
                "inline-flex min-h-9 items-center rounded-md px-3 text-sm transition-colors",
                o.key === range ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {o.label}
            </Link>
          ))}
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Bocor di luar batas wajar</p>
          {hasMeasured ? (
            <>
              <p
                className={cn(
                  "mt-0.5 font-display text-3xl font-bold tabular-nums",
                  report.leakValue > 0 ? "text-destructive" : "text-foreground"
                )}
              >
                {formatRp(Math.round(report.leakValue))}
              </p>
              {report.leakPct != null && (
                <p className="text-sm text-muted-foreground tabular-nums">
                  {new Intl.NumberFormat("id-ID", {
                    maximumFractionDigits: 1,
                  }).format(report.leakPct * 100)}
                  % dari pemakaian bahan yang terukur
                </p>
              )}
            </>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              {noData
                ? "Belum ada opname atau produksi untuk brand ini."
                : "Belum ada bahan yang terukur. Satu bahan perlu dihitung dua kali, berjarak 3 hari atau lebih."}
            </p>
          )}

          {!noData && (
            <div className="mt-4 space-y-1.5">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className={cn("font-medium", conf.tone)}>{conf.label}</span>
                <span className="text-muted-foreground tabular-nums">
                  {covered}% biaya terukur · {report.measuredCount} dari {report.recipeCount} bahan
                </span>
              </div>
              <div
                role="progressbar"
                aria-label="Cakupan biaya bahan yang terukur"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={covered}
                className="h-1.5 overflow-hidden rounded-full bg-muted"
              >
                <div className="h-full rounded-full bg-primary" style={{ width: `${covered}%` }} />
              </div>
              {hasMeasured && <p className="text-xs text-muted-foreground">{conf.note}</p>}
              {report.unlinkedSpendShare != null && report.unlinkedSpendShare > UNLINKED_SPEND_LIMIT && (
                <p className="text-xs text-warning">
                  {Math.round(report.unlinkedSpendShare * 100)}% belanja belum tertaut ke bahan. Barang masuk tercatat
                  kurang, jadi kebocoran tampak lebih besar dari sebenarnya.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="min-w-0 space-y-3">
        {topLeaks.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <h2 className="px-4 pt-3 pb-1 text-sm font-medium">
              Penyumbang terbesar{" "}
              <span className="ml-1 font-normal text-muted-foreground tabular-nums">{report.leaks.length}</span>
            </h2>
            <div className="hidden items-center gap-3 border-b border-border px-4 pb-1.5 text-xs text-muted-foreground lg:flex">
              <span className="flex-1">Bahan</span>
              <span className="w-28 text-right">Terpakai</span>
              <span className="w-28 text-right">Seharusnya</span>
              <span className="w-28 text-right">Selisih</span>
              <span className="w-4" aria-hidden />
            </div>
            {topLeaks.map((r) => (
              <LeakItem key={r.id} r={r} />
            ))}
            {moreLeaks.length > 0 && (
              <details className="group">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-1 border-t border-border px-4 text-sm text-primary [&::-webkit-details-marker]:hidden">
                  Tampilkan {moreLeaks.length} lainnya
                  <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                {moreLeaks.map((r) => (
                  <LeakItem key={r.id} r={r} />
                ))}
              </details>
            )}
          </div>
        )}
        {hasMeasured && topLeaks.length === 0 && (
          <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            Tidak ada bahan yang melewati batas wajar pada bahan yang terukur.
          </p>
        )}

        <Fold title="Perlu dicek" count={report.checks.length + report.minus.length}>
          {report.checks.map((c) => (
            <div key={`${c.materialId}-${c.date}`} className="border-b border-border px-4 py-3 text-sm last:border-b-0">
              <p className="font-medium">
                {c.name} <span className="font-normal text-muted-foreground">· {day(c.date)}</span>
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">
                Dihitung {qty(c.qty)} {c.unit}, perkiraan sistem {qty(c.expected)} {c.unit}. Hitungan ini tidak masuk
                angka di atas.
                {c.reason ? ` Alasan staf: ${reasonLabel(c.reason)}.` : ""}
              </p>
            </div>
          ))}
          {report.minus.length > 0 && (
            <p className="border-b border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
              Stok lebih banyak dari seharusnya. Biasanya belanja belum tercatat atau resep terlalu besar.
            </p>
          )}
          {report.minus.map((r) => (
            <LeakItem key={r.id} r={r} />
          ))}
        </Fold>

        <Fold title="Belum terukur" count={unmeasuredGroups.reduce((s, g) => s + g.rows.length, 0)}>
          <div className="space-y-3 px-4 py-3 text-sm">
            {unmeasuredGroups.map((g) => (
              <div key={g.kind}>
                <p className="font-medium">
                  {UNMEASURED_LABEL[g.kind]}{" "}
                  <span className="font-normal text-muted-foreground tabular-nums">{g.rows.length}</span>
                </p>
                <p className="text-xs text-muted-foreground">{g.rows.map((r) => r.name).join(", ")}</p>
              </div>
            ))}
          </div>
        </Fold>

        <Fold title="Wajar" count={report.fair.length}>
          {report.fair.map((r) => (
            <LeakItem key={r.id} r={r} />
          ))}
        </Fold>

        <details className="group px-1">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 text-xs text-muted-foreground [&::-webkit-details-marker]:hidden">
            Cara membaca laporan
            <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <ul className="space-y-1.5 pb-3 text-xs text-muted-foreground">
            <li>Terpakai nyata = stok awal + barang masuk − stok akhir, dari dua hitungan opname berurutan.</li>
            <li>Seharusnya = resep × produksi di POS pada hari yang sama, termasuk susut.</li>
            <li>
              Bocor = terpakai nyata melebihi seharusnya di atas batas wajar kategori dan bernilai minimal Rp 5.000.
            </li>
            <li>Hanya bahan yang terukur yang dijumlahkan. Bahan lain tidak diperkirakan.</li>
          </ul>
        </details>
      </div>
    </section>
  );
}
