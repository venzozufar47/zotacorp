/**
 * Verifikasi (migrasi 251) — logika murni, tanpa I/O.
 *
 * Pembuat poin checklist / tiket memilih >= MIN_VERIFIERS (satu atau lebih) verifikator. Semuanya wajib menyetujui;
 * satu penolakan mengembalikan pekerjaan ke pekerja.
 */

export const MIN_VERIFIERS = 1;
export const MAX_VERIFIERS = 6;

export type VerificationStatus = "pending" | "verified" | "rejected" | "void";

export interface VerificationRowLite {
  verifierId: string;
  status: VerificationStatus;
}

/** Rapikan daftar id: buang kosong & duplikat, pertahankan urutan. */
export function dedupeVerifierIds(ids: readonly string[] | null | undefined): string[] {
  return Array.from(new Set((ids ?? []).map((s) => s.trim()).filter(Boolean)));
}

/** Pesan galat untuk pilihan verifikator, atau null bila sah. `forbidden` = id yang tidak boleh memverifikasi (mis. pekerjanya). */
export function verifierSelectionError(ids: readonly string[], forbidden: readonly string[] = []): string | null {
  const list = dedupeVerifierIds(ids);
  if (list.length < MIN_VERIFIERS) return "Pilih minimal satu verifikator.";
  if (list.length > MAX_VERIFIERS) return `Maksimal ${MAX_VERIFIERS} verifikator.`;
  if (list.some((id) => forbidden.includes(id))) return "Pekerja tidak boleh menjadi verifikator pekerjaannya sendiri.";
  return null;
}

export type VerificationProgress =
  | { state: "none" }
  | { state: "pending"; verified: number; total: number; waitingFor: string[] }
  | { state: "verified"; total: number }
  | { state: "rejected"; by: string[] };

/** Ringkas progres satu putaran verifikasi (baris berstatus 'void' diabaikan). */
export function verificationProgress(rows: readonly VerificationRowLite[]): VerificationProgress {
  const live = rows.filter((r) => r.status !== "void");
  if (live.length === 0) return { state: "none" };
  const rejected = live.filter((r) => r.status === "rejected");
  if (rejected.length > 0) return { state: "rejected", by: rejected.map((r) => r.verifierId) };
  const pending = live.filter((r) => r.status === "pending");
  if (pending.length === 0) return { state: "verified", total: live.length };
  return {
    state: "pending",
    verified: live.length - pending.length,
    total: live.length,
    waitingFor: pending.map((r) => r.verifierId),
  };
}
