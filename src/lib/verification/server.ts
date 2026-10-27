import "server-only";
import { createAdminClient } from "@/lib/actions/_supabase-admin";
import { dedupeVerifierIds, verifierSelectionError, type VerificationStatus } from "./logic";

/* eslint-disable @typescript-eslint/no-explicit-any -- tabel `verifications` belum ada di types.ts yang di-generate */

export type SubjectType = "task" | "ticket";

export interface VerifierPerson {
  id: string;
  name: string;
  isAdmin: boolean;
}

/** Orang yang boleh dipilih sebagai verifikator: karyawan & owner yang aktif. */
export async function listVerifierPeople(): Promise<VerifierPerson[]> {
  const db = createAdminClient() as any;
  const { data } = await db
    .from("profiles")
    .select("id, full_name, nickname, role")
    .in("role", ["employee", "admin"])
    .eq("is_active", true)
    .order("full_name", { ascending: true });
  return ((data ?? []) as any[]).map((p) => ({
    id: p.id as string,
    name: String(p.full_name ?? "").trim() || String(p.nickname ?? "—"),
    isAdmin: p.role === "admin",
  }));
}

/** Validasi pilihan verifikator: jumlah, bukan pekerja sendiri, dan semuanya orang aktif yang sah. */
export async function validateVerifiers(ids: readonly string[], forbidden: readonly string[] = []): Promise<string | null> {
  const list = dedupeVerifierIds(ids);
  const err = verifierSelectionError(list, forbidden);
  if (err) return err;
  const valid = new Set((await listVerifierPeople()).map((p) => p.id));
  if (list.some((id) => !valid.has(id))) return "Ada verifikator yang tidak ditemukan atau tidak aktif.";
  return null;
}

export interface NewVerification {
  itemId?: string | null;
  verifierIds: string[];
}

/** Buat baris 'pending' untuk satu putaran. */
export async function createVerificationRows(
  db: any,
  subjectType: SubjectType,
  subjectId: string,
  round: number,
  entries: NewVerification[]
): Promise<{ created: number; verifierIds: string[]; error?: string }> {
  const rows = entries.flatMap((e) =>
    dedupeVerifierIds(e.verifierIds).map((verifier_id) => ({
      subject_type: subjectType,
      subject_id: subjectId,
      item_id: e.itemId ?? null,
      round,
      verifier_id,
      status: "pending",
    }))
  );
  if (rows.length === 0) return { created: 0, verifierIds: [] };
  // Indeks unik memakai coalesce(item_id) sehingga tak bisa jadi onConflict; transisi status sudah dijaga pemanggil,
  // jadi duplikat (23505) hanya berarti putaran ini sudah dibuat sebelumnya.
  const { error } = await db.from("verifications").insert(rows);
  if (error && error.code !== "23505") return { created: 0, verifierIds: [], error: error.message };
  return { created: rows.length, verifierIds: Array.from(new Set(rows.map((r) => r.verifier_id))) };
}

/** Semua baris verifikasi satu putaran. */
export async function loadRound(
  db: any,
  subjectType: SubjectType,
  subjectId: string,
  round?: number
): Promise<{ id: string; itemId: string | null; verifierId: string; status: VerificationStatus; round: number; note: string | null }[]> {
  let q = db.from("verifications").select("id, item_id, verifier_id, status, round, note").eq("subject_type", subjectType).eq("subject_id", subjectId);
  if (round != null) q = q.eq("round", round);
  const { data } = await q;
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    itemId: r.item_id ?? null,
    verifierId: r.verifier_id,
    status: r.status,
    round: r.round,
    note: r.note ?? null,
  }));
}

/** Nama verifikator yang masih ditunggu — untuk pesan galat "Menunggu verifikasi: A, B". */
export async function namesOf(db: any, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const { data } = await db.from("profiles").select("id, full_name, nickname").in("id", Array.from(new Set(ids)));
  const m = new Map<string, string>(((data ?? []) as any[]).map((p) => [p.id, String(p.full_name ?? "").trim() || String(p.nickname ?? "—")]));
  return ids.map((id) => m.get(id) ?? "—");
}

/** Tandai semua baris 'pending' sebuah putaran sebagai 'void' (mis. putaran diulang). */
export async function voidPending(db: any, subjectType: SubjectType, subjectId: string, round: number): Promise<void> {
  await db
    .from("verifications")
    .update({ status: "void", decided_at: new Date().toISOString() })
    .eq("subject_type", subjectType)
    .eq("subject_id", subjectId)
    .eq("round", round)
    .eq("status", "pending");
}

/**
 * Pesan galat bila putaran ini belum sepenuhnya terverifikasi, atau null bila boleh lanjut
 * (tidak ada baris verifikasi = tidak butuh verifikasi).
 */
export async function blockingReason(db: any, subjectType: SubjectType, subjectId: string, round: number): Promise<string | null> {
  const rows = (await loadRound(db, subjectType, subjectId, round)).filter((r) => r.status !== "void");
  const open = rows.filter((r) => r.status !== "verified");
  if (open.length === 0) return null;
  const names = await namesOf(db, open.map((r) => r.verifierId));
  return `Menunggu verifikasi: ${Array.from(new Set(names)).join(", ")}.`;
}
