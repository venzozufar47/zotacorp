"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "./_supabase-admin";
import { requireAdmin } from "./_gates";
import { getCurrentUser, getCurrentRole, getCurrentProfile } from "@/lib/supabase/cached";
import { isTeamLeader } from "@/lib/tasks/team-access";

/**
 * Log Riset Produk, Kartu Produk & Daftar Tester (PRD-11) — SOP 6.10,
 * 6.13, Dokumen 5 §4 & §9.
 *
 * Penegakan "hanya tester aktif boleh pakai kode Testing di POS" BELUM
 * disertakan — lihat catatan di migrasi 204. Modul ini memberi roster +
 * jejak audit; penegakan di sisi POS adalah pekerjaan lanjutan terpisah.
 *
 * Tabel baru belum di generated `Database` type — pola `db(): any` sama
 * dengan modul PRD lain sesi ini.
 */

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/* eslint-disable @typescript-eslint/no-explicit-any */
function db(): any {
  return createAdminClient();
}

export type RndBranch = "Pare" | "Semarang";

async function canParticipate(): Promise<boolean> {
  const role = await getCurrentRole();
  if (role === "admin") return true;
  if (role === "investor") return false;
  const profile = await getCurrentProfile();
  return profile?.business_unit === "Haengbocake";
}

async function canScreen(): Promise<boolean> {
  const role = await getCurrentRole();
  if (role === "admin") return true;
  return isTeamLeader();
}

async function namesFor(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (unique.length === 0) return new Map();
  const { data } = await createAdminClient()
    .from("profiles")
    .select("id, full_name")
    .in("id", unique);
  return new Map((data ?? []).map((p) => [p.id, p.full_name]));
}

async function signPhoto(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await createAdminClient().storage.from("product-rnd-photos").createSignedUrl(path, 1800);
  return data?.signedUrl ?? null;
}

// ---------------------------------------------------------------------
// Ide produk & log percobaan
// ---------------------------------------------------------------------

export interface ProductIdeaView {
  id: string;
  branch: RndBranch;
  title: string;
  purpose: string | null;
  ingredients: string | null;
  portionCount: number | null;
  targetDate: string | null;
  status: "diajukan" | "riset" | "jual_terbatas" | "masuk_menu" | "berhenti";
  proposedByName: string | null;
  createdAt: string;
  attemptCount: number;
}

export interface SubmitIdeaInput {
  branch: RndBranch;
  title: string;
  purpose?: string | null;
  ingredients?: string | null;
  portionCount?: number | null;
  targetDate?: string | null;
}

export async function submitProductIdea(input: SubmitIdeaInput): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  if (!(await canParticipate())) return { ok: false, error: "Forbidden" };
  if (!input.title.trim()) return { ok: false, error: "Judul ide wajib diisi" };

  const { data: inserted, error } = await db()
    .from("product_ideas")
    .insert({
      branch: input.branch,
      title: input.title.trim(),
      purpose: input.purpose?.trim() || null,
      ingredients: input.ingredients?.trim() || null,
      portion_count: input.portionCount ?? null,
      target_date: input.targetDate || null,
      proposed_by: user.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/riset-produk");
  return { ok: true, data: { id: (inserted as { id: string }).id } };
}

export async function listProductIdeas(branch?: RndBranch): Promise<ProductIdeaView[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  let query = db().from("product_ideas").select("*").order("created_at", { ascending: false });
  if (branch) query = query.eq("branch", branch);
  const { data } = await query;
  const rows = data ?? [];
  const names = await namesFor(rows.map((r: any) => r.proposed_by));

  const ideaIds = rows.map((r: any) => r.id);
  const counts = new Map<string, number>();
  if (ideaIds.length > 0) {
    const { data: exps } = await db().from("product_experiments").select("idea_id").in("idea_id", ideaIds);
    for (const e of exps ?? []) counts.set(e.idea_id, (counts.get(e.idea_id) ?? 0) + 1);
  }

  return rows.map((r: any) => ({
    id: r.id,
    branch: r.branch,
    title: r.title,
    purpose: r.purpose,
    ingredients: r.ingredients,
    portionCount: r.portion_count,
    targetDate: r.target_date,
    status: r.status,
    proposedByName: names.get(r.proposed_by) ?? null,
    createdAt: r.created_at,
    attemptCount: counts.get(r.id) ?? 0,
  }));
}

/** Kepala tim menyaring: diajukan -> riset (atau langsung berhenti). */
export async function screenProductIdea(input: {
  id: string;
  decision: "riset" | "berhenti";
}): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  if (!(await canScreen())) return { ok: false, error: "Hanya kepala tim atau admin" };
  const { error } = await db()
    .from("product_ideas")
    .update({ status: input.decision, decided_by: user.id, decided_at: new Date().toISOString() })
    .eq("id", input.id)
    .eq("status", "diajukan");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/riset-produk");
  return { ok: true };
}

