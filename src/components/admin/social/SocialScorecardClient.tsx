"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  deleteSocialWeekly,
  saveSocialScorecardConfig,
  saveSocialWeekly,
  type ScorecardMetricView,
  type SocialScorecardData,
  type SocialScorecardUnit,
  type WeeklyView,
} from "@/lib/actions/social-scorecard.actions";
import { SOCIAL_METRICS, type SocialMetricCode } from "@/lib/social/scorecard";
import { METRIC_STATUS_LABEL, STATUS_ICON, STATUS_TONE, formatRupiah } from "@/components/admin/scorecard/format";

const inputCls = "h-9 w-full rounded-lg border-2 border-border bg-background px-2 text-[13px]";
const btnCls = "h-9 rounded-lg border-2 border-foreground bg-card px-3 text-[12.5px] font-bold disabled:opacity-60";
const btnPrimary = "h-9 rounded-lg border-2 border-foreground bg-primary px-3 text-[12.5px] font-bold disabled:opacity-60";

const nf = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });

function fmt(kind: ScorecardMetricView["kind"], v: number | null): string {
  if (v == null) return "—";
  if (kind === "rupiah") return formatRupiah(v);
  if (kind === "pct") return `${nf1.format(v)}%`;
  return nf.format(v);
}

function StatusChip({ status }: { status: ScorecardMetricView["status"] }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10.5px] font-bold leading-none", STATUS_TONE[status])}>
      <span aria-hidden>{STATUS_ICON[status]}</span>
      {METRIC_STATUS_LABEL[status]}
    </span>
  );
}

function monthOptions(): { value: string; label: string }[] {
  const names = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const now = new Date();
  const out: { value: string; label: string }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push({ value: d.toISOString().slice(0, 10), label: `${names[d.getUTCMonth()]} ${d.getUTCFullYear()}` });
  }
  return out;
}

const fmtInput = (v: unknown) => (typeof v === "number" ? nf1.format(v) : String(v));

