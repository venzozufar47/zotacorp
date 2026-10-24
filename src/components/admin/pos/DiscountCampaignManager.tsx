"use client";

import { useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Pause, Pencil, Play, Plus, Trash2, X } from "lucide-react";
import {
  applyDiscountRetro,
  deleteDiscountCampaign,
  previewDiscountRetro,
  saveDiscountCampaign,
  setDiscountCampaignActive,
  type CampaignAccount,
  type CampaignGroup,
  type CampaignInput,
} from "@/lib/actions/pos-discount.actions";
import {
  applyDiscount,
  campaignPhase,
  describeDiscount,
  type CampaignMode,
  type CampaignPhase,
  type DiscountKind,
  type JakartaNow,
  type RoundingMode,
} from "@/lib/pos/discount";
import { parseDecimalId, parseMoneyId } from "@/lib/utils/parse-number";
import { NumberHint } from "@/components/shared/NumberHint";
import { formatRp } from "@/lib/cashflow/format";
import { cn } from "@/lib/utils";

const DAYS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const PHASE_LABEL: Record<CampaignPhase, string> = {
  berlangsung: "Berlangsung",
  terjadwal: "Terjadwal",
  jeda: "Dijeda",
  selesai: "Selesai",
};
const PHASE_CLS: Record<CampaignPhase, string> = {
  berlangsung: "bg-success/15 text-success",
  terjadwal: "bg-primary/15 text-primary",
  jeda: "bg-warning/20 text-warning",
  selesai: "bg-muted text-muted-foreground",
};
const SAMPLE_CARTS = [25_000, 48_000, 100_000];

const inputCls = "h-10 w-full rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-foreground";
const labelCls = "text-[10px] font-semibold uppercase tracking-wide text-muted-foreground";

interface Draft {
  groupId?: string;
  name: string;
  kind: DiscountKind;
  value: string;
  roundingUnit: string;
  roundingMode: RoundingMode;
  minPurchase: string;
  startDate: string;
  endDate: string;
  allDay: boolean;
  startTime: string;
  endTime: string;
  weekdays: number[];
  mode: CampaignMode;
  note: string;
  accountIds: string[];
}

function blankDraft(today: string, accounts: CampaignAccount[]): Draft {
  return {
    name: "",
    kind: "percent",
    value: "",
    roundingUnit: "1000",
    roundingMode: "floor",
    minPurchase: "",
    startDate: today,
    endDate: today,
    allDay: true,
    startTime: "15:00",
    endTime: "17:00",
    weekdays: [],
    mode: "otomatis",
    note: "",
    accountIds: accounts.map((a) => a.id),
  };
}

function draftFromGroup(g: CampaignGroup): Draft {
  return {
    groupId: g.groupId,
    name: g.name,
    kind: g.kind,
    value: g.kind === "percent" ? String(g.percentOff).replace(".", ",") : String(g.amountOff),
    roundingUnit: String(g.roundingUnit),
    roundingMode: g.roundingMode,
    minPurchase: g.minPurchase > 0 ? String(g.minPurchase) : "",
    startDate: g.startDate,
    endDate: g.endDate,
    allDay: !(g.startTime && g.endTime),
    startTime: g.startTime ?? "15:00",
    endTime: g.endTime ?? "17:00",
    weekdays: g.weekdays ?? [],
    mode: g.mode,
    note: g.note ?? "",
    accountIds: g.accounts.map((a) => a.id),
  };
}

function toInput(d: Draft): CampaignInput {
  const value = d.kind === "percent" ? (parseDecimalId(d.value) ?? 0) : parseMoneyId(d.value);
  return {
    groupId: d.groupId,
    name: d.name,
    kind: d.kind,
    percentOff: d.kind === "percent" ? value : 0,
    amountOff: d.kind === "nominal" ? value : 0,
    roundingUnit: Number(d.roundingUnit) || 1000,
    roundingMode: d.roundingMode,
    minPurchase: parseMoneyId(d.minPurchase),
    startDate: d.startDate,
    endDate: d.endDate,
    startTime: d.allDay ? null : d.startTime,
    endTime: d.allDay ? null : d.endTime,
    weekdays: d.weekdays.length > 0 && d.weekdays.length < 7 ? [...d.weekdays].sort() : null,
    mode: d.mode,
    note: d.note.trim() || null,
    accountIds: d.accountIds,
  };
}