/** Owner-only: keputusan akhir setelah jual terbatas. */
export async function decideProductIdea(input: {
  id: string;
  decision: "jual_terbatas" | "masuk_menu" | "berhenti";
}): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const { error } = await db()
    .from("product_ideas")
    .update({ status: input.decision, decided_by: gate.userId, decided_at: new Date().toISOString() })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/riset-produk");
  return { ok: true };
}

export interface ExperimentView {
  id: string;
  attemptNumber: number;
  recipeChange: string | null;
  resultNotes: string | null;
  photoUrl: string | null;
  estimatedHpp: number | null;
  imaginedPrice: number | null;
  decision: string | null;
  recordedByName: string | null;
  createdAt: string;
}

export async function listExperiments(ideaId: string): Promise<ExperimentView[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const { data } = await db()
    .from("product_experiments")
    .select("*")
    .eq("idea_id", ideaId)
    .order("attempt_number", { ascending: true });
  const rows = data ?? [];
  const names = await namesFor(rows.map((r: any) => r.recorded_by));
  return Promise.all(
    rows.map(async (r: any) => ({
      id: r.id,
      attemptNumber: r.attempt_number,
      recipeChange: r.recipe_change,
      resultNotes: r.result_notes,
      photoUrl: await signPhoto(r.photo_path),
      estimatedHpp: r.estimated_hpp,
      imaginedPrice: r.imagined_price,
      decision: r.decision,
      recordedByName: names.get(r.recorded_by) ?? null,
      createdAt: r.created_at,
    }))
  );
}

export async function recordExperiment(input: {
  ideaId: string;
  recipeChange?: string | null;
  resultNotes?: string | null;
  estimatedHpp?: number | null;
  imaginedPrice?: number | null;
  decision: "ulangi" | "ubah" | "jual_terbatas" | "berhenti";
}): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  if (!(await canParticipate())) return { ok: false, error: "Forbidden" };

  const { count } = await db()
    .from("product_experiments")
    .select("id", { count: "exact", head: true })
    .eq("idea_id", input.ideaId);
  const nextAttempt = (count ?? 0) + 1;
  if (nextAttempt > 3) {
    return { ok: false, error: "Sudah 3 percobaan — Owner harus memutuskan lanjut atau berhenti" };
  }

  const { data: inserted, error } = await db()
    .from("product_experiments")
    .insert({
      idea_id: input.ideaId,
      attempt_number: nextAttempt,
      recipe_change: input.recipeChange?.trim() || null,
      result_notes: input.resultNotes?.trim() || null,
      estimated_hpp: input.estimatedHpp ?? null,
      imagined_price: input.imaginedPrice ?? null,
      decision: input.decision,
      recorded_by: user.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  if (input.decision === "jual_terbatas" || input.decision === "berhenti") {
    await db().from("product_ideas").update({ status: input.decision }).eq("id", input.ideaId);
  }

  revalidatePath("/riset-produk");
  return { ok: true, data: { id: (inserted as { id: string }).id } };
}

export async function uploadExperimentPhoto(formData: FormData): Promise<ActionResult<{ path: string }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const experimentId = formData.get("experimentId");
  const file = formData.get("file");
  if (typeof experimentId !== "string" || !experimentId) return { ok: false, error: "experimentId wajib" };
  if (!(file instanceof File)) return { ok: false, error: "File wajib" };
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return { ok: false, error: "Hanya JPG / PNG / WEBP" };
  }
  if (file.size > 5 * 1024 * 1024) return { ok: false, error: "File maksimal 5MB" };

  const admin = createAdminClient();
  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${experimentId}-${Date.now()}.${ext || "jpg"}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from("product-rnd-photos")
    .upload(path, buffer, { contentType: file.type });
  if (upErr) return { ok: false, error: upErr.message };

  const { error } = await db().from("product_experiments").update({ photo_path: path }).eq("id", experimentId);
  if (error) {
    await admin.storage.from("product-rnd-photos").remove([path]);
    return { ok: false, error: error.message };
  }
  return { ok: true, data: { path } };
}

