import "server-only";

/**
 * Gerbang kunci POS. Dihitung di SERVER setiap render halaman POS, supaya "terkunci" tidak bisa dilewati
 * dengan memanipulasi klien.
 *
 *  - off        : mode shift mati untuk rekening ini → POS terbuka seperti semula.
 *  - shift      : ada shift terbuka (terbuka kurang dari STALE_SHIFT_HOURS) → POS terbuka atas nama kasir shift.
 *  - stale      : shift terbuka terlalu lama (lupa ditutup) → terkunci; tutup oleh kasirnya atau tutup paksa admin.
 *  - incidental : tidak ada shift, tapi akun ini memilih "Pakai tanpa shift" → POS terbuka, tanpa PIN/opname/kas;
 *                 transaksi tercatat atas akun login. Penandanya cookie per rekening & per akun, hilang saat Keluar.
 *  - locked     : tidak ada shift dan tidak insidentil → layar kunci.
 */

import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/actions/_supabase-admin";
import { findOpenShift, lastClosedShift, loadShiftConfig, namesByIds } from "@/lib/pos/shift-data";
import { isShiftStale } from "@/lib/pos/shift-math";

export type PosGate =
  | { mode: "off" }
  | { mode: "shift"; shiftId: string; cashierId: string; cashierName: string; openedAt: string }
  | { mode: "stale"; shiftId: string; cashierId: string; cashierName: string; openedAt: string }
  | { mode: "incidental"; userName: string }
  | { mode: "locked"; lastClosedAt: string | null };

export function incidentalCookieName(bankAccountId: string): string {
  return `pos_incidental_${bankAccountId}`;
}

/** Nilai cookie: akun + waktu mulai. Waktu dipakai supaya sesi tidak "hidup lagi" setelah shift berikutnya selesai. */
export function incidentalCookieValue(userId: string): string {
  return `${userId}|${Date.now()}`;
}

function parseIncidentalCookie(v: string | undefined): { userId: string; startedAt: number } | null {
  if (!v) return null;
  const [userId, ts] = v.split("|");
  const startedAt = Number(ts);
  return userId && Number.isFinite(startedAt) ? { userId, startedAt } : null;
}

export async function loadPosGate(bankAccountId: string, userId: string): Promise<PosGate> {
  const admin = createAdminClient();
  const cfg = await loadShiftConfig(admin, bankAccountId);
  if (!cfg?.enabled) return { mode: "off" };

  const open = await findOpenShift(admin, bankAccountId);
  if (open) {
    const base = {
      shiftId: open.id,
      cashierId: open.cashierId,
      cashierName: open.cashierName,
      openedAt: open.openedAt,
    };
    return isShiftStale(open.openedAt) ? { mode: "stale", ...base } : { mode: "shift", ...base };
  }

  const last = await lastClosedShift(admin, bankAccountId);
  const jar = await cookies();
  const incidental = parseIncidentalCookie(jar.get(incidentalCookieName(bankAccountId))?.value);
  // Sah hanya bila milik akun ini DAN dimulai setelah shift terakhir ditutup (tidak ada shift di antaranya).
  if (
    incidental &&
    incidental.userId === userId &&
    (!last || incidental.startedAt > new Date(last.closedAt).getTime())
  ) {
    const names = await namesByIds(admin, [userId]);
    return { mode: "incidental", userName: names.get(userId) ?? "Akun ini" };
  }

  return { mode: "locked", lastClosedAt: last?.closedAt ?? null };
}

/** Halaman POS yang butuh POS terbuka: true bila boleh dipakai sekarang. */
export function isPosUsable(gate: PosGate): boolean {
  return gate.mode === "off" || gate.mode === "shift" || gate.mode === "incidental";
}
