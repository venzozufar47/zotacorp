"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Info } from "lucide-react";
import { getKitchenCapacity, type KitchenCapacityData } from "@/lib/actions/pos-kitchen.actions";
import {
  CONSERVATIVE_FACTOR,
  DIAGNOSIS_TEXT,
  checkAddOrder,
  type AddOrderStatus,
} from "@/lib/pos/kitchen-capacity";
import { cn } from "@/lib/utils";

const dayMonth = (ymd: string) => {
  const d = new Date(ymd + "T00:00:00Z");
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
};
const longDate = (ymd: string) =>
  new Date(ymd + "T00:00:00Z").toLocaleDateString("id-ID", { timeZone: "UTC", day: "numeric", month: "short" });
const pct = (n: number, d = 0) => `${n.toFixed(d).replace(".", ",")}%`;

/**
 * Evaluasi produksi harian dari riwayat: output sekarang vs REKOR REGULER (tanpa lembur), bukan kapasitas fisik.
 * Definisi lengkap dan batasannya ada di `lib/pos/kitchen-capacity`.
 */
export function KitchenCapacityView({ bankAccountId }: { bankAccountId: string }) {
  const [data, setData] = useState<KitchenCapacityData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await getKitchenCapacity(bankAccountId);
        if (cancelled) return;
        if (!res.ok) setError(res.error);
        else setData(res.data!);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Gagal memuat");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bankAccountId]);

  if (error)
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>
    );
  if (!data)
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 size={14} className="animate-spin" /> Menghitung dari riwayat produksi…
      </div>
    );
  if (!data.enabled || !data.verdict)
    return (
      <section className="rounded-2xl border border-border bg-card p-4 text-sm">
        <p className="font-semibold">Belum ada patokan untuk cabang {data.branch ?? "ini"}</p>
        <p className="mt-1 text-muted-foreground">
          Rekor dihitung dari tim yang stabil dan absensi baker yang rapi. Untuk cabang ini datanya belum cukup, jadi
          angkanya sengaja tidak ditampilkan daripada menyesatkan.
        </p>
      </section>
    );

  return <Loaded data={data} />;
}