function dateLabel(ymd: string): string {
  return new Date(`${ymd}T00:00:00Z`).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** Halaman admin Diskon & Kampanye POS: buat, jadwalkan, jeda, pantau hasil, dan (bila perlu) terapkan ke penjualan lama. */
export function DiscountCampaignManager({
  groups,
  accounts,
  now,
}: {
  groups: CampaignGroup[];
  accounts: CampaignAccount[];
  now: JakartaNow;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [filter, setFilter] = useState<CampaignPhase | "semua">("semua");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [retro, setRetro] = useState<{ group: CampaignGroup; affected: number; discountTotal: number } | null>(null);

  const phaseOf = (g: CampaignGroup) => campaignPhase(g, now);
  const counts = useMemo(() => {
    const c: Record<string, number> = { semua: groups.length, berlangsung: 0, terjadwal: 0, jeda: 0, selesai: 0 };
    for (const g of groups) c[campaignPhase(g, now)]++;
    return c;
  }, [groups, now]);
  const shown = groups.filter((g) => filter === "semua" || campaignPhase(g, now) === filter);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error ?? "Gagal");
        return;
      }
      toast.success(okMsg);
      router.refresh();
    });
  }

  function openRetro(g: CampaignGroup) {
    start(async () => {
      let affected = 0;
      let discountTotal = 0;
      for (const a of g.accounts) {
        const r = await previewDiscountRetro(a.campaignId);
        if (!r.ok || !r.data) {
          toast.error(r.ok ? "Gagal" : r.error);
          return;
        }
        affected += r.data.affected;
        discountTotal += r.data.discountTotal;
      }
      setRetro({ group: g, affected, discountTotal });
    });
  }

  function confirmRetro() {
    if (!retro) return;
    const g = retro.group;
    start(async () => {
      let updated = 0;
      for (const a of g.accounts) {
        const r = await applyDiscountRetro(a.campaignId);
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        updated += r.data?.updated ?? 0;
      }
      toast.success(`${updated} penjualan diperbarui`);
      setRetro(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(["semua", "berlangsung", "terjadwal", "jeda", "selesai"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={cn(
              "h-8 rounded-full border-2 px-3 text-xs font-semibold transition",
              filter === k ? "border-foreground bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-foreground"
            )}
          >
            {k === "semua" ? "Semua" : PHASE_LABEL[k]} ({counts[k]})
          </button>
        ))}
        <button
          type="button"
          onClick={() => setDraft(blankDraft(now.date, accounts))}
          className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-xl border-2 border-foreground bg-primary px-3 text-sm font-bold text-primary-foreground"
        >
          <Plus size={15} /> Kampanye baru
        </button>
      </div>

      {shown.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
          {groups.length === 0 ? "Belum ada kampanye. Buat yang pertama dengan tombol di atas." : "Tidak ada kampanye di kategori ini."}
        </div>
      )}

      <ul className="space-y-3">
        {shown.map((g) => {
          const phase = phaseOf(g);
          const conds = [
            g.minPurchase > 0 ? `min. belanja ${formatRp(g.minPurchase)}` : null,
            g.startTime && g.endTime ? `${g.startTime}–${g.endTime}` : null,
            g.weekdays ? g.weekdays.map((d) => DAYS[d]).join(" ") : "setiap hari",
            g.mode === "kasir" ? "kasir memilih" : "otomatis",
          ].filter(Boolean);
          return (
            <li key={g.groupId} className="space-y-2.5 rounded-2xl border-2 border-foreground bg-card p-3.5 shadow-hard-sm">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display text-base font-bold">{g.name}</h3>
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", PHASE_CLS[phase])}>{PHASE_LABEL[phase]}</span>
                <span className="ml-auto font-display text-lg font-extrabold">{describeDiscount(g)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {dateLabel(g.startDate)}
                {g.endDate !== g.startDate && ` – ${dateLabel(g.endDate)}`} · {conds.join(" · ")} · {g.accounts.map((a) => a.label).join(", ")}
              </p>
              {g.note && <p className="text-xs">{g.note}</p>}
              <p className="rounded-xl bg-muted/50 px-3 py-1.5 text-xs tabular-nums text-muted-foreground">
                {g.stats.sales === 0 ? (
                  "Belum dipakai"
                ) : (
                  <>
                    <b className="text-foreground">{g.stats.sales}</b> transaksi · diskon diberikan <b className="text-foreground">{formatRp(g.stats.discountTotal)}</b> · omzet{" "}
                    <b className="text-foreground">{formatRp(g.stats.revenue)}</b>
                  </>
                )}
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <button type="button" onClick={() => setDraft(draftFromGroup(g))} className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-semibold hover:bg-muted">
                  <Pencil size={13} /> Ubah
                </button>
                {phase !== "selesai" && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => setDiscountCampaignActive(g.groupId, !g.isActive), g.isActive ? "Kampanye dijeda" : "Kampanye diaktifkan")}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-semibold hover:bg-muted disabled:opacity-50"
                  >
                    {g.isActive ? <Pause size={13} /> : <Play size={13} />} {g.isActive ? "Jeda" : "Aktifkan"}
                  </button>
                )}
                {g.mode === "otomatis" && g.startDate <= now.date && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => openRetro(g)}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-semibold hover:bg-muted disabled:opacity-50"
                  >
                    Terapkan ke penjualan lama
                  </button>
                )}
                {g.stats.sales === 0 && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      if (confirm(`Hapus kampanye "${g.name}"?`)) run(() => deleteDiscountCampaign(g.groupId), "Kampanye dihapus");
                    }}
                    className="ml-auto inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-muted-foreground hover:text-destructive disabled:opacity-50"
                  >
                    <Trash2 size={13} /> Hapus
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {draft && (
        <CampaignForm
          key={draft.groupId ?? "new"}
          initial={draft}
          accounts={accounts}
          groups={groups}
          now={now}
          onClose={() => setDraft(null)}
          onSaved={() => {
            setDraft(null);
            router.refresh();
          }}
        />
      )}

      {retro && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={() => setRetro(null)}>
          <div className="w-full max-w-sm space-y-3 rounded-2xl border-2 border-foreground bg-card p-4 shadow-hard" onClick={(e) => e.stopPropagation()}>
            <h2 className="flex items-center gap-2 font-semibold">
              <AlertTriangle size={16} className="text-warning" /> Terapkan ke penjualan lama?
            </h2>
            {retro.affected === 0 ? (
              <p className="text-sm text-muted-foreground">Tidak ada penjualan lama yang memenuhi jadwal dan syarat kampanye ini.</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                <b className="text-foreground">{retro.affected} penjualan</b> yang belum kena kampanye akan dipotong total{" "}
                <b className="text-foreground">{formatRp(retro.discountTotal)}</b>. Total penjualan dan buku kasirnya ikut berubah. Ini tidak bisa diurungkan otomatis.
              </p>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={() => setRetro(null)} className="h-10 rounded-lg border border-border px-3 text-sm text-muted-foreground">
                Batal
              </button>
              {retro.affected > 0 && (
                <button
                  type="button"
                  onClick={confirmRetro}
                  disabled={pending}
                  className="h-10 flex-1 rounded-lg border-2 border-foreground bg-primary text-sm font-bold text-primary-foreground disabled:opacity-60"
                >
                  {pending ? "Menerapkan…" : "Ya, terapkan"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CampaignForm({
  initial,
  accounts,
  groups,
  now,
  onClose,
  onSaved,
}: {
  initial: Draft;
  accounts: CampaignAccount[];
  groups: CampaignGroup[];
  now: JakartaNow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [d, setD] = useState<Draft>(initial);
  const [pending, start] = useTransition();
  const input = toInput(d);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((cur) => ({ ...cur, [k]: v }));

  const lite = {
    percentOff: input.percentOff,
    roundingUnit: input.roundingUnit,
    roundingMode: input.roundingMode,
    kind: input.kind,
    amountOff: input.amountOff,
    minPurchase: input.minPurchase,
  };
  const valid = input.kind === "percent" ? input.percentOff > 0 && input.percentOff <= 100 : input.amountOff > 0;

  // Bentrok: kampanye lain (bukan yang sedang diubah) di cabang yang sama dengan tanggal beririsan dan tidak dijeda/selesai.
  const overlaps = groups.filter(
    (g) =>
      g.groupId !== d.groupId &&
      g.isActive &&
      g.endDate >= now.date &&
      g.startDate <= d.endDate &&
      g.endDate >= d.startDate &&
      g.accounts.some((a) => d.accountIds.includes(a.id))
  );

  function save() {
    start(async () => {
      const res = await saveDiscountCampaign(input);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(d.groupId ? "Perubahan disimpan" : "Kampanye dibuat");
      onSaved();
    });
  }

  const modal = (
    <div className="fixed inset-0 z-[60] flex bg-black/40 md:items-center md:justify-center">
      <div className="flex h-full w-full flex-col bg-background md:h-[90vh] md:max-w-xl md:rounded-2xl md:border-2 md:border-foreground">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-display text-base font-bold">{d.groupId ? "Ubah kampanye" : "Kampanye baru"}</h2>
          <button type="button" onClick={onClose} aria-label="Tutup" className="rounded-full p-2 hover:bg-muted">
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <Field label="Nama kampanye">
            <input value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="Mis. Promo Gajian" maxLength={60} className={inputCls} />
          </Field>

          <div className="space-y-2">
            <span className={labelCls}>Jenis diskon</span>
            <div className="flex gap-1.5">
              {(["percent", "nominal"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => set("kind", k)}
                  className={cn("flex-1 rounded-xl border-2 py-2 text-sm font-semibold", d.kind === k ? "border-foreground bg-primary text-primary-foreground" : "border-border")}
                >
                  {k === "percent" ? "Persen (%)" : "Potongan (Rp)"}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={d.kind === "percent" ? "Besar diskon (%)" : "Potongan (Rp)"}>
                <input
                  value={d.value}
                  onChange={(e) => set("value", e.target.value.replace(/[^0-9.,]/g, ""))}
                  inputMode="decimal"
                  placeholder={d.kind === "percent" ? "10" : "5.000"}
                  className={cn(inputCls, "tabular-nums")}
                />
                <NumberHint value={d.value} />
              </Field>
              <Field label="Minimal belanja (Rp, opsional)">
                <input
                  value={d.minPurchase}
                  onChange={(e) => set("minPurchase", e.target.value.replace(/[^0-9.,]/g, ""))}
                  inputMode="decimal"
                  placeholder="50.000"
                  className={cn(inputCls, "tabular-nums")}
                />
                <NumberHint value={d.minPurchase} />
              </Field>
            </div>
            {d.kind === "percent" && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Pembulatan ke kelipatan">
                  <select value={d.roundingUnit} onChange={(e) => set("roundingUnit", e.target.value)} className={inputCls}>
                    {["1", "100", "500", "1000"].map((u) => (
                      <option key={u} value={u}>
                        {u === "1" ? "Tanpa pembulatan" : `Rp ${Number(u).toLocaleString("id-ID")}`}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Arah pembulatan">
                  <select value={d.roundingMode} onChange={(e) => set("roundingMode", e.target.value as RoundingMode)} className={inputCls}>
                    <option value="floor">Ke bawah (bagi pembeli)</option>
                    <option value="nearest">Terdekat</option>
                    <option value="ceil">Ke atas</option>
                  </select>
                </Field>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <span className={labelCls}>Jadwal</span>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Mulai">
                <input type="date" value={d.startDate} onChange={(e) => set("startDate", e.target.value)} className={inputCls} />
              </Field>
              <Field label="Selesai (inklusif)">
                <input type="date" value={d.endDate} min={d.startDate} onChange={(e) => set("endDate", e.target.value)} className={inputCls} />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={d.allDay} onChange={(e) => set("allDay", e.target.checked)} /> Berlaku seharian
            </label>
            {!d.allDay && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Jam mulai">
                  <input type="time" value={d.startTime} onChange={(e) => set("startTime", e.target.value)} className={inputCls} />
                </Field>
                <Field label="Jam selesai">
                  <input type="time" value={d.endTime} onChange={(e) => set("endTime", e.target.value)} className={inputCls} />
                </Field>
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              <span className="w-full text-[11px] text-muted-foreground">Hari (kosongkan = setiap hari)</span>
              {DAYS.map((label, i) => {
                const on = d.weekdays.includes(i);
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => set("weekdays", on ? d.weekdays.filter((x) => x !== i) : [...d.weekdays, i])}
                    className={cn("h-8 min-w-11 rounded-full border-2 px-2 text-xs font-semibold", on ? "border-foreground bg-primary text-primary-foreground" : "border-border text-muted-foreground")}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <span className={labelCls}>Cabang</span>
            <div className="flex flex-wrap gap-1.5">
              {accounts.map((a) => {
                const on = d.accountIds.includes(a.id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => set("accountIds", on ? d.accountIds.filter((x) => x !== a.id) : [...d.accountIds, a.id])}
                    className={cn("h-9 rounded-full border-2 px-3.5 text-sm font-semibold", on ? "border-foreground bg-primary text-primary-foreground" : "border-border text-muted-foreground")}
                  >
                    {a.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <span className={labelCls}>Cara terpakai di kasir</span>
            <div className="flex gap-1.5">
              {(["otomatis", "kasir"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => set("mode", m)}
                  className={cn("flex-1 rounded-xl border-2 py-2 text-sm font-semibold", d.mode === m ? "border-foreground bg-primary text-primary-foreground" : "border-border")}
                >
                  {m === "otomatis" ? "Otomatis" : "Kasir memilih"}
                </button>
              ))}
            </div>
            <p className="text-[11.5px] text-muted-foreground">
              {d.mode === "otomatis"
                ? "Dipotong otomatis pada semua penjualan yang memenuhi jadwal dan syarat."
                : "Kasir mengetuk chip promo untuk memakainya (cocok untuk promo yang butuh kebijakan di tempat)."}
            </p>
          </div>

          <Field label="Catatan (tampil di kasir, opsional)">
            <input value={d.note} onChange={(e) => set("note", e.target.value)} maxLength={120} className={inputCls} />
          </Field>

          <div className="space-y-1.5 rounded-xl border border-border bg-muted/40 p-3 text-sm">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Pratinjau</p>
            {valid ? (
              <ul className="space-y-0.5 tabular-nums">
                {SAMPLE_CARTS.map((c) => {
                  const r = applyDiscount(c, lite);
                  return (
                    <li key={c} className="flex justify-between">
                      <span className="text-muted-foreground">Belanja {formatRp(c)}</span>
                      <span>{r.discountAmount > 0 ? <><b>{formatRp(r.finalTotal)}</b> <span className="text-success">(−{formatRp(r.discountAmount)})</span></> : <span className="text-muted-foreground">tanpa diskon</span>}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-muted-foreground">Isi besar diskon untuk melihat contoh.</p>
            )}
          </div>

          {overlaps.length > 0 && (
            <div className="flex gap-2 rounded-xl border border-warning/50 bg-warning/10 px-3 py-2 text-xs">
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warning" />
              <span>
                Tanggalnya beririsan dengan {overlaps.map((g) => `"${g.name}"`).join(", ")} di cabang yang sama. Diskon tidak ditumpuk: kasir otomatis mendapat yang paling menguntungkan pembeli.
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-border bg-background px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
          <button type="button" onClick={onClose} className="h-10 rounded-xl border-2 border-border px-4 text-sm font-semibold hover:bg-muted">
            Batal
          </button>
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="ml-auto h-10 rounded-xl border-2 border-foreground bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-60"
          >
            {pending ? "Menyimpan…" : d.groupId ? "Simpan perubahan" : "Buat kampanye"}
          </button>
        </div>
      </div>
    </div>
  );
  // Portal ke body: pembungkus halaman bertransform membuat `fixed` relatif ke pembungkus, bukan layar.
  return createPortal(modal, document.body);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className={labelCls}>{label}</span>
      {children}
    </label>
  );
}
