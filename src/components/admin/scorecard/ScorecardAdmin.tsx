"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  closePeriod,
  getCloseChecks,
  reopenPeriod,
  saveManualRating,
  saveThreshold,
  saveUnitInvestment,
  updateUnitSettings,
  type PeriodListItem,
  type ThresholdAdminData,
} from "@/lib/actions/unit-scorecard.actions";
import type { CloseChecks } from "@/lib/unit-scorecard/persist";
import { formatRupiah } from "./format";

type Tab = "tutup" | "ambang" | "unit" | "rating";
const TABS: { id: Tab; label: string }[] = [
  { id: "tutup", label: "Tutup buku" },
  { id: "ambang", label: "Ambang" },
  { id: "unit", label: "Unit & modal" },
  { id: "rating", label: "Rating Google" },
];

const inputCls = "h-9 rounded-lg border-2 border-border bg-background px-2 text-[13px]";
const btnCls = "h-9 rounded-lg border-2 border-foreground bg-card px-3 text-[12.5px] font-bold disabled:opacity-60";
const btnPrimary = "h-9 rounded-lg border-2 border-foreground bg-primary px-3 text-[12.5px] font-bold disabled:opacity-60";

// ───────────────────────────── Tutup buku ─────────────────────────────

function ClosePanel({ periods: initial, onChanged }: { periods: PeriodListItem[]; onChanged: () => void }) {
  const [periods, setPeriods] = useState(initial);
  const [selected, setSelected] = useState<string | null>(null);
  const [checks, setChecks] = useState<CloseChecks | null>(null);
  const [ack, setAck] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const current = periods.find((p) => p.month === selected) ?? null;

  function pick(month: string) {
    setSelected(month);
    setChecks(null);
    setAck(false);
    setReason("");
    start(async () => {
      const r = await getCloseChecks(month);
      if (!r.ok || !r.data) return void toast.error(r.ok ? "Gagal memeriksa" : r.error);
      setChecks(r.data);
    });
  }

  function mark(month: string, patch: Partial<PeriodListItem>) {
    setPeriods((ps) => ps.map((p) => (p.month === month ? { ...p, ...patch } : p)));
  }

  function close() {
    if (!current) return;
    start(async () => {
      const r = await closePeriod(current.month, ack);
      if (!r.ok) {
        if (r.needsAcknowledge) setChecks(r.needsAcknowledge);
        return void toast.error(r.error);
      }
      toast.success(`${current.label} ditutup: scorecard versi ${r.data?.version} dihitung`);
      mark(current.month, { status: "closed", version: r.data?.version ?? 1, closedAt: new Date().toISOString() });
      onChanged();
    });
  }

  function reopen() {
    if (!current) return;
    start(async () => {
      const r = await reopenPeriod(current.month, reason);
      if (!r.ok) return void toast.error(r.error);
      toast.success(`${current.label} dibuka ulang. Tutup lagi untuk menghitung versi baru.`);
      mark(current.month, { status: "open", reopenCount: current.reopenCount + 1 });
      setReason("");
      onChanged();
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
      <ul className="max-h-[28rem] space-y-1 overflow-y-auto rounded-xl border-2 border-foreground bg-card p-2">
        {periods.map((p) => (
          <li key={p.month}>
            <button
              type="button"
              onClick={() => pick(p.month)}
              aria-current={selected === p.month}
              className={cn("flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[13px]", selected === p.month ? "bg-primary font-bold" : "hover:bg-muted")}
            >
              <span>{p.label}</span>
              <span className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-bold", p.status === "closed" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}>
                {p.status === "closed" ? `Ditutup v${p.version}` : "Terbuka"}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="space-y-3 rounded-xl border-2 border-foreground bg-card p-4">
        {!current ? (
          <p className="text-sm text-muted-foreground">
            Pilih bulan. Tutup buku berarti pemasukan dan pengeluaran bulan itu sudah tercatat semua. Scorecard keuangan hanya dihitung dari bulan yang sudah ditutup; laporan keuangan di luar scorecard tetap bisa berubah kapan saja.
          </p>
        ) : (
          <>
            <h3 className="font-display text-lg font-extrabold">{current.label}</h3>
            {current.status === "closed" ? (
              <>
                <p className="text-sm">
                  Sudah ditutup{current.closedAt ? ` pada ${new Date(current.closedAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}` : ""}. Scorecard versi {current.version}
                  {current.reopenCount > 0 ? ` (dibuka ulang ${current.reopenCount}×)` : ""}.
                </p>
                <p className="text-[12px] text-muted-foreground">
                  Ada pemasukan/pengeluaran yang tertinggal? Buka ulang dengan alasan, rapikan pencatatannya, lalu tutup lagi: hasilnya disimpan sebagai versi baru dan versi lama tetap bisa dibuka.
                </p>
                <div className="flex flex-wrap gap-2">
                  <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Alasan buka ulang (wajib)" aria-label="Alasan buka ulang" className={cn(inputCls, "min-w-[16rem] flex-1")} />
                  <button type="button" onClick={reopen} disabled={pending || reason.trim().length < 5} className={btnCls}>
                    Buka ulang
                  </button>
                </div>
              </>
            ) : (
              <>
                {!checks ? (
                  <div className="h-16 animate-pulse rounded-lg bg-muted" />
                ) : (
                  <>
                    {checks.blockers.length > 0 && (
                      <ul className="space-y-1" role="alert">
                        {checks.blockers.map((b) => (
                          <li key={b} className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-[12.5px] font-semibold text-destructive">
                            ■ {b}
                          </li>
                        ))}
                      </ul>
                    )}
                    {checks.warnings.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-[12px] font-bold">Periksa dulu sebelum menutup:</div>
                        <ul className="space-y-1">
                          {checks.warnings.map((w) => (
                            <li key={w} className="rounded-lg border border-warning/50 bg-warning/10 px-3 py-2 text-[12.5px]">
                              ▲ {w}
                            </li>
                          ))}
                        </ul>
                        <label className="mt-2 flex items-start gap-2 text-[12.5px]">
                          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5" />
                          Saya sudah membaca peringatan di atas dan tetap ingin menutup buku bulan ini.
                        </label>
                      </div>
                    )}
                    {checks.blockers.length === 0 && checks.warnings.length === 0 && <p className="rounded-lg bg-success/10 px-3 py-2 text-[12.5px] font-semibold text-success">● Semua pengecekan lolos.</p>}
                  </>
                )}
                <button type="button" onClick={close} disabled={pending || !checks || checks.blockers.length > 0 || (checks.warnings.length > 0 && !ack)} className={btnPrimary}>
                  {pending ? "Menghitung…" : "Tutup buku & hitung scorecard"}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────── Ambang ─────────────────────────────

function ThresholdPanel({ data, onChanged }: { data: ThresholdAdminData; onChanged: () => void }) {
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [green, setGreen] = useState("");
  const [red, setRed] = useState("");
  const [from, setFrom] = useState(`${new Date().toISOString().slice(0, 7)}-01`);
  const [reason, setReason] = useState("");

  const latest = (code: string) => data.history.filter((h) => h.metricCode === code).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.createdAt.localeCompare(a.createdAt))[0];

  function save(code: string) {
    start(async () => {
      const r = await saveThreshold({ metricCode: code, green: Number(green.replace(",", ".")), red: Number(red.replace(",", ".")), effectiveFrom: from, reason });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Ambang disimpan sebagai versi baru");
      setEditing(null);
      setReason("");
      onChanged();
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-[12.5px] text-muted-foreground">
        Nilai tepat di batas masuk status yang lebih baik. Ambang berversi: periode yang sudah dihitung tetap merujuk ambang saat dihitung. Setiap perubahan wajib beralasan.
      </p>
      {(["cabang_bakery", "cabang_studio"] as const).map((type) => (
        <section key={type}>
          <h3 className="mb-2 text-sm font-extrabold">{type === "cabang_bakery" ? "Haengbocake (bakery)" : "Yeobo Space (studio)"}</h3>
          <ul className="space-y-2">
            {data.definitions
              .filter((d) => d.unitType === type)
              .map((d) => {
                const t = latest(d.code);
                const hist = data.history.filter((h) => h.metricCode === d.code);
                return (
                  <li key={d.code} className="rounded-xl border border-border bg-card p-3">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <div className="min-w-[10rem] flex-1">
                        <div className="text-[13px] font-bold">
                          {d.label} <span className="font-normal text-muted-foreground">({d.code})</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground">{d.formulaNote}</div>
                      </div>
                      <div className="text-[12.5px] tabular-nums">
                        {t ? (d.direction === "lower_better" ? `hijau ≤ ${t.green} · merah > ${t.red}` : `hijau ≥ ${t.green} · merah < ${t.red}`) : "—"}
                      </div>
                      <button
                        type="button"
                        className={btnCls}
                        onClick={() => {
                          setEditing(editing === d.code ? null : d.code);
                          setGreen(String(t?.green ?? ""));
                          setRed(String(t?.red ?? ""));
                        }}
                      >
                        {editing === d.code ? "Batal" : "Ubah"}
                      </button>
                    </div>
                    {editing === d.code && (
                      <div className="mt-3 grid gap-2 border-t border-border pt-3 sm:grid-cols-[7rem_7rem_9rem_1fr_auto]">
                        <input value={green} onChange={(e) => setGreen(e.target.value)} aria-label="Batas hijau" placeholder="Batas hijau" inputMode="decimal" className={inputCls} />
                        <input value={red} onChange={(e) => setRed(e.target.value)} aria-label="Batas merah" placeholder="Batas merah" inputMode="decimal" className={inputCls} />
                        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Berlaku mulai" className={inputCls} />
                        <input value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Alasan" placeholder="Alasan perubahan (wajib)" className={inputCls} />
                        <button type="button" onClick={() => save(d.code)} disabled={pending} className={btnPrimary}>
                          Simpan
                        </button>
                      </div>
                    )}
                    {hist.length > 1 && (
                      <details className="mt-2 text-[11.5px] text-muted-foreground">
                        <summary className="cursor-pointer font-semibold">Riwayat ({hist.length})</summary>
                        <ul className="mt-1 space-y-0.5">
                          {hist.map((h) => (
                            <li key={h.id}>
                              {h.effectiveFrom} · {h.green}/{h.red} · {h.reason}
                              {h.changedBy ? ` — ${h.changedBy}` : ""}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </div>
  );
}

// ───────────────────────────── Unit & modal ─────────────────────────────

function UnitPanel({ data, onChanged }: { data: ThresholdAdminData; onChanged: () => void }) {
  const [pending, start] = useTransition();
  const [capex, setCapex] = useState<Record<string, { amount: string; desc: string }>>({});

  function saveDates(id: string, openedAt: string, rampUntil: string, notes: string) {
    start(async () => {
      const r = await updateUnitSettings(id, { openedAt: openedAt || null, rampUpUntil: rampUntil || null, notes });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Unit diperbarui");
      onChanged();
    });
  }

  function addCapex(unitId: string) {
    const c = capex[unitId];
    start(async () => {
      const r = await saveUnitInvestment(unitId, Number((c?.amount ?? "").replace(/\./g, "").replace(",", ".")), c?.desc ?? "");
      if (!r.ok) return void toast.error(r.error);
      toast.success("Modal dicatat");
      setCapex((s) => ({ ...s, [unitId]: { amount: "", desc: "" } }));
      onChanged();
    });
  }

  return (
    <ul className="space-y-3">
      {data.units.map((u) => {
        const total = data.investments.filter((i) => i.unitId === u.id).reduce((s, i) => s + i.amount, 0);
        return (
          <li key={u.id} className="rounded-xl border-2 border-foreground bg-card p-4">
            <UnitForm u={u} total={total} pending={pending} onSave={saveDates} />
            <div className="mt-3 grid gap-2 border-t border-border pt-3 sm:grid-cols-[1fr_10rem_auto]">
              <input value={capex[u.id]?.desc ?? ""} onChange={(e) => setCapex((s) => ({ ...s, [u.id]: { amount: s[u.id]?.amount ?? "", desc: e.target.value } }))} placeholder="Tambah modal awal: keterangan" aria-label="Keterangan modal" className={inputCls} />
              <input value={capex[u.id]?.amount ?? ""} onChange={(e) => setCapex((s) => ({ ...s, [u.id]: { desc: s[u.id]?.desc ?? "", amount: e.target.value } }))} placeholder="Nominal (Rp)" inputMode="numeric" aria-label="Nominal modal" className={inputCls} />
              <button type="button" onClick={() => addCapex(u.id)} disabled={pending} className={btnCls}>
                Tambah modal
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function UnitForm({
  u,
  total,
  pending,
  onSave,
}: {
  u: ThresholdAdminData["units"][number];
  total: number;
  pending: boolean;
  onSave: (id: string, openedAt: string, rampUntil: string, notes: string) => void;
}) {
  const [opened, setOpened] = useState(u.openedAt ?? "");
  const [ramp, setRamp] = useState(u.rampUpUntil ?? "");
  const [notes, setNotes] = useState(u.notes ?? "");
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-display text-[15px] font-extrabold">{u.name}</div>
        <div className="text-[12px] text-muted-foreground">
          Modal awal tercatat: <span className="font-bold text-foreground">{total > 0 ? formatRupiah(total) : "belum diisi"}</span>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-[10rem_10rem_1fr_auto]">
        <label className="text-[11px] text-muted-foreground">
          Tanggal buka / buka kembali
          <input type="date" value={opened} onChange={(e) => setOpened(e.target.value)} className={cn(inputCls, "mt-0.5 w-full")} />
        </label>
        <label className="text-[11px] text-muted-foreground">
          Ramp-up sampai
          <input type="date" value={ramp} onChange={(e) => setRamp(e.target.value)} className={cn(inputCls, "mt-0.5 w-full")} />
        </label>
        <label className="text-[11px] text-muted-foreground">
          Catatan
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={cn(inputCls, "mt-0.5 w-full")} />
        </label>
        <button type="button" onClick={() => onSave(u.id, opened, ramp, notes)} disabled={pending} className={cn(btnPrimary, "self-end")}>
          Simpan
        </button>
      </div>
    </div>
  );
}

// ───────────────────────────── Rating Google ─────────────────────────────

function RatingPanel({ data, months }: { data: ThresholdAdminData; months: PeriodListItem[] }) {
  const studios = data.units.filter((u) => u.unitType === "cabang_studio");
  const [month, setMonth] = useState(months[0]?.month ?? "");
  const [values, setValues] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const closed = months.find((m) => m.month === month)?.status === "closed";

  function save(unitId: string) {
    const v = Number((values[unitId] ?? "").replace(",", "."));
    start(async () => {
      const r = await saveManualRating(unitId, month, v);
      if (!r.ok) return void toast.error(r.error);
      toast.success("Rating disimpan");
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-[12.5px] text-muted-foreground">Rata-rata rating Google bulan itu, diisi manual sebelum tutup buku (skala 1,0–5,0).</p>
      <label className="flex items-center gap-2 text-[12.5px] font-semibold">
        Bulan
        <select value={month} onChange={(e) => setMonth(e.target.value)} className={inputCls}>
          {months.map((m) => (
            <option key={m.month} value={m.month}>
              {m.label}
              {m.status === "closed" ? " (ditutup)" : ""}
            </option>
          ))}
        </select>
      </label>
      {closed && <p className="text-[12px] text-warning">▲ Bulan ini sudah ditutup. Buka ulang dulu (dengan alasan) untuk mengubah rating.</p>}
      <ul className="space-y-2">
        {studios.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
            <span className="min-w-[12rem] flex-1 text-[13px] font-bold">{u.name}</span>
            <input value={values[u.id] ?? ""} onChange={(e) => setValues((s) => ({ ...s, [u.id]: e.target.value }))} placeholder="mis. 4,8" inputMode="decimal" aria-label={`Rating ${u.name}`} className={cn(inputCls, "w-24")} />
            <button type="button" onClick={() => save(u.id)} disabled={pending || closed} className={btnCls}>
              Simpan
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ───────────────────────────── Halaman ─────────────────────────────

export function ScorecardAdmin({ periods, admin }: { periods: PeriodListItem[]; admin: ThresholdAdminData }) {
  const router = useRouter();
  const onChanged = () => router.refresh();
  const [tab, setTab] = useState<Tab>("tutup");
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Pengaturan scorecard" className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn("h-9 rounded-full border-2 border-foreground px-4 text-[12.5px] font-bold", tab === t.id ? "bg-primary" : "bg-card")}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "tutup" && <ClosePanel periods={periods} onChanged={onChanged} />}
      {tab === "ambang" && <ThresholdPanel data={admin} onChanged={onChanged} />}
      {tab === "unit" && <UnitPanel data={admin} onChanged={onChanged} />}
      {tab === "rating" && <RatingPanel data={admin} months={periods} />}
    </div>
  );
}
