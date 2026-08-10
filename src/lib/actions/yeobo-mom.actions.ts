"use server";

/**
 * Notulen rapat (MoM) Yeobo Space untuk portal investor.
 *
 * Pembacaan investor sengaja memakai client ber-RLS, BUKAN service-role.
 * Penyaringan "investor hanya melihat rapat cabangnya" dikerjakan policy
 * `yeobo_meeting_notes_investor_select` di database, sehingga tidak ada
 * jalur kode yang bisa lupa memfilter. Admin memakai service-role karena
 * ia perlu melihat draf yang belum terbit.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient as adminClient } from "./_supabase-admin";
import { requireAdmin, type ActionResult } from "./_gates";

export interface MeetingNote {
  id: string;
  meetingDate: string;
  title: string;
  branches: string[];
  summary: string | null;
  body: string;
  published: boolean;
  updatedAt: string;
}

interface DbRow {
  id: string;
  meeting_date: string;
  title: string;
  branches: string[] | null;
  summary: string | null;
  body: string;
  published: boolean;
  updated_at: string;
}

function mapRow(r: DbRow): MeetingNote {
  return {
    id: r.id,
    meetingDate: r.meeting_date,
    title: r.title,
    branches: r.branches ?? [],
    summary: r.summary,
    body: r.body,
    published: r.published,
    updatedAt: r.updated_at,
  };
}

const SELECT = "id, meeting_date, title, branches, summary, body, published, updated_at";

/**
 * Notulen yang boleh dibaca investor yang sedang login, terbaru dulu.
 * Mengembalikan array kosong kalau dia tidak terhubung ke cabang mana pun —
 * itu keadaan yang sah, bukan error.
 */
export async function listMyMeetingNotes(): Promise<MeetingNote[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("yeobo_meeting_notes" as never)
    .select(SELECT)
    .order("meeting_date", { ascending: false });
  return ((data ?? []) as unknown as DbRow[]).map(mapRow);
}

/** Semua notulen termasuk draf. Admin saja. */
export async function listMeetingNotesAdmin(): Promise<MeetingNote[]> {
  const gate = await requireAdmin();
  if (!gate.ok) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = adminClient() as any;
  const { data } = await supabase
    .from("yeobo_meeting_notes")
    .select(SELECT)
    .order("meeting_date", { ascending: false });
  return ((data ?? []) as DbRow[]).map(mapRow);
}

export async function upsertMeetingNote(input: {
  id?: string;
  meetingDate: string;
  title: string;
  branches: string[];
  summary?: string | null;
  body: string;
  published?: boolean;
}): Promise<ActionResult<{ id: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const title = input.title.trim();
  const body = input.body.trim();
  // Urutkan & buang duplikat: `branches` ikut menentukan siapa yang boleh
  // membaca, jadi bentuknya harus kanonik — bukan bergantung urutan klik.
  const branches = [...new Set(input.branches.map((b) => b.trim()).filter(Boolean))].sort();

  if (!title) return { ok: false, error: "Judul wajib diisi" };
  if (!body) return { ok: false, error: "Isi notulen wajib diisi" };
  if (branches.length === 0) return { ok: false, error: "Pilih minimal satu cabang" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.meetingDate))
    return { ok: false, error: "Tanggal rapat tidak valid" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = adminClient() as any;
  const payload = {
    meeting_date: input.meetingDate,
    title,
    branches,
    summary: input.summary?.trim() || null,
    body,
    published: input.published ?? true,
    updated_by: gate.userId,
  };

  const { data, error } = input.id
    ? await supabase
        .from("yeobo_meeting_notes")
        .update(payload)
        .eq("id", input.id)
        .select("id")
        .single()
    : await supabase
        .from("yeobo_meeting_notes")
        .insert({ ...payload, created_by: gate.userId })
        .select("id")
        .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath("/investor/mom");
  revalidatePath("/admin/investors/mom");
  return { ok: true, data: { id: (data as { id: string }).id } };
}

export async function deleteMeetingNote(id: string): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = adminClient() as any;
  const { error } = await supabase.from("yeobo_meeting_notes").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/investor/mom");
  revalidatePath("/admin/investors/mom");
  return { ok: true };
}
