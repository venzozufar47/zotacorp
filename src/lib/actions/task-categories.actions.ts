"use server";

/**
 * Kategori Tugas — alat manajemen superadmin saja. Karyawan tidak pernah
 * menerima nama kategori (tabelnya tanpa policy karyawan; action karyawan
 * tidak memilih kolomnya). Kategori melekat per PENUGASAN: mengubahnya
 * menyentuh semua salinan satu batch.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "./_supabase-admin";
import { requireAdmin, type ActionResult } from "./_gates";
import type { TaskCategory } from "@/lib/tasks/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

const nameSchema = z.string().trim().min(1, "Nama kategori wajib diisi").max(40, "Maksimal 40 karakter");

function revalidate() {
  revalidatePath("/admin/tasks");
}

function dupMessage(err: { code?: string; message: string }): string {
  return err.code === "23505" ? "Kategori dengan nama itu sudah ada." : err.message;
}

export async function listTaskCategories(): Promise<ActionResult<TaskCategory[]>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const db = createAdminClient() as any;
  const [{ data: cats, error }, { data: tasks }] = await Promise.all([
    db
      .from("assigned_task_categories")
      .select("id, name, sort_order")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    db
      .from("assigned_tasks")
      .select("id, batch_id, category_id")
      .not("category_id", "is", null)
      .neq("status", "cancelled"),
  ]);
  if (error) return { ok: false, error: error.message };

  // Hitung penugasan (batch), bukan salinan — satu tugas untuk 6 orang = 1.
  const seen = new Map<string, Set<string>>();
  for (const t of tasks ?? []) {
    const set = seen.get(t.category_id) ?? new Set<string>();
    set.add(t.batch_id ?? t.id);
    seen.set(t.category_id, set);
  }
  return {
    ok: true,
    data: (cats ?? []).map((c: any) => ({
      id: c.id,
      name: c.name,
      sortOrder: c.sort_order,
      taskCount: seen.get(c.id)?.size ?? 0,
    })),
  };
}

export async function createTaskCategory(name: string): Promise<ActionResult<{ id: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Nama tidak valid" };

  const db = createAdminClient() as any;
  const { data: last } = await db
    .from("assigned_task_categories")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await db
    .from("assigned_task_categories")
    .insert({ name: parsed.data, sort_order: (last?.sort_order ?? -1) + 1 })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error ? dupMessage(error) : "Gagal membuat kategori" };
  revalidate();
  return { ok: true, data: { id: data.id } };
}

export async function renameTaskCategory(id: string, name: string): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Nama tidak valid" };
  const db = createAdminClient() as any;
  const { data, error } = await db
    .from("assigned_task_categories")
    .update({ name: parsed.data })
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: dupMessage(error) };
  if (!data || data.length === 0) return { ok: false, error: "Kategori tidak ditemukan" };
  revalidate();
  return { ok: true };
}

/** Hapus kategori — tugas yang memakainya menjadi tanpa kategori (ON DELETE SET NULL). */
export async function deleteTaskCategory(id: string): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const db = createAdminClient() as any;
  const { error } = await db.from("assigned_task_categories").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

/** Set kategori satu penugasan (semua salinan satu batch; null = tanpa kategori). */
export async function setTaskCategory(
  taskId: string,
  categoryId: string | null
): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const parsed = z.object({ taskId: z.string().uuid(), categoryId: z.string().uuid().nullable() }).safeParse({
    taskId,
    categoryId,
  });
  if (!parsed.success) return { ok: false, error: "Input tidak valid" };

  const db = createAdminClient() as any;
  if (categoryId) {
    const { data: cat } = await db
      .from("assigned_task_categories")
      .select("id")
      .eq("id", categoryId)
      .maybeSingle();
    if (!cat) return { ok: false, error: "Kategori tidak ditemukan" };
  }
  const { data: task } = await db
    .from("assigned_tasks")
    .select("id, batch_id")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) return { ok: false, error: "Tugas tidak ditemukan" };

  const q = db.from("assigned_tasks").update({ category_id: categoryId });
  const { error } = await (task.batch_id ? q.eq("batch_id", task.batch_id) : q.eq("id", task.id));
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}
