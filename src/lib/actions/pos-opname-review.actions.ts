"use server";

/**
 * Tinjauan selisih opname untuk superadmin: tiap SKU yang selisih beserta alasan yang dipilih kasir. Tidak wajib
 * dibuka harian — cukup mingguan; yang "belum diketahui" atau tanpa alasan ditandai supaya mudah dicari.
 */

import { createAdminClient } from "./_supabase-admin";
import { requireAdmin, type ActionResult } from "./_gates";
import { jakartaDateMinusDays, jakartaDateString } from "@/lib/utils/jakarta";
import { isOpnameReason, type OpnameDiffReason } from "@/lib/pos/opname-reasons";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface OpnameReviewRow {
  opnameId: string;
  date: string;
  time: string | null;
  account: string;
  performer: string | null;
  sku: string;
  diffQty: number;
  diffValue: number;
  /** null = selisih dari alur lama (tanpa alasan). */
  reason: OpnameDiffReason | null;
  swapLabel: string | null;
}

export interface OpnameReview {
  days: number;
  rows: OpnameReviewRow[];
  /** Jumlah SKU-selisih per alasan ("-" = tanpa alasan). */
  countByReason: Record<string, number>;
  /** Total nilai Rp selisih kurang (negatif) dan lebih (positif). */
  valueShort: number;
  valueOver: number;
}

export async function getOpnameDiscrepancyReview(days: number): Promise<ActionResult<OpnameReview>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const span = Math.min(Math.max(Math.floor(days) || 7, 1), 90);
  const since = jakartaDateMinusDays(jakartaDateString(new Date()), span);
  const admin = createAdminClient() as any;

  const { data: opnames, error } = await admin
    .from("pos_stock_opnames")
    .select("id, bank_account_id, opname_date, opname_time, performed_by, created_by")
    .gte("opname_date", since)
    .order("opname_date", { ascending: false })
    .order("opname_time", { ascending: false })
    .limit(500);
  if (error) return { ok: false, error: error.message };
  const heads = (opnames ?? []) as Record<string, any>[];
  if (heads.length === 0) return { ok: true, data: { days: span, rows: [], countByReason: {}, valueShort: 0, valueOver: 0 } };

  const ids = heads.map((h) => h.id as string);
  const items: Record<string, any>[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await admin
      .from("pos_stock_opname_items")
      .select("opname_id, product_name_snapshot, variant_name_snapshot, unit_price_snapshot, physical_count, expected_count, diff_reason, diff_swap_label")
      .in("opname_id", ids.slice(i, i + 100));
    items.push(...((data ?? []) as Record<string, any>[]));
  }

  const accountIds = [...new Set(heads.map((h) => h.bank_account_id as string))];
  const personIds = [...new Set(heads.map((h) => (h.performed_by ?? h.created_by) as string | null).filter((v): v is string => !!v))];
  const [{ data: accts }, { data: people }] = await Promise.all([
    admin.from("bank_accounts").select("id, account_name").in("id", accountIds),
    personIds.length ? admin.from("profiles").select("id, full_name, nickname").in("id", personIds) : Promise.resolve({ data: [] }),
  ]);
  const acctName = new Map<string, string>((accts ?? []).map((a: any) => [a.id, a.account_name]));
  const personName = new Map<string, string>((people ?? []).map((p: any) => [p.id, p.nickname || p.full_name || "—"]));
  const headById = new Map(heads.map((h) => [h.id as string, h]));

  const rows: OpnameReviewRow[] = [];
  const countByReason: Record<string, number> = {};
  let valueShort = 0;
  let valueOver = 0;
  for (const it of items) {
    const diff = Number(it.physical_count) - Number(it.expected_count);
    if (diff === 0) continue;
    const h = headById.get(it.opname_id as string);
    if (!h) continue;
    const value = diff * Number(it.unit_price_snapshot);
    if (diff < 0) valueShort += value;
    else valueOver += value;
    const reason = isOpnameReason(it.diff_reason) ? it.diff_reason : null;
    countByReason[reason ?? "-"] = (countByReason[reason ?? "-"] ?? 0) + 1;
    const who = (h.performed_by ?? h.created_by) as string | null;
    rows.push({
      opnameId: h.id,
      date: h.opname_date,
      time: h.opname_time ?? null,
      account: acctName.get(h.bank_account_id) ?? "—",
      performer: who ? personName.get(who) ?? null : null,
      sku: it.variant_name_snapshot ? `${it.product_name_snapshot} · ${it.variant_name_snapshot}` : it.product_name_snapshot,
      diffQty: diff,
      diffValue: value,
      reason,
      swapLabel: it.diff_swap_label ?? null,
    });
  }
  // Yang paling perlu dilihat di atas: belum diketahui / tanpa alasan, lalu terbaru.
  const rank = (r: OpnameReviewRow) => (r.reason === "belum_diketahui" ? 0 : r.reason === null ? 1 : 2);
  rows.sort((a, b) => rank(a) - rank(b) || `${b.date} ${b.time ?? ""}`.localeCompare(`${a.date} ${a.time ?? ""}`));
  return { ok: true, data: { days: span, rows, countByReason, valueShort, valueOver } };
}
