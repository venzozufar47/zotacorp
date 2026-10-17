"use client";

import { useMemo } from "react";
import { Settings, UserX } from "lucide-react";
import { reviewDue } from "@/lib/cleaning/governance";
import { jakartaDateString } from "@/lib/utils/jakarta";
import type { CleaningChecklist } from "@/lib/actions/cleaning.actions";

/**
 * Zona "Tata kelola SOP": SOP yang waktunya ditinjau ulang (jatuh tempo ≤ 7 hari atau sudah
 * lewat) dan SOP aktif tanpa pemilik. Kendala karyawan, sesi foto terlalu cepat, dan titik yang
 * sering gagal sudah menjadi temuan di halaman Kepatuhan SOP, jadi tidak diulang di sini.
 * Tampil hanya bila ada isinya.
 */
export function SopGovernanceZone({
  checklists,
  onOpenSetup,
}: {
  checklists: CleaningChecklist[];
  onOpenSetup: () => void;
}) {
  const today = jakartaDateString(new Date());

  const reviews = useMemo(
    () =>
      checklists
        .filter((c) => c.is_active)
        .map((c) => ({ c, due: reviewDue(c, today) }))
        .filter((x): x is { c: CleaningChecklist; due: NonNullable<typeof x.due> } =>
          x.due !== null && x.due.daysLeft <= 7
        )
        .sort((a, b) => a.due.daysLeft - b.due.daysLeft),
    [checklists, today]
  );
  const ownerless = useMemo(
    () => checklists.filter((c) => c.is_active && !c.owner_id).length,
    [checklists]
  );

  if (reviews.length === 0 && ownerless === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="font-display text-[15px] font-bold">Tata kelola SOP</h2>
        <span className="text-[11.5px] text-muted-foreground">
          Bahan untuk memperbaiki SOP — bukan untuk menghukum
        </span>
      </div>

      <div className="rounded-2xl border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <span
            className={
              "grid size-7 shrink-0 place-items-center rounded-full " +
              (reviews.some((r) => r.due.daysLeft < 0)
                ? "bg-destructive/10 text-destructive"
                : "bg-amber-500/10 text-amber-600 dark:text-amber-400")
            }
          >
            <Settings size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <h3 className="font-display text-[13.5px] font-bold">SOP perlu ditinjau ulang</h3>
              <span className="rounded-full bg-muted px-1.5 text-[11px] font-bold text-muted-foreground">
                {reviews.length}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">SOP usang lebih berbahaya daripada tidak ada SOP</p>
          </div>
        </div>
        <ul className="divide-y divide-border">
          {reviews.map(({ c, due }) => (
            <li key={c.id} className="flex items-center gap-2 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-semibold">{c.name}</div>
                <p className="text-[11px] text-muted-foreground">
                  {due.daysLeft < 0
                    ? `Lewat ${-due.daysLeft} hari`
                    : due.daysLeft === 0
                      ? "Jatuh tempo hari ini"
                      : `${due.daysLeft} hari lagi`}{" "}
                  · {c.owner_name ? `pemilik: ${c.owner_name}` : "belum ada pemilik"}
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenSetup}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-semibold hover:bg-muted"
              >
                <Settings size={12} /> Buka
              </button>
            </li>
          ))}
          {ownerless > 0 && (
            <li className="flex items-center gap-2 px-4 py-2.5 text-[11.5px] text-muted-foreground">
              <UserX size={13} className="shrink-0" />
              {ownerless} SOP aktif belum punya pemilik — atur di Pengaturan SOP.
            </li>
          )}
        </ul>
      </div>
    </section>
  );
}
