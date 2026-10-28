"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  fetchGoogleRatingsNow,
  refreshScorecardNow,
  saveManualRating,
  saveThreshold,
  saveUnitInvestment,
  updateUnitSettings,
  type DataStatusItem,
  type ThresholdAdminData,
} from "@/lib/actions/unit-scorecard.actions";
import { formatRupiah } from "./format";

type Tab = "status" | "ambang" | "unit" | "rating";
const TABS: { id: Tab; label: string }[] = [
  { id: "status", label: "Status data" },
  { id: "ambang", label: "Ambang" },
  { id: "unit", label: "Unit & modal" },
  { id: "rating", label: "Rating Google" },
];

const inputCls = "h-9 rounded-lg border-2 border-border bg-background px-2 text-[13px]";
const btnCls = "h-9 rounded-lg border-2 border-foreground bg-card px-3 text-[12.5px] font-bold disabled:opacity-60";
const btnPrimary = "h-9 rounded-lg border-2 border-foreground bg-primary px-3 text-[12.5px] font-bold disabled:opacity-60";

// ───────────────────────────── Status data ─────────────────────────────

function StatusPanel({ items, onChanged }: { items: DataStatusItem[]; onChanged: () => void }) {
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  function refresh(month: string, label: string) {
    setBusy(month);
    start(async () => {
      const r = await refreshScorecardNow(month);
      setBusy(null);
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.data?.created ? `${label}: versi ${r.data.version} dibuat (${r.data.changes} angka berubah)` : `${label}: tidak ada angka yang berubah`);
      onChanged();
    });
  }

  // Satu bulan per panggilan, berurutan: tiap panggilan tetap pendek dan satu bulan gagal tak menghentikan yang lain.
  function refreshAll() {
    start(async () => {
      let created = 0;
      const failed: string[] = [];
      for (let i = 0; i < items.length; i++) {
        setBusy(items[i].month);
        setProgress(`${i + 1}/${items.length}`);
        const r = await refreshScorecardNow(items[i].month);
        if (!r.ok) failed.push(`${items[i].label} (${r.error})`);
        else if (r.data?.created) created += 1;
      }
      setBusy(null);
      setProgress(null);
      const msg = `Semua bulan dihitung ulang: ${created} bulan berubah${failed.length ? `. Gagal: ${failed.join("; ")}` : ""}`;
      if (failed.length) toast.error(msg);
      else toast.success(msg);
      onChanged();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button type="button" onClick={refreshAll} disabled={pending || items.length === 0} className={btnPrimary}>
          {progress ? `Menghitung ${progress}…` : "Hitung ulang semuanya"}
        </button>
      </div>
      <p className="text-[12.5px] text-muted-foreground">
        Scorecard dihitung ulang otomatis tiap malam (sekitar 02.30 WIB) untuk 3 bulan terakhir yang sudah berakhir, jadi transaksi yang terlambat dicatat ikut terhitung. Versi baru hanya dibuat bila ada angka yang berubah, dan versi lama tetap tersimpan. Tidak perlu menutup atau membuka buku.
      </p>
      <ul className="space-y-2">
        {items.map((p) => (
          <li key={p.month} className="rounded-xl border-2 border-foreground bg-card p-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <div className="min-w-[8rem] flex-1">
                <div className="font-display text-[14px] font-extrabold">{p.label}</div>
                <div className="text-[11.5px] text-muted-foreground">
                  {p.version > 0
                    ? `Versi ${p.version} · diperbarui ${p.computedAt ? new Date(p.computedAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "—"}`
                    : "Belum pernah dihitung"}
                  {p.changeCount > 0 ? ` · ${p.changeCount} angka berubah di pembaruan terakhir` : ""}
                </div>
              </div>
              <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-bold", p.warnings.length === 0 && p.version > 0 ? "border-success/40 bg-success/15 text-success" : p.version === 0 ? "border-border bg-muted text-muted-foreground" : "border-warning/40 bg-warning/15 text-warning")}>
                {p.version === 0 ? "Belum ada" : p.warnings.length === 0 ? "● Data lengkap" : `▲ ${p.warnings.length} peringatan`}
              </span>
              <button type="button" onClick={() => refresh(p.month, p.label)} disabled={pending} className={btnCls}>
                {busy === p.month ? "Menghitung…" : "Hitung ulang sekarang"}
              </button>
            </div>
            {p.warnings.length > 0 && (
              <ul className="mt-2 space-y-1">
                {p.warnings.map((w) => (
                  <li key={w} className="rounded-lg border border-warning/50 bg-warning/10 px-3 py-1.5 text-[12px]">
                    ▲ {w}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
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

function RatingPanel({ data, months }: { data: ThresholdAdminData; months: DataStatusItem[] }) {
  const studios = data.units.filter((u) => u.unitType === "cabang_studio");
  const [month, setMonth] = useState(months[0]?.month ?? "");
  const [values, setValues] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  function save(unitId: string) {
    const v = Number((values[unitId] ?? "").replace(",", "."));
    start(async () => {
      const r = await saveManualRating(unitId, month, v);
      if (!r.ok) return void toast.error(r.error);
      toast.success("Rating disimpan");
    });
  }

  function fetchFromGoogle() {
    start(async () => {
      const r = await fetchGoogleRatingsNow(month);
      if (!r.ok) return void toast.error(r.error);
      const res = r.data ?? [];
      const name = (code: string) => studios.find((u) => u.code === code)?.name ?? code;
      const line = res.map((x) => `${name(x.unit)}: ${x.status === "saved" ? x.value : x.status === "kept" ? "sudah ada (tidak ditimpa)" : `gagal (${x.error})`}`).join(" · ");
      if (res.some((x) => x.status === "failed")) toast.error(line);
      else toast.success(line);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button type="button" onClick={fetchFromGoogle} disabled={pending || !month} className={btnPrimary}>
          {pending ? "Mengambil…" : "Ambil rating Google sekarang"}
        </button>
      </div>
      <p className="text-[12.5px] text-muted-foreground">Rata-rata rating Google bulan itu, diisi manual (skala 1,0–5,0). Masuk ke scorecard pada hitung ulang malam berikutnya, atau langsung lewat tombol Hitung ulang sekarang.</p>
      <label className="flex items-center gap-2 text-[12.5px] font-semibold">
        Bulan
        <select value={month} onChange={(e) => setMonth(e.target.value)} className={inputCls}>
          {months.map((m) => (
            <option key={m.month} value={m.month}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <ul className="space-y-2">
        {studios.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
            <span className="min-w-[12rem] flex-1 text-[13px] font-bold">{u.name}</span>
            <input value={values[u.id] ?? ""} onChange={(e) => setValues((s) => ({ ...s, [u.id]: e.target.value }))} placeholder="mis. 4,8" inputMode="decimal" aria-label={`Rating ${u.name}`} className={cn(inputCls, "w-24")} />
            <button type="button" onClick={() => save(u.id)} disabled={pending} className={btnCls}>
              Simpan
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ───────────────────────────── Halaman ─────────────────────────────

export function ScorecardAdmin({ periods, admin }: { periods: DataStatusItem[]; admin: ThresholdAdminData }) {
  const router = useRouter();
  const onChanged = () => router.refresh();
  const [tab, setTab] = useState<Tab>("status");
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
      {tab === "status" && <StatusPanel items={periods} onChanged={onChanged} />}
      {tab === "ambang" && <ThresholdPanel data={admin} onChanged={onChanged} />}
      {tab === "unit" && <UnitPanel data={admin} onChanged={onChanged} />}
      {tab === "rating" && <RatingPanel data={admin} months={periods} />}
    </div>
  );
}