function MetricTable({ metrics, group }: { metrics: ScorecardMetricView[]; group: "hasil" | "proses" }) {
  const rows = metrics.filter((m) => m.group === group);
  return (
    <div>
      <h4 className="pb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{group === "hasil" ? "KPI hasil akhir" : "KPI proses"}</h4>
      <ul className="divide-y divide-border/50 rounded-xl border-2 border-foreground bg-card">
        {rows.map((m) => (
          <li key={m.code} className="px-3 py-2">
            <details>
              <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1">
                <span className="min-w-[10rem] flex-1 text-[13px] font-semibold">{m.label}</span>
                <span className="text-[13px] font-bold tabular-nums">{fmt(m.kind, m.actual)}</span>
                <span className="text-[11.5px] text-muted-foreground tabular-nums">
                  {m.group === "hasil" ? (m.target != null ? `target ${fmt(m.kind, m.target)}` : "target belum diisi") : m.code === "p_stok" ? `min. ${m.target ?? "—"} konten` : ""}
                </span>
                {m.score != null && (
                  <span className="text-[11.5px] text-muted-foreground tabular-nums">{m.group === "hasil" ? `${nf1.format(m.score)}% dari target` : ""}</span>
                )}
                <StatusChip status={m.status} />
              </summary>
              <div className="mt-2 space-y-1 text-[11.5px] text-muted-foreground">
                <p>{m.note}</p>
                {m.greenBound != null && m.redBound != null && (
                  <p>
                    Hijau ≥ {nf1.format(m.greenBound)}%, kuning ≥ {nf1.format(m.redBound)}%, di bawahnya merah.
                  </p>
                )}
                {m.status === "incomplete" || m.status === "not_assessed" ? <p className="font-semibold text-foreground">{m.status === "incomplete" ? "Belum ada data bulan ini." : "Belum bisa dinilai: target belum diisi."}</p> : null}
                {Object.keys(m.inputs).length > 0 && (
                  <ul className="rounded-lg bg-muted/50 p-2">
                    {Object.entries(m.inputs).map(([k, v]) => (
                      <li key={k}>
                        <span className="font-semibold">{k.replace(/_/g, " ")}:</span> {typeof v === "object" && v !== null ? JSON.stringify(v) : fmtInput(v)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ───────────────────────────── Input mingguan ─────────────────────────────

interface WeekForm {
  weekStart: string;
  postsScheduled: string;
  postsOnTime: string;
  backupStock: string;
  messagesReceived: string;
  messagesRepliedOnTime: string;
  commentsReceived: string;
  commentsRepliedOnTime: string;
  notes: string;
}

const blankForm = (weekStart: string): WeekForm => ({
  weekStart,
  postsScheduled: "",
  postsOnTime: "",
  backupStock: "",
  messagesReceived: "",
  messagesRepliedOnTime: "",
  commentsReceived: "",
  commentsRepliedOnTime: "",
  notes: "",
});

const fromWeek = (w: WeeklyView): WeekForm => ({
  weekStart: w.weekStart,
  postsScheduled: String(w.postsScheduled),
  postsOnTime: String(w.postsOnTime),
  backupStock: String(w.backupStock),
  messagesReceived: String(w.messagesReceived),
  messagesRepliedOnTime: String(w.messagesRepliedOnTime),
  commentsReceived: String(w.commentsReceived),
  commentsRepliedOnTime: String(w.commentsRepliedOnTime),
  notes: w.notes ?? "",
});

const FIELDS: { key: keyof WeekForm; label: string }[] = [
  { key: "postsScheduled", label: "Unggahan terjadwal" },
  { key: "postsOnTime", label: "Tayang sesuai kalender" },
  { key: "backupStock", label: "Stok konten cadangan" },
  { key: "messagesReceived", label: "Pesan masuk" },
  { key: "messagesRepliedOnTime", label: "Pesan dibalas tepat waktu" },
  { key: "commentsReceived", label: "Komentar masuk" },
  { key: "commentsRepliedOnTime", label: "Komentar dibalas tepat waktu" },
];

function WeeklyPanel({ unit, currentWeekStart, onChanged }: { unit: SocialScorecardUnit; currentWeekStart: string; onChanged: () => void }) {
  const [form, setForm] = useState<WeekForm>(blankForm(currentWeekStart));
  const [pending, start] = useTransition();

  function submit() {
    const n = (s: string) => (s.trim() === "" ? 0 : Number(s));
    start(async () => {
      const r = await saveSocialWeekly({
        businessUnitId: unit.businessUnitId,
        weekStart: form.weekStart,
        postsScheduled: n(form.postsScheduled),
        postsOnTime: n(form.postsOnTime),
        backupStock: n(form.backupStock),
        messagesReceived: n(form.messagesReceived),
        messagesRepliedOnTime: n(form.messagesRepliedOnTime),
        commentsReceived: n(form.commentsReceived),
        commentsRepliedOnTime: n(form.commentsRepliedOnTime),
        notes: form.notes,
      });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Input mingguan tersimpan");
      onChanged();
    });
  }

  function remove(id: string) {
    if (!window.confirm("Hapus input minggu ini?")) return;
    start(async () => {
      const r = await deleteSocialWeekly(id);
      if (!r.ok) return void toast.error(r.error);
      toast.success("Dihapus");
      onChanged();
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-[12px] text-muted-foreground">
        Isi tiap akhir minggu. Menyimpan minggu yang sama lagi menimpa isinya. Tanggal otomatis dibulatkan ke hari Senin.
      </p>
      {unit.weeks.length > 0 && (
        <ul className="divide-y divide-border/50 rounded-xl border-2 border-foreground bg-card text-[12px]">
          {unit.weeks.map((w) => (
            <li key={w.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
              <span className="min-w-[7rem] font-semibold">Minggu {new Date(`${w.weekStart}T00:00:00Z`).toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "UTC" })}</span>
              <span className="flex-1 text-muted-foreground">
                Tayang {w.postsOnTime}/{w.postsScheduled} · stok {w.backupStock} · pesan {w.messagesRepliedOnTime}/{w.messagesReceived} · komentar {w.commentsRepliedOnTime}/{w.commentsReceived}
              </span>
              <button type="button" className="font-semibold underline" onClick={() => setForm(fromWeek(w))}>
                Ubah
              </button>
              <button type="button" className="font-semibold text-destructive underline" onClick={() => remove(w.id)} disabled={pending}>
                Hapus
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1 text-[11.5px] font-semibold">
          Minggu (tanggal apa pun di minggu itu)
          <input type="date" className={inputCls} value={form.weekStart} onChange={(e) => setForm({ ...form, weekStart: e.target.value })} />
        </label>
        {FIELDS.map((f) => (
          <label key={f.key} className="space-y-1 text-[11.5px] font-semibold">
            {f.label}
            <input inputMode="numeric" className={inputCls} value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value.replace(/[^0-9]/g, "") })} placeholder="0" />
          </label>
        ))}
        <label className="space-y-1 text-[11.5px] font-semibold sm:col-span-2">
          Catatan (opsional)
          <input className={inputCls} value={form.notes} maxLength={500} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </label>
      </div>
      <div className="flex gap-2">
        <button type="button" className={btnPrimary} onClick={submit} disabled={pending}>
          {pending ? "Menyimpan…" : "Simpan minggu ini"}
        </button>
        <button type="button" className={btnCls} onClick={() => setForm(blankForm(currentWeekStart))} disabled={pending}>
          Kosongkan
        </button>
      </div>
    </div>
  );
}

// ───────────────────────────── Target & ambang ─────────────────────────────

function ConfigPanel({ unit, month, onChanged }: { unit: SocialScorecardUnit; month: string; onChanged: () => void }) {
  const [code, setCode] = useState<SocialMetricCode>("omset");
  const current = unit.metrics.find((m) => m.code === code);
  const def = SOCIAL_METRICS.find((m) => m.code === code)!;
  const [target, setTarget] = useState<string>("");
  const [green, setGreen] = useState<string>("");
  const [red, setRed] = useState<string>("");
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();

  function pick(c: SocialMetricCode) {
    setCode(c);
    const m = unit.metrics.find((x) => x.code === c);
    setTarget(m?.target != null ? String(m.target) : "");
    setGreen(m?.greenBound != null ? String(m.greenBound) : "");
    setRed(m?.redBound != null ? String(m.redBound) : "");
  }

  const targetLabel = def.group === "proses" ? (code === "p_stok" ? "Minimum konten cadangan" : null) : def.kind === "rupiah" ? "Target per bulan (Rp)" : def.kind === "pct" ? "Target engagement rate (%)" : "Target per bulan";

  function submit() {
    start(async () => {
      const r = await saveSocialScorecardConfig({
        businessUnitId: unit.businessUnitId,
        metricCode: code,
        targetValue: target.trim() === "" ? null : Number(target),
        greenBound: Number(green),
        redBound: Number(red),
        effectiveFrom: month,
        reason,
      });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Target dan ambang diperbarui");
      setReason("");
      onChanged();
    });
  }

  const hist = unit.history.filter((h) => h.metricCode === code);

  return (
    <div className="space-y-3">
      <p className="text-[12px] text-muted-foreground">
        Berlaku mulai bulan yang sedang dilihat. Setiap perubahan tersimpan sebagai versi baru lengkap dengan alasannya. Metrik hasil dinilai sebagai pencapaian terhadap target (hijau jika ≥ batas hijau).
      </p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1 text-[11.5px] font-semibold">
          Metrik
          <select className={inputCls} value={code} onChange={(e) => pick(e.target.value as SocialMetricCode)}>
            {SOCIAL_METRICS.map((m) => (
              <option key={m.code} value={m.code}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        {targetLabel && (
          <label className="space-y-1 text-[11.5px] font-semibold">
            {targetLabel}
            <input inputMode="decimal" className={inputCls} value={target} onChange={(e) => setTarget(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="kosong = belum dinilai" />
          </label>
        )}
        <label className="space-y-1 text-[11.5px] font-semibold">
          Batas hijau (%)
          <input inputMode="decimal" className={inputCls} value={green} onChange={(e) => setGreen(e.target.value.replace(/[^0-9.]/g, ""))} />
        </label>
        <label className="space-y-1 text-[11.5px] font-semibold">
          Batas merah (%)
          <input inputMode="decimal" className={inputCls} value={red} onChange={(e) => setRed(e.target.value.replace(/[^0-9.]/g, ""))} />
        </label>
        <label className="space-y-1 text-[11.5px] font-semibold sm:col-span-2 lg:col-span-4">
          Alasan perubahan (wajib)
          <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mis. target Q4 disepakati dengan tim sosmed" />
        </label>
      </div>
      <button type="button" className={btnPrimary} onClick={submit} disabled={pending || !green || !red}>
        {pending ? "Menyimpan…" : "Simpan versi baru"}
      </button>
      {current && hist.length > 0 && (
        <details className="text-[11.5px] text-muted-foreground">
          <summary className="cursor-pointer font-semibold">Riwayat perubahan {def.label}</summary>
          <ul className="mt-1 space-y-1">
            {hist.map((h) => (
              <li key={h.createdAt + h.effectiveFrom}>
                {h.effectiveFrom.slice(0, 7)}: {h.targetValue != null ? `target ${nf1.format(h.targetValue)}, ` : ""}hijau ≥ {nf1.format(h.greenBound)}%, merah &lt; {nf1.format(h.redBound)}% — {h.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// ───────────────────────────── Halaman ─────────────────────────────

type Tab = "skor" | "mingguan" | "target";

function UnitCard({ unit, data, onChanged }: { unit: SocialScorecardUnit; data: SocialScorecardData; onChanged: () => void }) {
  const [tab, setTab] = useState<Tab>("skor");
  const counts = useMemo(() => {
    const c = { green: 0, yellow: 0, red: 0 };
    for (const m of unit.metrics) if (m.status === "green" || m.status === "yellow" || m.status === "red") c[m.status] += 1;
    return c;
  }, [unit.metrics]);
  const tabs: { id: Tab; label: string }[] = [
    { id: "skor", label: "Scorecard" },
    { id: "mingguan", label: "Input mingguan" },
    { id: "target", label: "Target & ambang" },
  ];
  return (
    <section className="space-y-3 rounded-2xl border-2 border-foreground bg-card p-4">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="font-display text-[16px] font-extrabold">{unit.name}</h3>
        <span className="text-[11.5px] text-muted-foreground">{unit.accountCount} akun sosmed aktif</span>
        <span className="ml-auto flex gap-1.5 text-[11px] font-bold">
          <span className={cn("rounded-full border px-2 py-0.5", STATUS_TONE.green)}>● {counts.green}</span>
          <span className={cn("rounded-full border px-2 py-0.5", STATUS_TONE.yellow)}>▲ {counts.yellow}</span>
          <span className={cn("rounded-full border px-2 py-0.5", STATUS_TONE.red)}>■ {counts.red}</span>
        </span>
      </header>
      <div className="flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn("h-8 rounded-full border-2 px-3 text-[12px] font-bold", tab === t.id ? "border-foreground bg-primary" : "border-border bg-background")}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "skor" && (
        <div className="space-y-3">
          <MetricTable metrics={unit.metrics} group="hasil" />
          <MetricTable metrics={unit.metrics} group="proses" />
        </div>
      )}
      {tab === "mingguan" && <WeeklyPanel unit={unit} currentWeekStart={data.currentWeekStart} onChanged={onChanged} />}
      {tab === "target" && <ConfigPanel unit={unit} month={data.month} onChanged={onChanged} />}
    </section>
  );
}

export function SocialScorecardClient({ data }: { data: SocialScorecardData }) {
  const router = useRouter();
  const opts = useMemo(() => monthOptions(), []);
  const options = opts.some((o) => o.value === data.month) ? opts : [{ value: data.month, label: data.monthLabel }, ...opts];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-[12px] font-semibold">Bulan</label>
        <select className={cn(inputCls, "w-auto")} value={data.month} onChange={(e) => router.push(`/admin/social/scorecard?month=${e.target.value}`)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span className="text-[11.5px] text-muted-foreground">Bulan berjalan masih parsial. Hasil akhir mengikuti data akun sosmed yang tersinkron.</span>
      </div>
      {data.units.map((u) => (
        <UnitCard key={u.businessUnitId} unit={u} data={data} onChanged={() => router.refresh()} />
      ))}
    </div>
  );
}
