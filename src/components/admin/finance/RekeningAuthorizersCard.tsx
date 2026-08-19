"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, ShieldCheck, KeyRound, Check } from "lucide-react";
import {
  setRekeningAuthorizers,
  type RekeningAuthorizerCandidate,
  type RekeningAuthorizers,
} from "@/lib/actions/cashflow.actions";
import { adminResetPosPin } from "@/lib/actions/pos-pin.actions";
import { POS_OPERATIONS, type PosOperation } from "@/lib/pos-pin-format";
import { cn } from "@/lib/utils";

interface Props {
  bankAccountId: string;
  initial: RekeningAuthorizers;
  candidates: RekeningAuthorizerCandidate[];
}

/** Header kolom pendek + label penuh untuk tooltip/summary. */
const COLS: Record<PosOperation, { short: string; label: string }> = {
  production: { short: "Produksi", label: "Produksi — otorisasi setiap entry produksi." },
  withdrawal: { short: "Penarikan", label: "Penarikan — otorisasi setiap penarikan stok." },
  opname: { short: "Opname", label: "Opname — otorisasi submit stock opname." },
  cake_pickup: { short: "Kue", label: "Serah terima kue — otorisasi penyelesaian pesanan custom cake di kasir." },
  sale_void: { short: "Batal", label: "Pembatalan transaksi — otorisasi pembatalan dari Riwayat." },
};

/** Urutan stabil supaya perbandingan `dirty` tidak terganggu urutan klik. */
function sortedIds(ids: string[] | undefined): string[] {
  return [...(ids ?? [])].sort();
}