function Loaded({ data }: { data: KitchenCapacityData }) {
  const v = data.verdict!;
  const [extra, setExtra] = useState("");
  const extraNum = Number(extra.replace(/[^0-9]/g, "")) || 0;
  const status = extraNum > 0 ? checkAddOrder(v, extraNum) : null;

  return (
    <div className="space-y-4">
      {v.record && v.current != null ? (
        <VerdictCard data={data} />
      ) : (
        <section className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
          Hari kerja tanpa lembur belum cukup ({v.normalDays} dari 15 hari) untuk menghitung rekor.
        </section>
      )}

      {v.record && v.current != null && (
        <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Cek tambahan order
          </p>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Tambah</span>
            <input
              inputMode="numeric"
              value={extra}
              onChange={(e) => setExtra(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="0"
              className="h-9 w-20 rounded-lg border border-border bg-background px-2 text-right tabular-nums"
            />
            <span className="text-muted-foreground">pcs per hari dari rata-rata sekarang ({v.current})</span>
          </label>
          {status && <AddOrderResult status={status} total={v.current + extraNum} record={v.record.avg} />}
        </section>
      )}

      <WeeklyChart data={data} />
      <HoursChart data={data} />

      <p className="flex gap-1.5 text-[11px] leading-snug text-muted-foreground">
        <Info size={12} className="mt-0.5 shrink-0" />
        <span>
          Ini patokan &ldquo;terbukti pernah dicapai tim yang sama tanpa lembur&rdquo;, bukan kapasitas fisik (waktu proses oven
          dan tenaga tidak tercatat). Rekor = rata-rata terbaik 15 hari kerja berturut-turut; hari bertanda lembur
          dikeluarkan ({data.overtimeDays} hari sejak 1 Jun). Jam produksi adalah jam pencatatan, bukan jam di oven.
        </span>
      </p>
    </div>
  );
}

function VerdictCard({ data }: { data: KitchenCapacityData }) {
  const v = data.verdict!;
  const record = v.record!.avg;
  const current = v.current!;
  const scaleMax = Math.max(record * 1.12, current * 1.05);
  const at = (n: number) => `${Math.min(100, (n / scaleMax) * 100)}%`;
  const conservative = Math.round(record * CONSERVATIVE_FACTOR);

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Output {data.branch} · 15 hari kerja normal terakhir
          </p>
          <p className="font-display text-4xl font-extrabold tabular-nums leading-none">
            {current} <span className="text-base font-semibold text-muted-foreground">pcs/hari</span>
          </p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <p>
            Rekor reguler <b className="text-foreground tabular-nums">{record}</b> pcs/hari
          </p>
          <p>berakhir {longDate(v.record!.endDate)}</p>
        </div>
      </div>

      <div>
        <div className="relative h-6 rounded-md bg-muted/60">
          <div className="absolute inset-y-0 left-0 rounded-md bg-primary/80" style={{ width: at(current) }} />
          <span
            aria-hidden
            className="absolute -inset-y-1 w-0.5 bg-warning"
            style={{ left: at(conservative) }}
            title={`90% rekor = ${conservative}`}
          />
          <span
            aria-hidden
            className="absolute -inset-y-1 w-0.5 bg-foreground"
            style={{ left: at(record) }}
            title={`Rekor ${record}`}
          />
        </div>
        <div className="relative mt-1 h-4 text-[10px] text-muted-foreground">
          <span className="absolute -translate-x-full whitespace-nowrap pr-1" style={{ left: at(conservative) }}>
            90% · {conservative}
          </span>
          <span className="absolute whitespace-nowrap pl-1 font-semibold text-foreground" style={{ left: at(record) }}>
            rekor {record}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Sekarang vs rekor" value={pct((v.ratio ?? 0) * 100)} />
        <Stat label="Ruang konservatif" value={`+${v.roomConservative}`} sub="pcs/hari" />
        <Stat label="Ruang sampai rekor" value={`+${v.roomFull}`} sub="pcs/hari" />
      </div>

      <div className="rounded-xl bg-muted/50 px-3 py-2 text-sm leading-snug">
        {DIAGNOSIS_TEXT[data.diagnosis]}
        <span className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
          <span>Waste 30 hari {data.wastePct == null ? "—" : pct(data.wastePct, 1)}</span>
          <span>Service level 30 hari {data.serviceLevel == null ? "—" : pct(data.serviceLevel * 100)}</span>
        </span>
      </div>
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-muted/40 px-2 py-2">
      <p className="text-[10px] leading-tight text-muted-foreground">{label}</p>
      <p className="font-display text-lg font-extrabold tabular-nums leading-tight">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

const ADD_ORDER_COPY: Record<AddOrderStatus, { tone: string; title: string; body: (t: number, r: number) => string }> = {
  aman: {
    tone: "border-success/40 bg-success/10",
    title: "Masih di bawah patokan konservatif",
    body: (t) => `Total sekitar ${t} pcs/hari. Tim pernah mengerjakan lebih banyak tanpa lembur, jadi klaim "penuh" tidak didukung data.`,
  },
  mendekati: {
    tone: "border-warning/50 bg-warning/10",
    title: "Mendekati rekor reguler",
    body: (t, r) => `Total sekitar ${t} pcs/hari, masih di bawah rekor ${r} yang pernah dicapai tanpa lembur. Mungkin, tapi sudah mendekati batas.`,
  },
  melampaui: {
    tone: "border-destructive/40 bg-destructive/10",
    title: "Di atas rekor reguler",
    body: (t, r) => `Total sekitar ${t} pcs/hari, melampaui rekor ${r}. Butuh lembur atau tenaga tambahan.`,
  },
};

function AddOrderResult({ status, total, record }: { status: AddOrderStatus; total: number; record: number }) {
  const c = ADD_ORDER_COPY[status];
  return (
    <div className={cn("rounded-xl border px-3 py-2 text-sm", c.tone)}>
      <p className="font-semibold">{c.title}</p>
      <p className="text-[12px] leading-snug text-muted-foreground">{c.body(total, record)}</p>
    </div>
  );
}

function WeeklyChart({ data }: { data: KitchenCapacityData }) {
  const v = data.verdict!;
  const weeks = data.weekly;
  const max = useMemo(
    () => Math.max(1, v.record?.avg ?? 0, ...weeks.map((w) => w.avgPerDay)) * 1.08,
    [weeks, v.record]
  );
  if (weeks.length === 0) return null;
  return (
    <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Output per hari kerja, per minggu
        </p>
        <p className="text-[11px] text-muted-foreground">garis = rekor reguler</p>
      </div>
      <div className="relative">
        <div className="flex h-36 items-end gap-1 border-b border-border">
          {weeks.map((w) => {
            const partial = w.days < 4;
            return (
              <div key={w.weekStart} className="relative flex h-full min-w-0 flex-1 items-end">
                <div
                  className={cn("w-full rounded-t", partial ? "bg-primary/35" : "bg-primary/80")}
                  style={{ height: `${(w.avgPerDay / max) * 100}%` }}
                  title={`${dayMonth(w.weekStart)}: ${w.avgPerDay} pcs/hari (${w.days} hari${
                    w.overtimeDays ? `, ${w.overtimeDays} lembur` : ""
                  })`}
                />
                {w.overtimeDays > 0 && (
                  <span
                    aria-hidden
                    className="absolute left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-warning"
                    style={{ bottom: `calc(${(w.avgPerDay / max) * 100}% + 3px)` }}
                  />
                )}
              </div>
            );
          })}
        </div>
        {v.record && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-foreground/60"
            style={{ bottom: `calc(${(v.record.avg / max) * 100}% )` }}
          />
        )}
      </div>
      <div className="flex gap-1 text-[10px] text-muted-foreground">
        {weeks.map((w, i) => (
          <span key={w.weekStart} className="min-w-0 flex-1 text-center">
            {i % 3 === weeks.length % 3 ? dayMonth(w.weekStart) : ""}
          </span>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Titik kuning = minggu itu ada hari lembur. Batang pudar = minggu berjalan (belum penuh).
      </p>
    </section>
  );
}

function groupHours(hours: number[]): string {
  if (hours.length === 0) return "";
  const out: string[] = [];
  let start = hours[0];
  let prev = hours[0];
  const flush = () => out.push(start === prev ? `${start}.00` : `${start}.00–${prev}.59`);
  for (const h of hours.slice(1)) {
    if (h === prev + 1) prev = h;
    else {
      flush();
      start = h;
      prev = h;
    }
  }
  flush();
  return out.join(", ");
}

function HoursChart({ data }: { data: KitchenCapacityData }) {
  const max = Math.max(0.1, ...data.hours.map((h) => h.batchesPerDay));
  return (
    <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Kapan produksi dicatat (60 hari terakhir)
        </p>
        <p className="text-[11px] text-muted-foreground">batch per hari kerja</p>
      </div>
      <div className="flex h-24 items-end gap-0.5 border-b border-border">
        {data.hours.map((h) => (
          <div
            key={h.hour}
            className={cn(
              "flex-1 rounded-t",
              data.idle.includes(h.hour) ? "bg-success/70" : "bg-primary/70"
            )}
            style={{ height: `${Math.max(2, (h.batchesPerDay / max) * 100)}%` }}
            title={`${h.hour}.00 — ${h.batchesPerDay.toLocaleString("id-ID")} batch/hari`}
          />
        ))}
      </div>
      <div className="flex gap-0.5 text-[10px] text-muted-foreground">
        {data.hours.map((h) => (
          <span key={h.hour} className="flex-1 text-center">
            {h.hour % 2 === 0 ? h.hour : ""}
          </span>
        ))}
      </div>
      {data.idle.length > 0 ? (
        <p className="text-[12px] leading-snug">
          Jam paling sepi (hijau, ≤0,5 batch per hari): <b>{groupHours(data.idle)}</b>. Kandidat jendela uji coba resep atau
          batch tambahan.
        </p>
      ) : (
        <p className="text-[12px] text-muted-foreground">Tidak ada jam kerja yang benar-benar sepi.</p>
      )}
    </section>
  );
}
