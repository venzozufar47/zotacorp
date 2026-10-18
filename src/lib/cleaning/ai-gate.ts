/**
 * Gate verifikasi foto dengan AI untuk titik SOP tertentu (tabel `cleaning_item_ai_gates`).
 * Dipanggil dari server action penyelesaian item (`completeCleaningItem`, `resubmitCleaningPhoto`).
 * Modul biasa (bukan "use server"); I/O lewat client service-role milik pemanggil.
 *
 * Aturan keputusan:
 *  - jelas di bawah batas   → BLOKIR (`block` terisi; foto tidak disimpan)
 *  - tak terbaca / AI gagal → LOLOS, tapi ditandai `needsReview` (masuk antrean tinjauan manusia)
 *  - terbaca & ≥ batas      → lolos
 */

import { readMeterKwh } from "@/lib/ai/meter-reading";
import type { createAdminClient } from "@/lib/actions/_supabase-admin";

type Admin = ReturnType<typeof createAdminClient>;

export interface AiGate {
  minKwh: number;
}

export interface GateOutcome {
  /** Pesan untuk karyawan bila ditolak; null = lolos. */
  block: string | null;
  /** Kolom jejak audit pada baris completion (tidak diisi bila ditolak — barisnya tak dibuat). */
  patch: { ai_reading: number | null; ai_status: "ok" | "unreadable" | "error"; ai_checked_at: string };
  /** Foto harus menunggu keputusan manusia (tak terbaca / AI gagal). */
  needsReview: boolean;
}

/** Gate aktif untuk satu titik, atau null bila titik itu tidak ber-gate. */
export async function getAiGate(admin: Admin, itemId: string): Promise<AiGate | null> {
  // Tabel baru belum ada di types.ts hasil generate.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (admin as any)
    .from("cleaning_item_ai_gates")
    .select("min_value")
    .eq("item_id", itemId)
    .eq("is_active", true)
    .maybeSingle();
  const min = data ? Number((data as { min_value: number | string }).min_value) : NaN;
  return Number.isFinite(min) && min > 0 ? { minKwh: min } : null;
}

const MIME_BY_EXT: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

const fmtKwh = (n: number) => n.toLocaleString("id-ID", { maximumFractionDigits: 2 });

/** Unduh foto dari storage lalu minta AI membacanya. */
export async function runAiGate(admin: Admin, gate: AiGate, photoPath: string): Promise<GateOutcome> {
  const at = new Date().toISOString();
  const { data: blob, error } = await admin.storage.from("cleaning-photos").download(photoPath);
  if (error || !blob) {
    return { block: null, needsReview: true, patch: { ai_reading: null, ai_status: "error", ai_checked_at: at } };
  }
  const ext = photoPath.split(".").pop()?.toLowerCase() ?? "";
  const mime = blob.type?.startsWith("image/") ? blob.type : (MIME_BY_EXT[ext] ?? "image/jpeg");
  const reading = await readMeterKwh(await blob.arrayBuffer(), mime);
  if (reading.status === "ok") {
    if (reading.kwh < gate.minKwh) {
      return {
        block: `Sisa token terbaca ${fmtKwh(reading.kwh)} kWh — di bawah batas ${fmtKwh(gate.minKwh)} kWh. Isi token dulu, lalu foto ulang layarnya.`,
        needsReview: false,
        patch: { ai_reading: reading.kwh, ai_status: "ok", ai_checked_at: at },
      };
    }
    return { block: null, needsReview: false, patch: { ai_reading: reading.kwh, ai_status: "ok", ai_checked_at: at } };
  }
  if (reading.status === "error") console.error("[ai-gate] AI gagal:", reading.error);
  return { block: null, needsReview: true, patch: { ai_reading: null, ai_status: reading.status, ai_checked_at: at } };
}
