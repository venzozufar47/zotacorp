"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  requireAdmin,
  requireAdminOrPosAssignee,
  requireServiceLevelViewer,
  type ActionResult,
} from "./_gates";
import { jakartaDateString, jakartaDateMinusDays } from "@/lib/utils/jakarta";
import {
  computeServiceLevel,
  type ServiceLevelResult,
} from "@/lib/pos/service-level";
import { listActiveSkus } from "@/lib/pos/stock-engine";

/**
 * Server action untuk metrik Service Level.
 *
 * File terpisah dari pos-stock.actions.ts yang sudah ~1600 baris dan
 * memakai gate berbeda.
 *
 * DUA JALUR BACA yang sengaja dibedakan:
 *  - `getServiceLevel` menghitung LIVE dari tabel POS mentah. Butuh
 *    `requireAdminOrPosAssignee` karena RLS pos_products/pos_sales/
 *    pos_stock_movements memang tertutup untuk non-assignee.
 *  - `getServiceLevelSummary` membaca snapshot yang sudah jadi. Gate-nya
 *    lebih longgar (`requireServiceLevelViewer`) supaya penanggung jawab
 *    metrik yang bukan orang POS tetap bisa melihat angkanya di
 *    dashboard karyawan.
 */

const MAX_SPAN_DAYS = 90;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

function validateRange(
  fromDate: string,
  toDate: string
): { ok: true } | { ok: false; error: string } {
  if (!YMD.test(fromDate) || !YMD.test(toDate)) {
    return { ok: false, error: "Format tanggal harus YYYY-MM-DD." };
  }
  if (fromDate > toDate) {
    return { ok: false, error: "Tanggal mulai melewati tanggal akhir." };
  }
  const days =
    Math.round(
      (Date.parse(toDate + "T00:00:00Z") - Date.parse(fromDate + "T00:00:00Z")) /
        86_400_000
    ) + 1;
  if (days > MAX_SPAN_DAYS) {
    return { ok: false, error: `Rentang maksimal ${MAX_SPAN_DAYS} hari.` };
  }
  return { ok: true };
}

/** Hitung live. Berat (~3 dtk untuk 30 hari) — jangan dipakai di hot path. */
export async function getServiceLevel(
  bankAccountId: string,
  range: { fromDate: string; toDate: string }
): Promise<ActionResult<ServiceLevelResult>> {
  const valid = validateRange(range.fromDate, range.toDate);
  if (!valid.ok) return { ok: false, error: valid.error };
  const gate = await requireAdminOrPosAssignee(bankAccountId);
  if (!gate.ok) return { ok: false, error: gate.error };

  const supabase = await createClient();
  const data = await computeServiceLevel(supabase, bankAccountId, {
    fromDate: range.fromDate,
    toDate: range.toDate,
  });
  return { ok: true, data };
}

export interface ServiceLevelSummary {
  bankAccountId: string;
  accountName: string;
  branch: string | null;
  /** Pooled dari baris snapshot. null = belum ada data terhitung. */
  percent: number | null;
  readySum: number;
  totalSkuSamples: number;
  lostSkuHours: number;
  daysCounted: number;
  /** Untuk sparkline — menaik menurut tanggal. */
  trend: Array<{ date: string; percent: number | null }>;
  /** Ada baris hasil backfill di rentang ini (angkanya tidak sebanding). */
  hasBackfill: boolean;
  /** Ada hari dengan opname parsial (angka bisa tertekan semu). */
  hasPartialOpname: boolean;
}

/**
 * Ringkasan dari tabel snapshot. Satu query, ringan — inilah yang dipakai
 * dashboard karyawan dan kartu POS untuk hari-hari lampau.
 *
 * Pooled dari `ready_sum` / `tracked_skus × sample_count`, BUKAN
 * merata-ratakan kolom `percent`: hari dengan sampel lebih sedikit tidak
 * boleh berbobot sama dengan hari penuh.
 */
