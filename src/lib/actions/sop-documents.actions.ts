"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "./_supabase-admin";
import { requireAdmin } from "./_gates";
import { getCurrentUser } from "@/lib/supabase/cached";

/**
 * Pengakuan SOP Digital (PRD-14) — perpustakaan SOP tertulis (bukan
 * checklist eksekusi seperti modul `cleaning_*`) yang wajib dibaca &
 * diakui tiap karyawan Haengbocake. Setiap edit isi menaikkan `version`
 * di `sop_documents`; pengakuan (`sop_document_acknowledgments`) terikat
 * ke versi tertentu, jadi revisi otomatis meminta pengakuan ulang tanpa
 * menghapus riwayat pengakuan versi lama — basis akuntabilitas, bukan
 * sekadar arsip dokumen.
 */

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/* eslint-disable @typescript-eslint/no-explicit-any */
function db(): any {
  return createAdminClient();
}

async function namesFor(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (unique.length === 0) return new Map();
  const { data } = await db().from("profiles").select("id, full_name").in("id", unique);
  return new Map((data ?? []).map((p: { id: string; full_name: string }) => [p.id, p.full_name]));
}

async function activeHaengbocakeEmployeeIds(): Promise<string[]> {
  const { data } = await db()
    .from("profiles")
    .select("id")
    .eq("business_unit", "Haengbocake")
    .eq("is_active", true);
  return (data ?? []).map((p: { id: string }) => p.id);
}

export interface SopDocumentAdminView {
  id: string;
  title: string;
  category: string;
  body: string;
  version: number;
  isActive: boolean;
  updatedByName: string | null;
  updatedAt: string;
  ackedCount: number;
  totalEmployees: number;
}

export async function listSopDocumentsAdmin(): Promise<SopDocumentAdminView[]> {
  const gate = await requireAdmin();
  if (!gate.ok) return [];

  const [{ data: docs }, employeeIds] = await Promise.all([
    db().from("sop_documents").select("*").order("created_at", { ascending: false }),
    activeHaengbocakeEmployeeIds(),
  ]);
  const rows = docs ?? [];
  if (rows.length === 0) return [];

  const { data: acks } = await db()
    .from("sop_document_acknowledgments")
    .select("document_id, version, user_id")
    .in("document_id", rows.map((r: any) => r.id));
  const ackRows = (acks ?? []) as { document_id: string; version: number; user_id: string }[];

  const names = await namesFor(rows.map((r: any) => r.updated_by));
  const employeeSet = new Set(employeeIds);

  return rows.map((r: any) => {
    const ackedCount = new Set(
      ackRows
        .filter((a) => a.document_id === r.id && a.version === r.version && employeeSet.has(a.user_id))
        .map((a) => a.user_id)
    ).size;
    return {
      id: r.id,
      title: r.title,
      category: r.category,
      body: r.body,
      version: r.version,
      isActive: r.is_active,
      updatedByName: names.get(r.updated_by) ?? null,
      updatedAt: r.updated_at,
      ackedCount,
      totalEmployees: employeeIds.length,
    };
  });
}

export async function createSopDocument(input: {
  title: string;
  category: string;
  body: string;
}): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const title = input.title.trim();
  const category = input.category.trim();
  const body = input.body.trim();
  if (!title || !category || !body) return { ok: false, error: "Judul, kategori, dan isi wajib diisi" };

  const { error } = await db().from("sop_documents").insert({
    title,
    category,
    body,
    version: 1,
    created_by: gate.userId,
    updated_by: gate.userId,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/sop-pengakuan");
  revalidatePath("/pengakuan-sop");
  return { ok: true };
}

/** Edit isi SOP — menaikkan `version`, meminta semua karyawan mengakui ulang. */
export async function updateSopDocument(input: {
  id: string;
  title: string;
  category: string;
  body: string;
}): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const title = input.title.trim();
  const category = input.category.trim();
  const body = input.body.trim();
  if (!title || !category || !body) return { ok: false, error: "Judul, kategori, dan isi wajib diisi" };

  const { data: current } = await db().from("sop_documents").select("version").eq("id", input.id).maybeSingle();
  if (!current) return { ok: false, error: "SOP tidak ditemukan" };

  const { error } = await db()
    .from("sop_documents")
    .update({
      title,
      category,
      body,
      version: current.version + 1,
      updated_by: gate.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/sop-pengakuan");
  revalidatePath("/pengakuan-sop");
  return { ok: true };
}

export async function setSopDocumentActive(input: { id: string; isActive: boolean }): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const { error } = await db()
    .from("sop_documents")
    .update({ is_active: input.isActive, updated_by: gate.userId, updated_at: new Date().toISOString() })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/sop-pengakuan");
  revalidatePath("/pengakuan-sop");
  return { ok: true };
}

export interface SopAckStatusRow {
  userId: string;
  name: string;
  acknowledged: boolean;
  acknowledgedAt: string | null;
}

/** Siapa yang sudah/belum mengakui versi SOP yang berlaku saat ini. */
export async function listAckStatusForDocument(documentId: string): Promise<SopAckStatusRow[]> {
  const gate = await requireAdmin();
  if (!gate.ok) return [];
  const { data: doc } = await db().from("sop_documents").select("version").eq("id", documentId).maybeSingle();
  if (!doc) return [];

  const [employeeIds, { data: acks }] = await Promise.all([
    activeHaengbocakeEmployeeIds(),
    db()
      .from("sop_document_acknowledgments")
      .select("user_id, acknowledged_at")
      .eq("document_id", documentId)
      .eq("version", doc.version),
  ]);
  const ackMap = new Map(
    ((acks ?? []) as { user_id: string; acknowledged_at: string }[]).map((a) => [a.user_id, a.acknowledged_at])
  );
  const names = await namesFor(employeeIds);

  return employeeIds
    .map((id) => ({
      userId: id,
      name: names.get(id) ?? "—",
      acknowledged: ackMap.has(id),
      acknowledgedAt: ackMap.get(id) ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface SopDocumentForEmployee {
  id: string;
  title: string;
  category: string;
  body: string;
  version: number;
  updatedAt: string;
  acknowledged: boolean;
}

export async function listSopDocumentsForEmployee(): Promise<SopDocumentForEmployee[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data: docs } = await db()
    .from("sop_documents")
    .select("*")
    .eq("is_active", true)
    .order("category", { ascending: true })
    .order("title", { ascending: true });
  const rows = docs ?? [];
  if (rows.length === 0) return [];

  const { data: myAcks } = await db()
    .from("sop_document_acknowledgments")
    .select("document_id, version")
    .eq("user_id", user.id)
    .in("document_id", rows.map((r: any) => r.id));
  const ackSet = new Set(
    ((myAcks ?? []) as { document_id: string; version: number }[]).map((a) => `${a.document_id}:${a.version}`)
  );

  return rows.map((r: any) => ({
    id: r.id,
    title: r.title,
    category: r.category,
    body: r.body,
    version: r.version,
    updatedAt: r.updated_at,
    acknowledged: ackSet.has(`${r.id}:${r.version}`),
  }));
}

export async function countPendingSopAcknowledgments(): Promise<number> {
  const docs = await listSopDocumentsForEmployee();
  return docs.filter((d) => !d.acknowledged).length;
}

export async function acknowledgeSopDocument(input: { documentId: string; version: number }): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const { error } = await db()
    .from("sop_document_acknowledgments")
    .upsert(
      { document_id: input.documentId, user_id: user.id, version: input.version },
      { onConflict: "document_id,user_id,version" }
    );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/pengakuan-sop");
  return { ok: true };
}
