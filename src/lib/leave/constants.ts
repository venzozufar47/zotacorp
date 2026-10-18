import type { LeaveKind } from "@/lib/actions/leave-requests.actions";

/**
 * Dipisah dari `leave-requests.actions.ts` karena file `"use server"` hanya
 * boleh mengekspor async function — konstanta object seperti ini akan
 * membuat build gagal ("A 'use server' file can only export async
 * functions") kalau ditaruh di sana.
 */
export const LEAVE_KIND_LABEL: Record<LeaveKind, string> = {
  sakit: "Izin sakit",
  izin_keluar_toko: "Izin keluar toko",
};

/**
 * "Sekarang" dari server, dikirim ke klien supaya label "x jam lalu" sama di
 * SSR dan hydration. Di luar komponen karena aturan `react-hooks/purity`
 * melarang `Date.now()` langsung di render.
 */
export function serverNowMs(): number {
  return Date.now();
}
