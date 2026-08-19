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

const ROWS: Record<PosOperation, { label: string; description: string }> = {
  production: {
    label: "Produksi",
    description: "Otorisasi setiap entry produksi.",
  },
  withdrawal: {
    label: "Penarikan",
    description: "Otorisasi setiap penarikan stok.",
  },
  opname: {
    label: "Opname",
    description: "Otorisasi submit stock opname.",
  },
  cake_pickup: {
    label: "Serah terima kue",
    description: "Otorisasi penyelesaian pesanan custom cake di kasir.",
  },
  sale_void: {
    label: "Pembatalan transaksi",
    description: "Otorisasi pembatalan transaksi dari Riwayat.",
  },
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
 * Dropdown hanya memuat assignee rekening ini supaya admin tidak bisa
 * menunjuk orang yang tak ada hubungannya dengan outlet. Yang belum punya
 * PIN ditandai — mereka terdaftar tapi belum bisa mengotorisasi apa pun.
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

  const candidateById = new Map(candidates.map((c) => [c.userId, c]));
  const firstName = (id: string) =>
    candidateById.get(id)?.fullName?.split(/\s+/)[0] ?? "✓";

  // Ringkasan saat terlipat — sekilas pandang tanpa membuka form.
  const summary = POS_OPERATIONS.map((op) => {
    const ids = initial[op] ?? [];
    if (ids.length === 0) return `${ROWS[op].label}: —`;
    if (ids.length === 1) return `${ROWS[op].label}: ${firstName(ids[0])}`;
    return `${ROWS[op].label}: ${ids.length} orang`;
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
        <div className="px-5 pb-5 pt-1 border-t border-border/60">
          <p className="text-[12.5px] text-muted-foreground mb-4 mt-3">
            Pilih siapa saja yang PIN-nya diterima untuk tiap operasi
            non-penjualan — cukup satu dari mereka yang memasukkan PIN.
            Kosongkan kalau operasi itu tidak butuh otorisasi.
          </p>

          {candidates.length === 0 ? (
            <p className="text-[13px] text-muted-foreground italic">
              Belum ada karyawan yang ditugaskan ke rekening ini. Tambahkan
              dulu di tombol &ldquo;Atur akses&rdquo; di atas.
            </p>
          ) : (
            <div className="space-y-4">
              {POS_OPERATIONS.map((op) => {
                const selected = values[op] ?? [];
                const noneUsable =
                  selected.length > 0 &&
                  selected.every((id) => !candidateById.get(id)?.hasPin);
                return (
                  <div key={op} className="space-y-1.5">
                    <div>
                      <div className="text-[12.5px] font-medium text-foreground">
                        {ROWS[op].label}
                        {selected.length > 0 && (
                          <span className="ml-1.5 text-[11px] font-normal text-muted-foreground tabular-nums">
                            {selected.length} dipilih
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {ROWS[op].description}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {candidates.map((c) => {
                        const on = selected.includes(c.userId);
                        return (
                          <button
                            key={c.userId}
                            type="button"
                            role="checkbox"
                            aria-checked={on}
                            onClick={() => toggle(op, c.userId)}
                            disabled={pending}
                            className={cn(
                              "inline-flex items-center gap-1.5 h-8 pl-2 pr-2.5 rounded-full border text-[12px] font-medium transition disabled:opacity-50",
                              on
                                ? "border-[var(--teal-600)] bg-[var(--teal-600)]/10 text-foreground"
                                : "border-border/70 bg-card text-muted-foreground hover:bg-muted/50"
                            )}
                          >
                            <span
                              className={cn(
                                "grid place-items-center size-4 rounded-full border shrink-0",
                                on
                                  ? "border-[var(--teal-600)] bg-[var(--teal-600)] text-white"
                                  : "border-border"
                              )}
                            >
                              {on && <Check size={11} strokeWidth={3} />}
                            </span>
                            {c.fullName}
                            {!c.hasPin && (
                              <span className="text-warning text-[10.5px]">
                                (belum set PIN)
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {noneUsable && (
                      <p className="text-[11px] text-warning font-medium">
                        Belum ada yang punya PIN — operasi ini akan tertolak
                        sampai salah satu mengaturnya di /profile.
                      </p>
                    )}
                  </div>
                );
              })}

              {/* Reset PIN dikelompokkan sendiri: sifatnya per-orang, bukan
                  per-operasi, dan menempelkannya di tiap baris membuat
                  tombol yang sama muncul lima kali. */}
              {candidates.some((c) => c.hasPin) && (
                <div className="pt-1 border-t border-border/60">
                  <div className="text-[11px] text-muted-foreground mt-2 mb-1.5">
                    Lupa PIN? Reset di sini — karyawan set PIN baru di
                    /profile.
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {candidates
                      .filter((c) => c.hasPin)
                      .map((c) => (
                        <button
                          key={c.userId}
                          type="button"
                          onClick={() => resetPin(c.userId, c.fullName)}
                          disabled={resetPending}
                          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive transition disabled:opacity-50 border border-border/70 rounded-full h-7 px-2.5"
                        >
                          <KeyRound size={11} />
                          {c.fullName}
                        </button>
                      ))}
                  </div>
                </div>
              )}

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
