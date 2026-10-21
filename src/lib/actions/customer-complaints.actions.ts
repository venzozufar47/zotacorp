"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "./_supabase-admin";
import { getCurrentUser, getCurrentRole, getCurrentProfile } from "@/lib/supabase/cached";
import { sendPushToAdmins } from "@/lib/push/web-push";
import { jakartaDateMinusDays, jakartaDateString } from "@/lib/utils/jakarta";

/**
 * Log Keluhan & Insiden Pelanggan (PRD-3) — Formulir Lampiran C Dokumen 6.
 * Sumber metrik "keluhan/1000 transaksi" untuk Scorecard Cabang (PRD-2).
 *
 * Kasus alergi/sakit = kode merah: push ke semua admin SAAT ITU JUGA,
 * tidak menunggu siapa pun membuka halaman (SOP 5.5, 8.4).
 *
 * `customer_complaints` belum di generated `Database` type — pola
 * `db(): any` sama dengan modul PRD lain sesi ini.
 */

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/* eslint-disable @typescript-eslint/no-explicit-any */
function db(): any {
  return createAdminClient();
}

export type ComplaintBranch = "Pare" | "Semarang";
export type ComplaintKind =
  | "produk"
  | "layanan"
  | "alergi_sakit"
  | "pelanggan_mengganggu"
  | "barang_tertinggal"
  | "lainnya";
export type ComplaintSource = "toko" | "sosmed" | "google_maps" | "pesan";

async function canFile(): Promise<boolean> {
  const role = await getCurrentRole();
  if (role === "admin") return true;
  if (role === "investor") return false;
  const profile = await getCurrentProfile();
  return profile?.business_unit === "Haengbocake";
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

export interface ComplaintView {
  id: string;
  branch: ComplaintBranch;
  occurredAt: string;
  kind: ComplaintKind;
  source: ComplaintSource;
  description: string;
  productOrTxRef: string | null;
  actionTaken: string | null;
  compensation: string | null;
  status: "open" | "closed";
  reportedByName: string | null;
  closedByName: string | null;
  closedAt: string | null;
  createdAt: string;
}

function hydrate(rows: any[], names: Map<string, string>): ComplaintView[] {
  return rows.map((r) => ({
    id: r.id,
    branch: r.branch,
    occurredAt: r.occurred_at,
    kind: r.kind,
    source: r.source,
    description: r.description,
    productOrTxRef: r.product_or_tx_ref,
    actionTaken: r.action_taken,
    compensation: r.compensation,
    status: r.status,
    reportedByName: names.get(r.reported_by) ?? null,
    closedByName: r.closed_by ? names.get(r.closed_by) ?? null : null,
    closedAt: r.closed_at,
    createdAt: r.created_at,
  }));
}

export interface SubmitComplaintInput {
  branch: ComplaintBranch;
  kind: ComplaintKind;
  source: ComplaintSource;
  description: string;
  productOrTxRef?: string | null;
  actionTaken?: string | null;
  compensation?: string | null;
}

export async function submitComplaint(
  input: SubmitComplaintInput
): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  if (!(await canFile())) return { ok: false, error: "Forbidden" };
  if (!input.description.trim()) return { ok: false, error: "Kronologi wajib diisi" };

  const { data: inserted, error } = await db()
    .from("customer_complaints")
    .insert({
      branch: input.branch,
      kind: input.kind,
      source: input.source,
      description: input.description.trim(),
      product_or_tx_ref: input.productOrTxRef?.trim() || null,
      action_taken: input.actionTaken?.trim() || null,
      compensation: input.compensation?.trim() || null,
      reported_by: user.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  if (input.kind === "alergi_sakit") {
    await sendPushToAdmins({
      title: `Kode merah — keluhan alergi/sakit ${input.branch}`,
      body: input.description.slice(0, 140),
      url: "/keluhan",
    });
  }

  revalidatePath("/keluhan");
  return { ok: true, data: { id: (inserted as { id: string }).id } };
}

export async function listComplaints(opts?: {
  branch?: ComplaintBranch;
  status?: "open" | "closed";
  days?: number;
}): Promise<ComplaintView[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  if (!(await canFile())) return [];

  let query = db().from("customer_complaints").select("*").order("occurred_at", { ascending: false });
  if (opts?.branch) query = query.eq("branch", opts.branch);
  if (opts?.status) query = query.eq("status", opts.status);
  if (opts?.days) {
    const since = new Date(Date.now() - opts.days * 24 * 3600 * 1000).toISOString();
    query = query.gte("occurred_at", since);
  }
  const { data } = await query;
  const rows = data ?? [];
  const ids = rows.flatMap((r: any) => [r.reported_by, r.closed_by]);
  const names = await namesFor(ids);
  return hydrate(rows, names);
}

export async function closeComplaint(input: {
  id: string;
  actionTaken: string;
  compensation?: string | null;
}): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  if (!(await canFile())) return { ok: false, error: "Forbidden" };
  if (!input.actionTaken.trim()) return { ok: false, error: "Isi tindakan yang diambil" };

  const { error } = await db()
    .from("customer_complaints")
    .update({
      status: "closed",
      action_taken: input.actionTaken.trim(),
      compensation: input.compensation?.trim() || null,
      closed_by: user.id,
      closed_at: new Date().toISOString(),
    })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/keluhan");
  return { ok: true };
}

export async function canFileComplaint(): Promise<boolean> {
  return canFile();
}

/** Jumlah keluhan N hari terakhir untuk satu cabang — input Scorecard (PRD-2). */
/** Jumlah keluhan pada rentang tanggal WIB [startDate, endDate] (inklusif), untuk perbandingan per bulan. */
export async function getComplaintCountBetween(
  branch: ComplaintBranch,
  startDate: string,
  endDate: string
): Promise<number> {
  const { count } = await db()
    .from("customer_complaints")
    .select("id", { count: "exact", head: true })
    .eq("branch", branch)
    .gte("occurred_at", `${startDate}T00:00:00+07:00`)
    .lt("occurred_at", `${new Date(new Date(`${endDate}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10)}T00:00:00+07:00`);
  return count ?? 0;
}

export async function getComplaintCount(branch: ComplaintBranch, days: number): Promise<number> {
  const since = jakartaDateMinusDays(jakartaDateString(new Date()), days);
  const { count } = await db()
    .from("customer_complaints")
    .select("id", { count: "exact", head: true })
    .eq("branch", branch)
    .gte("occurred_at", `${since}T00:00:00+07:00`);
  return count ?? 0;
}
