"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, type ActionResult } from "./_gates";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { FIX_OPTIONS, type RevisionRow, type SopFixRow } from "@/lib/cleaning/sop-findings";

/**
 * Perbaikan SOP & "sudah dicek" untuk halaman /admin/cleaning (migrasi 189).
 *
 * Menulis lewat client BER-SESI (bukan service role): RLS kedua tabel hanya meloloskan
 * `is_admin()`, jadi bila gate di sini suatu hari keliru, database tetap menolak.
 * `as any` karena tabelnya baru dan belum ada di types.ts hasil generate — pola yang sama
 * dipakai cleaning-review.actions.ts.
 */

const MAX_NOTE = 500;
const VALID_ACTIONS = new Set(FIX_OPTIONS.map(([a]) => a));

/** Semua perbaikan SOP, terbaru dulu. */
export async function listSopFixes(): Promise<SopFixRow[]> {
  const gate = await requireAdmin();
  if (!gate.ok) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;
  const { data } = await supabase
    .from("cleaning_sop_fixes")
    .select("id, item_id, branch_key, action, note, base_pct, started_on, created_at")
    .order("started_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);
  return ((data ?? []) as Array<{
    id: string;
    item_id: string;
    branch_key: string;
    action: string;
    note: string | null;
    base_pct: number;
    started_on: string;
    created_at: string;
  }>).map((r) => ({
    id: r.id,
    itemId: r.item_id,
    branchKey: r.branch_key,
    action: r.action,
    note: r.note,
    basePct: r.base_pct,
    startedOn: r.started_on,
    createdAt: r.created_at,
  }));
}

/** Riwayat perubahan checklist (terbaru dulu) — dasar mendeteksi apakah SOP benar-benar diubah. */
export async function listChecklistRevisions(): Promise<RevisionRow[]> {
  const gate = await requireAdmin();
  if (!gate.ok) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("cleaning_checklist_revisions")
    .select("checklist_id, created_at, summary")
    .order("created_at", { ascending: false })
    .limit(2000);
  return (data ?? []).map((r) => ({ checklistId: r.checklist_id, at: r.created_at, summary: r.summary }));
}

/** Catat perbaikan SOP pada satu titik. Pemantauan efeknya baru mulai saat checklist-nya diubah. */
export async function createSopFix(input: {
  itemId: string;
  branchKey: string;
  action: string;
  note?: string | null;
  /** Kepatuhan titik (14 hari) saat keputusan dibuat — dibekukan sebagai angka dasar. */
  basePct: number;
}): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!input.itemId) return { ok: false, error: "Titik tidak dikenal" };
  if (!input.branchKey) return { ok: false, error: "Cabang tidak dikenal" };
  if (!VALID_ACTIONS.has(input.action)) return { ok: false, error: "Jenis perbaikan tidak dikenal" };
  const note = input.note?.trim() || null;
  if (note && note.length > MAX_NOTE) return { ok: false, error: `Catatan maksimal ${MAX_NOTE} karakter` };
  const base = Math.round(Number(input.basePct));
  if (!Number.isFinite(base) || base < 0 || base > 100) return { ok: false, error: "Angka dasar tidak valid" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;
  const { error } = await supabase.from("cleaning_sop_fixes").insert({
    item_id: input.itemId,
    branch_key: input.branchKey,
    action: input.action,
    note,
    base_pct: base,
    started_on: jakartaDateString(new Date()),
    created_by: gate.userId,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/cleaning");
  return { ok: true };
}

/** Himpunan temuan yang sudah dicek, sebagai `${itemId}|${ackKey}` (90 hari terakhir saja). */
export async function listFindingAcks(): Promise<string[]> {
  const gate = await requireAdmin();
  if (!gate.ok) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const { data } = await supabase
    .from("cleaning_finding_acks")
    .select("item_id, ack_key")
    .gte("acked_at", since)
    .limit(2000);
  return ((data ?? []) as Array<{ item_id: string; ack_key: string }>).map((r) => `${r.item_id}|${r.ack_key}`);
}

/** Tandai temuan "sudah dicek". Idempoten. */
export async function ackFinding(input: { itemId: string; ackKey: string }): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!input.itemId || !input.ackKey) return { ok: false, error: "Temuan tidak dikenal" };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;
  const { error } = await supabase
    .from("cleaning_finding_acks")
    .upsert(
      { item_id: input.itemId, ack_key: input.ackKey, acked_by: gate.userId, acked_at: new Date().toISOString() },
      { onConflict: "item_id,ack_key" }
    );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/cleaning");
  return { ok: true };
}

/** Batalkan "sudah dicek" (tombol Urungkan). */
export async function unackFinding(input: { itemId: string; ackKey: string }): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;
  const { error } = await supabase
    .from("cleaning_finding_acks")
    .delete()
    .eq("item_id", input.itemId)
    .eq("ack_key", input.ackKey);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/cleaning");
  return { ok: true };
}