function sameSet(a: string[] | undefined, b: string[] | undefined): boolean {
  const x = sortedIds(a);
  const y = sortedIds(b);
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

/**
 * Admin memilih SIAPA SAJA yang PIN-nya diterima untuk tiap operasi POS
 * non-penjualan. Banyak orang per operasi (migrasi 132): satu penanggung
 * jawab tunggal berarti operasinya mati begitu dia libur.
 *
 * Matriks karyawan × operasi, bukan lima daftar chip yang mengulang nama
 * yang sama — bentuk chip-per-operasi tadinya membuat kartu ini jauh
 * lebih tinggi daripada isinya (sembilan karyawan × lima operasi = 45
 * chip, padahal cuma 9 orang dan 5 kolom). Dropdown hanya memuat
 * assignee rekening ini supaya admin tidak bisa menunjuk orang yang tak
 * ada hubungannya dengan outlet.
 */
export function RekeningAuthorizersCard({
  bankAccountId,
  initial,
  candidates,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [resetPending, startReset] = useTransition();
  const [values, setValues] = useState<RekeningAuthorizers>(initial);
  // Setelan sekali-jalan — dilipat supaya tidak mendominasi halaman tiap
  // kunjungan. Otomatis terbuka kalau belum ada satu pun yang ditugaskan,
  // supaya admin tetap menemukan fitur ini di rekening baru.
  const noneAssigned = POS_OPERATIONS.every(
    (op) => (initial[op] ?? []).length === 0
  );
  const [open, setOpen] = useState(noneAssigned);

  function toggle(op: PosOperation, userId: string) {
    setValues((prev) => {
      const current = prev[op] ?? [];
      const next = current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId];
      return { ...prev, [op]: next };
    });
  }

  function save() {
    startTransition(async () => {
      const res = await setRekeningAuthorizers({
        bankAccountId,
        assignments: values,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Otorisasi POS tersimpan.");
      router.refresh();
    });
  }

  function resetPin(userId: string, fullName: string) {
    if (
      !window.confirm(
        `Reset PIN POS untuk ${fullName}? Mereka harus set PIN baru di /profile.`
      )
    ) {
      return;
    }
    startReset(async () => {
      const res = await adminResetPosPin({ userId });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("PIN direset. Karyawan harus set PIN baru.");
      router.refresh();
    });
  }

  const dirty = POS_OPERATIONS.some((op) => !sameSet(values[op], initial[op]));

  const firstName = (id: string) =>
    candidates.find((c) => c.userId === id)?.fullName?.split(/\s+/)[0] ?? "✓";

  // Ringkasan saat terlipat — sekilas pandang tanpa membuka form.
  const summary = POS_OPERATIONS.map((op) => {
    const ids = initial[op] ?? [];
    if (ids.length === 0) return `${COLS[op].short}: —`;
    if (ids.length === 1) return `${COLS[op].short}: ${firstName(ids[0])}`;
    return `${COLS[op].short}: ${ids.length} orang`;
  }).join(" · ");

  return (
    <section
      className="rounded-2xl border border-border/70 bg-card overflow-hidden"
      style={{
        boxShadow:
          "0 1px 2px rgba(8, 49, 46, 0.04), 0 4px 16px rgba(8, 49, 46, 0.05)",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-muted/30 transition"
        aria-expanded={open}
      >
        <ShieldCheck size={16} className="text-[var(--teal-600)] shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-display font-semibold text-foreground text-[14px]">
            Otorisasi POS
          </div>
          <div className="text-[11.5px] text-muted-foreground truncate">
            {summary}
          </div>
        </div>
        <ChevronDown
          size={16}
          className={cn(
            "text-muted-foreground/70 shrink-0 transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div className="px-5 pb-4 pt-1 border-t border-border/60">
          {candidates.length === 0 ? (
            <p className="text-[13px] text-muted-foreground italic mt-3">
              Belum ada karyawan yang ditugaskan ke rekening ini. Tambahkan
              dulu di tombol &ldquo;Atur akses&rdquo; di atas.
            </p>
          ) : (
            <div className="space-y-2.5">
              <p className="text-[11px] text-muted-foreground mt-2.5">
                Centang siapa saja yang PIN-nya diterima per operasi — cukup
                satu yang memasukkan PIN. Kosong = operasi itu tanpa PIN.
              </p>

              <div className="overflow-x-auto -mx-1">
                <table className="w-full border-collapse text-[12px] min-w-[420px]">
                  <thead>
                    <tr>
                      <th className="text-left font-medium text-muted-foreground py-1 px-1 sticky left-0 bg-card">
                        Karyawan
                      </th>
                      {POS_OPERATIONS.map((op) => (
                        <th
                          key={op}
                          title={COLS[op].label}
                          className="font-medium text-muted-foreground py-1 px-1 text-center whitespace-nowrap"
                        >
                          {COLS[op].short}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map((c) => (
                      <tr key={c.userId} className="border-t border-border/50">
                        <td className="py-1.5 px-1 sticky left-0 bg-card">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="truncate text-foreground">
                              {c.fullName}
                            </span>
                            {!c.hasPin && (
                              <span
                                title="Belum set PIN POS"
                                className="size-1.5 rounded-full bg-warning shrink-0"
                              />
                            )}
                            {c.hasPin && (
                              <button
                                type="button"
                                onClick={() => resetPin(c.userId, c.fullName)}
                                disabled={resetPending}
                                title={`Reset PIN ${c.fullName}`}
                                className="shrink-0 text-muted-foreground/60 hover:text-destructive transition disabled:opacity-40"
                              >
                                <KeyRound size={11} />
                              </button>
                            )}
                          </div>
                        </td>
                        {POS_OPERATIONS.map((op) => {
                          const on = (values[op] ?? []).includes(c.userId);
                          return (
                            <td key={op} className="text-center px-1">
                              <button
                                type="button"
                                role="checkbox"
                                aria-checked={on}
                                aria-label={`${COLS[op].short} — ${c.fullName}`}
                                onClick={() => toggle(op, c.userId)}
                                disabled={pending}
                                className={cn(
                                  "grid place-items-center size-5 rounded-full border transition disabled:opacity-50",
                                  on
                                    ? "border-[var(--teal-600)] bg-[var(--teal-600)] text-white"
                                    : "border-border hover:border-muted-foreground/50"
                                )}
                              >
                                {on && <Check size={11} strokeWidth={3} />}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="pt-1 flex justify-end">
                <button
                  type="button"
                  onClick={save}
                  disabled={!dirty || pending}
                  className={cn(
                    "inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-[13px] font-medium transition",
                    dirty && !pending
                      ? "bg-primary text-primary-foreground hover:brightness-110"
                      : "bg-muted text-muted-foreground cursor-not-allowed"
                  )}
                >
                  {pending ? "Menyimpan..." : "Simpan otorisasi"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
