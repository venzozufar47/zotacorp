"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, ChevronDown, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { periodLabel } from "@/lib/bonus/periods";
import { MANUAL_ITEMS, resolveVerification } from "@/lib/bonus/close-checks";
import { saveBonusVerification, type BonusCloseState } from "@/lib/actions/bonus.actions";

/**
 * Verifikasi tutup buku. Tingkat 1: satu baris status. Tingkat 2 (dibuka): hanya syarat yang gagal dan empat
 * centang manual. Syarat yang lolos dan catatan dilipat. Syarat gagal bisa diloloskan dengan alasan tertulis.
 */
export function BonusVerificationForm({ state }: { state: BonusCloseState }) {
  const router = useRouter();
  const [open, setOpen] = useState(!state.verified);
  const [manual, setManual] = useState<Record<string, boolean>>(state.manual);
  const [overrides, setOverrides] = useState<Record<string, string>>(state.overrides);
  // Alasan yang sedang diketik untuk syarat yang kolomnya dibuka.
  const [opened, setOpened] = useState<Record<string, boolean>>(() => Object.fromEntries(Object.keys(state.overrides).map((k) => [k, true])));
  const [note, setNote] = useState(state.note);
  const [busy, setBusy] = useState(false);

  const failing = state.checks.filter((c) => !c.ok);
  const passed = state.checks.filter((c) => c.ok);
  const res = useMemo(() => resolveVerification(state.checks, manual, overrides), [state.checks, manual, overrides]);
  // Alasan kosong tidak dihitung sebagai perubahan.
  const clean = (o: Record<string, string>) => JSON.stringify(Object.entries(o).filter(([, v]) => v.trim()).sort(([a], [b]) => a.localeCompare(b)));
  const dirty =
    JSON.stringify(MANUAL_ITEMS.map((m) => manual[m.key] === true)) !== JSON.stringify(MANUAL_ITEMS.map((m) => state.manual[m.key] === true)) ||
    clean(overrides) !== clean(state.overrides) ||
    note !== state.note;
  const manualDone = MANUAL_ITEMS.length - res.manualMissing.length;

  const status = state.verified && !dirty
    ? { text: "Terverifikasi", tone: "ok" as const }
    : res.unresolved.length > 0
      ? { text: `${res.unresolved.length} syarat belum lolos`, tone: "warn" as const }
      : res.manualMissing.length > 0
        ? { text: `${manualDone}/${MANUAL_ITEMS.length} centang manual`, tone: "warn" as const }
        : { text: "Siap disimpan", tone: "ok" as const };

  async function save() {
    setBusy(true);
    // Alasan kosong pada kolom yang dibuka dianggap tidak meloloskan.
    const cleaned = Object.fromEntries(Object.entries(overrides).filter(([, v]) => v.trim().length > 0));
    const r = await saveBonusVerification({ period: state.period, manual, overrides: cleaned, note });
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success(r.state.verified ? `${periodLabel(state.period)} terverifikasi` : "Tersimpan, verifikasi belum lengkap");
    router.refresh();
  }

  return (
    <section className="rounded-2xl border border-border bg-card">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 min-h-14 text-left">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">Verifikasi tutup buku · {periodLabel(state.period)}</h3>
          <p className="text-xs text-muted-foreground">
            {passed.length}/{state.checks.length} syarat lolos · {manualDone}/{MANUAL_ITEMS.length} dicek manual
          </p>
        </div>
        <span
          className={
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold " +
            (status.tone === "ok" ? "bg-success/15 text-foreground" : "bg-warning/20 text-foreground")
          }
        >
          {status.tone === "ok" ? <CheckCircle2 size={13} className="text-success" /> : <AlertTriangle size={13} className="text-warning" />}
          {status.text}
        </span>
        <ChevronDown size={16} className={"shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none " + (open ? "rotate-180" : "")} />
      </button>

      {open && (
        <div className="border-t border-border px-4 py-3 space-y-4">
          {!state.storeReady && (
            <p className="rounded-lg bg-warning/15 px-3 py-2 text-sm">Tabel verifikasi belum tersedia (migrasi 322 belum diterapkan). Menyimpan dan menerbitkan dinonaktifkan.</p>
          )}
          {state.verifiedAt && !state.verified && (
            <p className="rounded-lg bg-warning/15 px-3 py-2 text-sm">Data berubah sejak verifikasi terakhir. Periksa ulang lalu simpan lagi.</p>
          )}

          {failing.length > 0 ? (
            <ul className="space-y-2">
              {failing.map((c) => {
                const reason = overrides[c.key] ?? "";
                const resolved = reason.trim().length >= 3;
                return (
                  <li key={c.key} className="rounded-xl border border-border p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      {resolved ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-muted-foreground" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" />}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{c.label}</p>
                        <p className="text-xs text-muted-foreground break-words">{c.detail}</p>
                      </div>
                      {!opened[c.key] && (
                        <button type="button" onClick={() => setOpened((o) => ({ ...o, [c.key]: true }))} className="shrink-0 min-h-9 px-2 text-xs font-medium text-primary hover:underline">
                          Loloskan
                        </button>
                      )}
                    </div>
                    {opened[c.key] && (
                      <div className="space-y-1">
                        <label htmlFor={`ov-${c.key}`} className="text-xs text-muted-foreground">
                          Alasan meloloskan (wajib, tercatat)
                        </label>
                        <Textarea id={`ov-${c.key}`} rows={2} value={reason} maxLength={500} onChange={(e) => setOverrides((o) => ({ ...o, [c.key]: e.target.value }))} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Semua syarat otomatis lolos.</p>
          )}

          {passed.length > 0 && (
            <details className="group text-sm">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 min-h-9 text-muted-foreground [&::-webkit-details-marker]:hidden">
                <ChevronDown size={14} className="transition-transform motion-reduce:transition-none group-open:rotate-180" />
                {passed.length} syarat lolos
              </summary>
              <ul className="mt-1 space-y-1.5">
                {passed.map((c) => (
                  <li key={c.key} className="flex items-start gap-2">
                    <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-success" />
                    <span className="min-w-0 text-xs">
                      <span className="font-medium">{c.label}</span>
                      <span className="text-muted-foreground"> · {c.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <fieldset className="space-y-1">
            <legend className="text-xs font-semibold text-muted-foreground mb-1">Cek manual</legend>
            {MANUAL_ITEMS.map((m) => (
              <label key={m.key} className="flex items-start gap-3 min-h-11 cursor-pointer rounded-lg px-1 py-1.5 hover:bg-muted/40">
                <input type="checkbox" checked={manual[m.key] === true} onChange={(e) => setManual((s) => ({ ...s, [m.key]: e.target.checked }))} className="mt-0.5 size-5 shrink-0 accent-[var(--primary)]" />
                <span className="text-sm">{m.label}</span>
              </label>
            ))}
          </fieldset>

          <details className="group text-sm" open={note.length > 0}>
            <summary className="flex cursor-pointer list-none items-center gap-1.5 min-h-9 text-muted-foreground [&::-webkit-details-marker]:hidden">
              <Circle size={8} className="fill-current" />
              Catatan
            </summary>
            <Textarea className="mt-1" rows={2} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} placeholder="Opsional" />
          </details>

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">Terbit hanya setelah semua syarat lolos atau diloloskan dan semua centang manual terisi.</p>
            <Button type="button" onClick={save} loading={busy} disabled={!state.storeReady || (!dirty && state.verified)} className="h-11 shrink-0 px-5">
              Simpan verifikasi
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