// ---------------------------------------------------------------------
// Daftar tester
// ---------------------------------------------------------------------

export interface TesterView {
  id: string;
  branch: RndBranch;
  userId: string;
  userName: string | null;
  testingScope: string | null;
  validUntil: string | null;
  status: "pending" | "approved";
  proposedByName: string | null;
  createdAt: string;
}

export async function listTesters(branch?: RndBranch): Promise<TesterView[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  let query = db().from("product_testers").select("*").order("created_at", { ascending: false });
  if (branch) query = query.eq("branch", branch);
  const { data } = await query;
  const rows = data ?? [];
  const names = await namesFor(rows.flatMap((r: any) => [r.user_id, r.proposed_by]));
  return rows.map((r: any) => ({
    id: r.id,
    branch: r.branch,
    userId: r.user_id,
    userName: names.get(r.user_id) ?? null,
    testingScope: r.testing_scope,
    validUntil: r.valid_until,
    status: r.status,
    proposedByName: names.get(r.proposed_by) ?? null,
    createdAt: r.created_at,
  }));
}

/** Kepala tim (atau admin) mengusulkan — belum aktif sampai admin menyetujui. */
export async function proposeTester(input: {
  branch: RndBranch;
  userId: string;
  testingScope?: string | null;
  validUntil?: string | null;
}): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  if (!(await canScreen())) return { ok: false, error: "Hanya kepala tim atau admin" };
  const { error } = await db().from("product_testers").insert({
    branch: input.branch,
    user_id: input.userId,
    testing_scope: input.testingScope?.trim() || null,
    valid_until: input.validUntil || null,
    proposed_by: user.id,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/riset-produk");
  return { ok: true };
}

export async function approveTester(id: string): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const { error } = await db()
    .from("product_testers")
    .update({ status: "approved", approved_by: gate.userId, approved_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/riset-produk");
  return { ok: true };
}

export async function revokeTester(id: string): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const { error } = await db().from("product_testers").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/riset-produk");
  return { ok: true };
}

/** Dipakai gate POS kelak — tester aktif (approved, belum lewat valid_until). */
export async function isActiveTester(userId: string, branch: RndBranch): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);
  const { count } = await db()
    .from("product_testers")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("branch", branch)
    .eq("status", "approved")
    .or(`valid_until.is.null,valid_until.gte.${today}`);
  return (count ?? 0) > 0;
}

// ---------------------------------------------------------------------
// Kartu produk
// ---------------------------------------------------------------------

export interface ProductCardView {
  id: string;
  productName: string;
  shelfLifeDays: number | null;
  storageMethod: string | null;
  passCriteria: string | null;
  methodTempTime: string | null;
  referencePhotoUrl: string | null;
  updatedAt: string;
}

export async function listProductCards(): Promise<ProductCardView[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const { data } = await db().from("product_cards").select("*").order("product_name", { ascending: true });
  const rows = data ?? [];
  return Promise.all(
    rows.map(async (r: any) => ({
      id: r.id,
      productName: r.product_name,
      shelfLifeDays: r.shelf_life_days,
      storageMethod: r.storage_method,
      passCriteria: r.pass_criteria,
      methodTempTime: r.method_temp_time,
      referencePhotoUrl: await signPhoto(r.reference_photo_path),
      updatedAt: r.updated_at,
    }))
  );
}

export async function upsertProductCard(input: {
  productName: string;
  shelfLifeDays?: number | null;
  storageMethod?: string | null;
  passCriteria?: string | null;
  methodTempTime?: string | null;
}): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  if (!(await canScreen())) return { ok: false, error: "Hanya kepala tim atau admin" };
  if (!input.productName.trim()) return { ok: false, error: "Nama produk wajib" };

  const { error } = await db()
    .from("product_cards")
    .upsert(
      {
        product_name: input.productName.trim(),
        shelf_life_days: input.shelfLifeDays ?? null,
        storage_method: input.storageMethod?.trim() || null,
        pass_criteria: input.passCriteria?.trim() || null,
        method_temp_time: input.methodTempTime?.trim() || null,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "product_name" }
    );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/riset-produk");
  return { ok: true };
}

export async function canScreenRnd(): Promise<boolean> {
  return canScreen();
}