export async function getServiceLevelSummary(
  bankAccountId: string,
  days = 30
): Promise<ActionResult<ServiceLevelSummary>> {
  const gate = await requireServiceLevelViewer(bankAccountId);
  if (!gate.ok) return { ok: false, error: gate.error };

  const span = Math.max(1, Math.min(MAX_SPAN_DAYS, Math.floor(days)));
  const today = jakartaDateString(new Date());
  const fromDate = jakartaDateMinusDays(today, span - 1);

  const supabase = await createClient();
  const [{ data: account }, { data: rows }] = await Promise.all([
    supabase
      .from("bank_accounts")
      .select("account_name, default_branch")
      .eq("id", bankAccountId)
      .maybeSingle(),
    supabase
      .from("pos_service_level_daily")
      .select(
        "snapshot_date, ready_sum, tracked_skus, sample_count, percent, source, partial_opname"
      )
      .eq("bank_account_id", bankAccountId)
      .gte("snapshot_date", fromDate)
      .lte("snapshot_date", today)
      .order("snapshot_date", { ascending: true }),
  ]);

  let readySum = 0;
  let totalSkuSamples = 0;
  let daysCounted = 0;
  let hasBackfill = false;
  let hasPartialOpname = false;
  const trend: ServiceLevelSummary["trend"] = [];

  for (const r of rows ?? []) {
    if (r.source === "backfill") hasBackfill = true;
    if (r.partial_opname) hasPartialOpname = true;
    const denom = r.tracked_skus * r.sample_count;
    // percent null = hari sengaja tidak dihitung (tanpa baseline / tanpa
    // aktivitas). Masuk trend sebagai lubang, bukan sebagai nol.
    if (r.percent === null || denom === 0) {
      trend.push({ date: r.snapshot_date, percent: null });
      continue;
    }
    readySum += r.ready_sum;
    totalSkuSamples += denom;
    daysCounted += 1;
    trend.push({ date: r.snapshot_date, percent: r.ready_sum / denom });
  }

  return {
    ok: true,
    data: {
      bankAccountId,
      accountName: account?.account_name ?? "",
      branch: account?.default_branch ?? null,
      percent: totalSkuSamples > 0 ? readySum / totalSkuSamples : null,
      readySum,
      totalSkuSamples,
      lostSkuHours: totalSkuSamples - readySum,
      daysCounted,
      trend,
      hasBackfill,
      hasPartialOpname,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────
//  Pengaturan (admin)
// ─────────────────────────────────────────────────────────────────────

export async function setServiceLevelSettings(input: {
  bankAccountId: string;
  enabled: boolean;
  openHour: number;
  closeHour: number;
}): Promise<ActionResult<undefined>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const open = Math.floor(input.openHour);
  const close = Math.floor(input.closeHour);
  // Dijaga juga oleh CHECK constraint di migrasi 122; divalidasi di sini
  // supaya pesannya manusiawi, bukan error Postgres mentah.
  if (!Number.isFinite(open) || open < 0 || open > 23) {
    return { ok: false, error: "Jam buka harus 0–23." };
  }
  if (!Number.isFinite(close) || close < 1 || close > 24) {
    return { ok: false, error: "Jam tutup harus 1–24." };
  }
  if (open >= close) {
    return { ok: false, error: "Jam buka harus lebih awal dari jam tutup." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("bank_accounts")
    .update({
      service_level_enabled: input.enabled,
      service_level_open_hour: open,
      service_level_close_hour: close,
    })
    .eq("id", input.bankAccountId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/service-level");
  revalidatePath("/pos", "layout");
  revalidatePath("/dashboard");
  return { ok: true, data: undefined };
}

export interface ServiceLevelOwnerRow {
  userId: string;
  fullName: string;
  email: string;
}

export async function listServiceLevelOwners(
  bankAccountId: string
): Promise<ServiceLevelOwnerRow[]> {
  const gate = await requireAdmin();
  if (!gate.ok) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("pos_service_level_owners")
    .select("user_id, profiles!inner(full_name, email)")
    .eq("bank_account_id", bankAccountId);
  return (data ?? []).map((r) => {
    const p = (r as unknown as { profiles: { full_name: string | null; email: string } })
      .profiles;
    return {
      userId: r.user_id,
      fullName: p.full_name ?? p.email,
      email: p.email,
    };
  });
}

/**
 * Ganti seluruh daftar penanggung jawab satu outlet.
 *
 * Set-diff, bukan flush-and-reinsert — meniru `setExtraWorkKindAssignees`.
 * Menghapus lalu memasukkan ulang semuanya akan menghanguskan
 * `assigned_at`/`assigned_by` orang yang sebenarnya tidak berubah.
 */
export async function setServiceLevelOwners(input: {
  bankAccountId: string;
  userIds: string[];
}): Promise<ActionResult<undefined>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const supabase = await createClient();
  const desired = new Set(input.userIds);
  const { data: existing } = await supabase
    .from("pos_service_level_owners")
    .select("user_id")
    .eq("bank_account_id", input.bankAccountId);
  const current = new Set((existing ?? []).map((r) => r.user_id));

  const toAdd = [...desired].filter((u) => !current.has(u));
  const toRemove = [...current].filter((u) => !desired.has(u));

  if (toAdd.length > 0) {
    const { error } = await supabase.from("pos_service_level_owners").insert(
      toAdd.map((user_id) => ({
        bank_account_id: input.bankAccountId,
        user_id,
        assigned_by: gate.userId,
      }))
    );
    if (error) return { ok: false, error: error.message };
  }
  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("pos_service_level_owners")
      .delete()
      .eq("bank_account_id", input.bankAccountId)
      .in("user_id", toRemove);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/admin/service-level");
  // Kartu di dashboard karyawan muncul/hilang berdasarkan tabel ini —
  // tanpa ini ia bertahan sampai reload penuh.
  revalidatePath("/dashboard");
  return { ok: true, data: undefined };
}

// ─────────────────────────────────────────────────────────────────────
//  Pengecualian SKU ber-tanggal-berlaku (admin)
// ─────────────────────────────────────────────────────────────────────

export interface ServiceLevelExclusionRow {
  id: string;
  productId: string;
  variantId: string | null;
  label: string;
  excludedFrom: string;
  excludedUntil: string | null;
  reason: string | null;
  /** Sedang berlaku hari ini. */
  active: boolean;
}

export async function listServiceLevelExclusions(
  bankAccountId: string
): Promise<ServiceLevelExclusionRow[]> {
  const gate = await requireAdminOrPosAssignee(bankAccountId);
  if (!gate.ok) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("pos_service_level_exclusions")
    .select(
      "id, product_id, variant_id, excluded_from, excluded_until, reason, pos_products!inner(name), pos_product_variants(name)"
    )
    .eq("bank_account_id", bankAccountId)
    .order("excluded_from", { ascending: false });

  const today = jakartaDateString(new Date());
  return (data ?? []).map((r) => {
    const j = r as unknown as {
      pos_products: { name: string };
      pos_product_variants: { name: string } | null;
    };
    const label =
      j.pos_products.name +
      (j.pos_product_variants ? ` — ${j.pos_product_variants.name}` : "");
    return {
      id: r.id,
      productId: r.product_id,
      variantId: r.variant_id,
      label,
      excludedFrom: r.excluded_from,
      excludedUntil: r.excluded_until,
      reason: r.reason,
      active:
        r.excluded_from <= today &&
        (r.excluded_until === null || r.excluded_until >= today),
    };
  });
}

export async function addServiceLevelExclusion(input: {
  bankAccountId: string;
  productId: string;
  variantId: string | null;
  excludedFrom: string;
  reason?: string;
}): Promise<ActionResult<undefined>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!YMD.test(input.excludedFrom)) {
    return { ok: false, error: "Format tanggal harus YYYY-MM-DD." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("pos_service_level_exclusions").insert({
    bank_account_id: input.bankAccountId,
    product_id: input.productId,
    variant_id: input.variantId,
    excluded_from: input.excludedFrom,
    reason: input.reason?.trim() || null,
    created_by: gate.userId,
  });
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return {
        ok: false,
        error: "Sudah ada pengecualian untuk SKU ini dengan tanggal mulai yang sama.",
      };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/service-level");
  revalidatePath("/pos", "layout");
  return { ok: true, data: undefined };
}

/**
 * Akhiri pengecualian mulai tanggal tertentu — mengisi `excluded_until`,
 * BUKAN menghapus barisnya.
 *
 * Menghapus akan membuat SKU itu kembali terhitung untuk SELURUH periode
 * pengecualian, yaitu menulis ulang angka yang sudah dilaporkan. Hapus
 * hanya disediakan untuk membatalkan salah input (lihat
 * `deleteServiceLevelExclusion`).
 */
export async function endServiceLevelExclusion(input: {
  id: string;
  excludedUntil: string;
}): Promise<ActionResult<undefined>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!YMD.test(input.excludedUntil)) {
    return { ok: false, error: "Format tanggal harus YYYY-MM-DD." };
  }

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("pos_service_level_exclusions")
    .select("excluded_from")
    .eq("id", input.id)
    .maybeSingle();
  if (!row) return { ok: false, error: "Pengecualian tidak ditemukan." };
  if (input.excludedUntil < row.excluded_from) {
    return {
      ok: false,
      error: "Tanggal berakhir tidak boleh mendahului tanggal mulai.",
    };
  }

  const { error } = await supabase
    .from("pos_service_level_exclusions")
    .update({ excluded_until: input.excludedUntil })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/service-level");
  revalidatePath("/pos", "layout");
  return { ok: true, data: undefined };
}

/** Hapus permanen — hanya untuk membatalkan salah input. */
export async function deleteServiceLevelExclusion(
  id: string
): Promise<ActionResult<undefined>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("pos_service_level_exclusions")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/service-level");
  revalidatePath("/pos", "layout");
  return { ok: true, data: undefined };
}

/** Daftar SKU satu outlet untuk pemilih pengecualian. */
export async function listServiceLevelSkus(bankAccountId: string): Promise<
  Array<{ productId: string; variantId: string | null; label: string }>
> {
  const gate = await requireAdmin();
  if (!gate.ok) return [];
  const supabase = await createClient();
  // Sengaja memakai listActiveSkus dari modul engine supaya daftar yang
  // ditawarkan admin PERSIS sama dengan yang dihitung metrik — termasuk
  // peruntuhan produk agregat jadi satu SKU.
  const { skus } = await listActiveSkus(supabase, bankAccountId);
  return skus.map((s) => ({
    productId: s.productId,
    variantId: s.variantId,
    label: s.productName + (s.variantName ? ` — ${s.variantName}` : ""),
  }));
}

// Hanya tipe yang di-re-export. Mengekspor ulang `loadServiceLevelConfig`
// dari file "use server" akan mengubahnya jadi endpoint server action
// TANPA gate — konsumen yang butuh helper itu mengimpornya langsung dari
// `@/lib/pos/service-level`.
export type { ServiceLevelResult };
