"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient as adminClient } from "./_supabase-admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/cached";
import type { ActionResult } from "./_gates";

export interface MetricComment {
  id: string;
  businessUnit: string;
  metricId: string;
  authorId: string;
  authorRole: "investor" | "admin";
  authorName: string | null;
  body: string;
  createdAt: string;
}

interface CommentRow {
  id: string;
  business_unit: string;
  metric_id: string;
  author_id: string;
  author_role: "investor" | "admin";
  body: string;
  created_at: string;
}

/**
 * Thread komentar per (BU, metric_id). Investor di BU yang sama
 * share thread → admin balas sekali, semua investor lihat.
 */
export async function listMetricComments(input: {
  businessUnit: string;
  metricId: string;
}): Promise<MetricComment[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = adminClient() as any;
  const { data: comments } = await supabase
    .from("bu_metric_comments")
    .select("*")
    .eq("business_unit", input.businessUnit)
    .eq("metric_id", input.metricId)
    .order("created_at", { ascending: true });
  const rows = (comments ?? []) as CommentRow[];
  // Tarik nama author dalam satu pass.
  const authorIds = Array.from(new Set(rows.map((r) => r.author_id)));
  const nameById = new Map<string, string | null>();
  if (authorIds.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", authorIds);
    for (const p of (profs ?? []) as Array<{
      id: string;
      full_name: string | null;
    }>) {
      nameById.set(p.id, p.full_name);
    }
  }
  return rows.map((r) => ({
    id: r.id,
    businessUnit: r.business_unit,
    metricId: r.metric_id,
    authorId: r.author_id,
    authorRole: r.author_role,
    authorName: nameById.get(r.author_id) ?? null,
    body: r.body,
    createdAt: r.created_at,
  }));
}

export async function postMetricComment(input: {
  businessUnit: string;
  metricId: string;
  body: string;
}): Promise<ActionResult<MetricComment>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Belum login" };
  if (!input.body.trim()) return { ok: false, error: "Komentar kosong" };

  // Tentukan author_role dari profile.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, full_name")
    .eq("id", user.id)
    .single();
  if (!profile) return { ok: false, error: "Profile tidak ditemukan" };
  if (profile.role !== "investor" && profile.role !== "admin") {
    return {
      ok: false,
      error: "Hanya investor & admin yang bisa post komentar",
    };
  }
  const author_role = profile.role as "investor" | "admin";

  // Insert lewat SSR client → RLS validate investor punya assignment
  // ke BU (atau admin bypass).
  const { data, error } = await supabase
    .from("bu_metric_comments")
    .insert({
      business_unit: input.businessUnit,
      metric_id: input.metricId,
      author_id: user.id,
      author_role,
      body: input.body.trim(),
    })
    .select("*")
    .single();
  if (error) return { ok: false, error: error.message };
  const row = data as CommentRow;
  revalidatePath("/investor", "layout");
  revalidatePath("/admin/investors");
  return {
    ok: true,
    data: {
      id: row.id,
      businessUnit: row.business_unit,
      metricId: row.metric_id,
      authorId: row.author_id,
      authorRole: row.author_role,
      authorName: profile.full_name,
      body: row.body,
      createdAt: row.created_at,
    },
  };
}

export async function deleteMetricComment(
  commentId: string
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Belum login" };
  // RLS: author atau admin saja.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = await createClient();
  const { error } = await supabase
    .from("bu_metric_comments")
    .delete()
    .eq("id", commentId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/investor", "layout");
  revalidatePath("/admin/investors");
  return { ok: true };
}

/**
 * Count komentar per metric_id untuk satu BU + flag siapa author
 * paling akhir (untuk indikator "balasan admin belum dibaca").
 * Dipakai untuk render badge count di KPI tile.
 */
export async function countCommentsForBu(
  businessUnit: string
): Promise<
  Record<string, { count: number; lastAuthorRole: "investor" | "admin" }>
> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = adminClient() as any;
  const { data } = await supabase
    .from("bu_metric_comments")
    .select("metric_id, author_role, created_at")
    .eq("business_unit", businessUnit)
    .order("created_at", { ascending: true });
  const rows = (data ?? []) as Array<{
    metric_id: string;
    author_role: "investor" | "admin";
    created_at: string;
  }>;
  const out: Record<
    string,
    { count: number; lastAuthorRole: "investor" | "admin" }
  > = {};
  for (const r of rows) {
    const e = out[r.metric_id] ?? { count: 0, lastAuthorRole: r.author_role };
    e.count += 1;
    e.lastAuthorRole = r.author_role;
    out[r.metric_id] = e;
  }
  return out;
}
