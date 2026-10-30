"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Copy, Download, Eye, EyeOff, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  getFeedbackAdminData,
  setFeedbackHidden,
  type FeedbackAdminData,
  type FeedbackRow,
} from "@/lib/actions/feedback.actions";
import {
  ASPECT_LABEL,
  FEEDBACK_ASPECTS,
  FEEDBACK_DAILY_TARGET,
  FEEDBACK_SLUGS,
  type FeedbackBranch,
} from "@/lib/feedback/constants";

/** Alamat produksi yang dicetak di QR (bukan alamat tempat admin membuka halaman ini, mis. localhost). */
const PUBLIC_BASE = "https://team.zotacorp.com";

const BRANCH_FILTERS: { value: FeedbackBranch | "all"; label: string }[] = [
  { value: "all", label: "Semua cabang" },
  { value: "Pare", label: "Pare" },
  { value: "Semarang", label: "Semarang" },
];
const RANGES = [7, 30, 90];

const avgText = (n: number | null) => (n == null ? "—" : n.toFixed(2).replace(".", ","));
const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
const when = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function Stars({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${n} dari 5 bintang`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={14} aria-hidden className={i <= n ? "fill-warning text-warning" : "text-muted-foreground/40"} />
      ))}
    </span>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3.5">
      <p className="text-[11.5px] font-semibold text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-display text-2xl font-extrabold tabular-nums leading-tight">{value}</p>
      {sub && <p className="mt-0.5 text-[11.5px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function QrCard({ slug, brand }: { slug: string; brand: string }) {
  const url = `${PUBLIC_BASE}/feedback/${slug}`;
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(url, { width: 640, margin: 2, errorCorrectionLevel: "M" })
      .then((d) => live && setSrc(d))
      .catch(() => live && setSrc(null));
    return () => {
      live = false;
    };
  }, [url]);
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={`QR feedback ${brand}`} width={96} height={96} className="size-24 shrink-0 rounded-lg border border-border bg-white" />
      ) : (
        <div className="size-24 shrink-0 animate-pulse rounded-lg bg-muted" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold">{brand}</p>
        <p className="truncate text-[11.5px] text-muted-foreground">{url}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              navigator.clipboard?.writeText(url).then(
                () => toast.success("Tautan disalin"),
                () => toast.error("Gagal menyalin")
              );
            }}
          >
            <Copy size={13} /> Salin
          </Button>
          {src && (
            <a
              href={src}
              download={`qr-feedback-${slug}.png`}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border-2 border-border bg-background px-2.5 text-[12.5px] font-semibold hover:bg-muted"
            >
              <Download size={13} /> Unduh PNG
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export function FeedbackAdminClient({ initial }: { initial: FeedbackAdminData | null }) {
  const [branch, setBranch] = useState<FeedbackBranch | "all">("all");
  const [days, setDays] = useState(30);
  const [ratingFilter, setRatingFilter] = useState<"all" | "low">("all");
  const [data, setData] = useState<FeedbackAdminData | null>(initial);
  const [pending, startTransition] = useTransition();
  const first = useRef(true);

  const load = useCallback((b: FeedbackBranch | "all", d: number) => {
    startTransition(async () => {
      const r = await getFeedbackAdminData({ branch: b, days: d });
      if (r.ok && r.data) setData(r.data);
      else toast.error(r.ok ? "Gagal memuat" : r.error);
    });
  }, []);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    load(branch, days);
  }, [branch, days, load]);

  const toggleHidden = (row: FeedbackRow) => {
    startTransition(async () => {
      const r = await setFeedbackHidden(row.id, !row.hidden);
      if (!r.ok) return void toast.error(r.error);
      toast.success(row.hidden ? "Ditampilkan kembali" : "Disembunyikan dari hitungan");
      const fresh = await getFeedbackAdminData({ branch, days });
      if (fresh.ok && fresh.data) setData(fresh.data);
    });
  };

  const s = data?.stats;
  const perDayAvg = s ? s.count / days : 0;
  const rows = (data?.rows ?? []).filter((r) => (ratingFilter === "low" ? r.rating <= 3 : true));
  const maxDist = s ? Math.max(1, ...s.distribution) : 1;
  const aspectRows = s
    ? FEEDBACK_ASPECTS.map((a) => ({ key: a.key, label: a.label, n: s.aspectCounts[a.key] ?? 0 })).sort((a, b) => b.n - a.n)
    : [];

  return (
    <div className="space-y-5 p-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Feedback Customer</h1>
        <p className="text-sm text-muted-foreground">
          Masukan pelanggan dari halaman feedback tiap cabang. Rata-rata bintang 30 hari terakhir masuk ke Scorecard Cabang.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Cabang" className="inline-flex rounded-xl border-2 border-border bg-card p-0.5">
          {BRANCH_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={branch === f.value}
              onClick={() => setBranch(f.value)}
              className={cn(
                "min-h-9 rounded-lg px-3 text-[12.5px] font-semibold",
                branch === f.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Rentang" className="inline-flex rounded-xl border-2 border-border bg-card p-0.5">
          {RANGES.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={days === d}
              onClick={() => setDays(d)}
              className={cn(
                "min-h-9 rounded-lg px-3 text-[12.5px] font-semibold",
                days === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              )}
            >
              {d} hari
            </button>
          ))}
        </div>
        {pending && <span className="text-[12px] text-muted-foreground">Memuat…</span>}
      </div>

      {!s || s.count === 0 ? (
        <p className="rounded-2xl border-2 border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Belum ada feedback pada rentang ini. Cetak QR di bagian bawah dan taruh di kasir atau meja.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-5">
            <Stat label="Rata-rata bintang" value={`${avgText(s.average)} ★`} sub={`${s.count} feedback`} />
            <Stat
              label="Rata-rata per hari"
              value={perDayAvg.toFixed(1).replace(".", ",")}
              sub={`target ${FEEDBACK_DAILY_TARGET} per hari${branch === "all" ? " per cabang" : ""}`}
            />
            <Stat
              label="Tombol dipilih per pelanggan"
              value={s.avgAspects == null ? "—" : s.avgAspects.toFixed(1).replace(".", ",")}
              sub="rata-rata; makin kecil, pilihan makin tajam"
            />
            <Stat label="Pelanggan baru" value={`${pct(s.firstCount, s.count)}%`} sub={`${s.firstCount} dari ${s.count}`} />
            <Stat label="Pelanggan lama" value={`${pct(s.returningCount, s.count)}%`} sub={`${s.returningCount} dari ${s.count}`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-border bg-card p-4">
              <h2 className="mb-2.5 text-[13px] font-bold">Sebaran bintang</h2>
              <ul className="space-y-1.5">
                {[5, 4, 3, 2, 1].map((n) => (
                  <li key={n} className="flex items-center gap-2 text-[12.5px]">
                    <span className="w-6 shrink-0 tabular-nums">{n} ★</span>
                    <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <span className="block h-full rounded-full bg-primary" style={{ width: `${(s.distribution[n - 1] / maxDist) * 100}%` }} />
                    </span>
                    <span className="w-14 shrink-0 text-right tabular-nums text-muted-foreground">
                      {s.distribution[n - 1]} ({pct(s.distribution[n - 1], s.count)}%)
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-2xl border border-border bg-card p-4">
              <h2 className="mb-0.5 text-[13px] font-bold">Masukan yang dipilih</h2>
              <p className="mb-2.5 text-[11.5px] text-muted-foreground">Persen dari seluruh pelanggan pada rentang ini (satu pelanggan bisa memilih beberapa).</p>
              <ul className="space-y-1.5">
                {aspectRows.map((a) => (
                  <li key={a.key} className="flex items-center gap-2 text-[12.5px]">
                    <span className="w-36 shrink-0 truncate">{a.label}</span>
                    <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <span className="block h-full rounded-full bg-primary/70" style={{ width: `${pct(a.n, s.count)}%` }} />
                    </span>
                    <span className="w-16 shrink-0 text-right tabular-nums text-muted-foreground">
                      {pct(a.n, s.count)}% ({a.n})
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {data && data.position.responses > 0 && (
            <section className="rounded-2xl border border-border bg-card p-4">
              <h2 className="mb-0.5 text-[13px] font-bold">Pemeriksaan bias posisi</h2>
              <p className="mb-2.5 text-[11.5px] text-muted-foreground">
                Urutan tombol diacak per pelanggan. Tabel ini menunjukkan seberapa sering tombol di tiap posisi dipilih saat ditampilkan. Bila posisi atas
                konsisten jauh lebih tinggi daripada posisi bawah, ada bias posisi. {data.position.responses < 100
                  ? `Baru ${data.position.responses} jawaban beracak, belum cukup untuk disimpulkan (butuh sekitar 100 atau lebih).`
                  : `Dari ${data.position.responses} jawaban beracak.`}
              </p>
              <ul className="space-y-1.5">
                {data.position.slots.map((p, i) => (
                  <li key={i} className="flex items-center gap-2 text-[12.5px]">
                    <span className="w-16 shrink-0">Posisi {i + 1}</span>
                    <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <span className="block h-full rounded-full bg-primary/50" style={{ width: `${pct(p.selected, p.shown)}%` }} />
                    </span>
                    <span className="w-24 shrink-0 text-right tabular-nums text-muted-foreground">
                      {pct(p.selected, p.shown)}% ({p.selected}/{p.shown})
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data && data.wishes.length > 0 && (
            <section className="rounded-2xl border border-border bg-card p-4">
              <h2 className="mb-2.5 text-[13px] font-bold">Permintaan produk baru ({data.wishes.length})</h2>
              <ul className="max-h-64 space-y-1.5 overflow-y-auto text-[13px]">
                {data.wishes.map((w, i) => (
                  <li key={i} className="flex items-baseline gap-2">
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-semibold text-muted-foreground">{w.branch}</span>
                    <span className="min-w-0 flex-1 break-words">{w.text}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{when(w.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <section className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[13px] font-bold">Semua masukan</h2>
          <div role="group" aria-label="Filter bintang" className="inline-flex rounded-xl border-2 border-border bg-card p-0.5">
            {(
              [
                ["all", "Semua"],
                ["low", "Bintang 3 ke bawah"],
              ] as const
            ).map(([v, l]) => (
              <button
                key={v}
                type="button"
                aria-pressed={ratingFilter === v}
                onClick={() => setRatingFilter(v)}
                className={cn(
                  "min-h-8 rounded-lg px-3 text-[12px] font-semibold",
                  ratingFilter === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                )}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Tidak ada entri.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.id} className={cn("rounded-2xl border border-border bg-card p-3.5", r.hidden && "opacity-60")}>
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <Stars n={r.rating} />
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-semibold text-muted-foreground">{r.branch}</span>
                  <span className="text-[11.5px] text-muted-foreground">{r.visitType === "first" ? "Baru pertama kali" : "Sudah pernah datang"}</span>
                  <span className="ml-auto text-[11px] text-muted-foreground">{when(r.createdAt)}</span>
                </div>
                {r.aspects.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {r.aspects.map((a) => (
                      <span key={a} className="rounded-full border border-border bg-background px-2.5 py-0.5 text-[11.5px] font-medium">
                        {ASPECT_LABEL[a] ?? a}
                      </span>
                    ))}
                  </div>
                )}
                {r.comment && <p className="mt-2 break-words text-[13px] leading-snug">{r.comment}</p>}
                {r.productWish && (
                  <p className="mt-1.5 text-[12.5px] text-muted-foreground">
                    <span className="font-semibold">Ingin produk:</span> {r.productWish}
                  </p>
                )}
                <div className="mt-2 flex items-center justify-between">
                  {r.hidden ? <span className="text-[11px] font-semibold text-muted-foreground">Disembunyikan dari hitungan</span> : <span />}
                  <button
                    type="button"
                    onClick={() => toggleHidden(r)}
                    disabled={pending}
                    className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-[12px] font-semibold text-muted-foreground hover:bg-muted"
                  >
                    {r.hidden ? <Eye size={13} /> : <EyeOff size={13} />} {r.hidden ? "Tampilkan" : "Sembunyikan"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {data && data.rows.length >= 300 && <p className="text-[11.5px] text-muted-foreground">Menampilkan 300 entri terbaru. Statistik di atas mencakup semua entri pada rentang.</p>}
      </section>

      <section className="space-y-2.5">
        <h2 className="text-[13px] font-bold">QR untuk dicetak</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {Object.entries(FEEDBACK_SLUGS).map(([slug, t]) => (
            <QrCard key={slug} slug={slug} brand={t.brand} />
          ))}
        </div>
      </section>
    </div>
  );
}
