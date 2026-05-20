"use server";

import { revalidatePath } from "next/cache";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { requireAdmin, type ActionResult } from "./_gates";
import { jakartaDateString } from "@/lib/utils/jakarta";
import {
  applyDiscount,
  type DiscountCampaignLite,
  type RoundingMode,
} from "@/lib/pos/discount";

function adminClient() {
  return createServiceClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export interface PosDiscountCampaign {
  id: string;
  bankAccountId: string;
  startDate: string;
  endDate: string;
  percentOff: number;
  roundingUnit: number;
  roundingMode: RoundingMode;
  note: string | null;
}

interface CampaignRow {
  id: string;
  bank_account_id: string;
  start_date: string;
  end_date: string;
  percent_off: number | string;
  rounding_unit: number;
  rounding_mode: RoundingMode;
  note: string | null;
}

function mapCampaign(r: CampaignRow): PosDiscountCampaign {
  return {
    id: r.id,
    bankAccountId: r.bank_account_id,
    startDate: r.start_date,
    endDate: r.end_date,
    percentOff: Number(r.percent_off),
    roundingUnit: r.rounding_unit,
    roundingMode: r.rounding_mode,
    note: r.note,
  };
}

/**
 * Resolve campaign yang berlaku untuk satu rekening pada tanggal
 * tertentu (default: hari ini WIB). Service-role client — read-only,
 * boleh dipanggil dari server-side rendering apa pun. Dipakai
 * createPosSale dan halaman /pos.
 */
export async function getActiveDiscount(
  bankAccountId: string,
  dateYmd?: string
): Promise<PosDiscountCampaign | null> {
  const supabase = adminClient();
  const date = dateYmd ?? jakartaDateString(new Date());
  const { data } = await supabase
    .from("pos_discount_campaigns" as never)
    .select("*")
    .eq("bank_account_id", bankAccountId)
    .lte("start_date", date)
    .gte("end_date", date)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? mapCampaign(data as unknown as CampaignRow) : null;
}

/**
 * Aktifkan preset diskon hari ini: 10% off, floor ke kelipatan 1.000.
 * Kalau sudah ada campaign aktif untuk hari ini di rekening tersebut,
 * tidak buat baru (idempotent). Setelah insert, jalankan retroactive
 * update untuk semua sale hari ini yang belum kena campaign apa pun
 * (lihat applyDiscountRetro).
 */
export async function activateTodayDiscountPreset(
  bankAccountId: string
): Promise<
  ActionResult<{
    campaign: PosDiscountCampaign;
    retroUpdatedCount: number;
    created: boolean;
  }>
> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();
  const today = jakartaDateString(new Date());

  // Cek campaign existing — kalau hari ini sudah ter-cover, skip insert.
  const { data: existing } = await supabase
    .from("pos_discount_campaigns" as never)
    .select("*")
    .eq("bank_account_id", bankAccountId)
    .lte("start_date", today)
    .gte("end_date", today)
    .limit(1)
    .maybeSingle();
  let campaign: PosDiscountCampaign;
  let created = false;
  if (existing) {
    campaign = mapCampaign(existing as unknown as CampaignRow);
  } else {
    const { data: inserted, error } = await supabase
      .from("pos_discount_campaigns" as never)
      .insert({
        bank_account_id: bankAccountId,
        start_date: today,
        end_date: today,
        percent_off: 10,
        rounding_unit: 1000,
        rounding_mode: "floor",
        note: "Preset 10% — pembulatan ke bawah Rp 1.000",
        created_by: gate.userId,
      } as never)
      .select("*")
      .single();
    if (error || !inserted) {
      return { ok: false, error: error?.message ?? "Gagal membuat campaign" };
    }
    campaign = mapCampaign(inserted as unknown as CampaignRow);
    created = true;
  }

  const retro = await applyDiscountRetro(campaign.id);
  if (!retro.ok) {
    // Campaign tetap ter-insert; warn caller tapi tidak rollback —
    // retro bisa dijalankan ulang manual jika perlu.
    return { ok: false, error: `Campaign aktif tapi retro gagal: ${retro.error}` };
  }

  revalidatePath("/pos", "layout");
  revalidatePath("/pos/riwayat", "layout");
  revalidatePath("/admin/finance", "layout");

  return {
    ok: true,
    data: {
      campaign,
      retroUpdatedCount: retro.data?.updated ?? 0,
      created,
    },
  };
}

/**
 * Apply campaign ke semua sale (yang belum kena campaign apa pun, dan
 * belum di-void) dalam range tanggal campaign tersebut. Update:
 *   - pos_sales.total           → final post-diskon
 *   - pos_sales.gross_total     → harga asli (sum item subtotals)
 *   - pos_sales.discount_amount → selisih
 *   - pos_sales.discount_campaign_id
 *   - cashflow_transactions.credit  → final post-diskon
 *   - cashflow_transactions.description  → suffix " (diskon retro N%)"
 *
 * Tidak menyentuh running_balance karena di app derived on-the-fly
 * via computeLatestBalance(credit − debit).
 */
export async function applyDiscountRetro(
  campaignId: string
): Promise<ActionResult<{ updated: number }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();

  const { data: campRaw } = await supabase
    .from("pos_discount_campaigns" as never)
    .select("*")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campRaw)
    return { ok: false, error: "Campaign tidak ditemukan" };
  const campaign = mapCampaign(campRaw as unknown as CampaignRow);
  const camp: DiscountCampaignLite = {
    percentOff: campaign.percentOff,
    roundingUnit: campaign.roundingUnit,
    roundingMode: campaign.roundingMode,
  };

  // Sales yang masih "polos" dalam range — yang sudah punya
  // discount_campaign_id (manual ataupun retro sebelumnya) di-skip.
  const { data: salesRaw } = await supabase
    .from("pos_sales")
    .select(
      "id, total, gross_total, cashflow_transaction_id, voided_at, sale_date, discount_campaign_id"
    )
    .eq("bank_account_id", campaign.bankAccountId)
    .gte("sale_date", campaign.startDate)
    .lte("sale_date", campaign.endDate)
    .is("voided_at", null)
    .is("discount_campaign_id", null);
  type SaleRow = {
    id: string;
    total: number | string;
    gross_total: number | string | null;
    cashflow_transaction_id: string | null;
    voided_at: string | null;
    sale_date: string;
    discount_campaign_id: string | null;
  };
  const sales = (salesRaw ?? []) as unknown as SaleRow[];
  if (sales.length === 0) return { ok: true, data: { updated: 0 } };

  // Tarik subtotal items untuk verifikasi gross.
  const saleIds = sales.map((s) => s.id);
  const { data: itemsRaw } = await supabase
    .from("pos_sale_items")
    .select("sale_id, subtotal")
    .in("sale_id", saleIds);
  type ItemRow = { sale_id: string; subtotal: number | string };
  const items = (itemsRaw ?? []) as unknown as ItemRow[];
  const grossBySale = new Map<string, number>();
  for (const i of items) {
    grossBySale.set(
      i.sale_id,
      (grossBySale.get(i.sale_id) ?? 0) + Number(i.subtotal)
    );
  }

  let updated = 0;
  for (const s of sales) {
    const gross = grossBySale.get(s.id) ?? Number(s.total); // fallback ke total tersimpan
    const { finalTotal, discountAmount } = applyDiscount(gross, camp);
    if (discountAmount === 0) {
      // Sale di bawah unit pembulatan → stamp campaign_id saja (sebagai
      // bukti bahwa sale ini sudah diperiksa), total tidak berubah.
      await supabase
        .from("pos_sales")
        .update({
          gross_total: gross,
          discount_campaign_id: campaign.id,
        } as never)
        .eq("id", s.id);
      updated += 1;
      continue;
    }
    const { error: upErr } = await supabase
      .from("pos_sales")
      .update({
        total: finalTotal,
        gross_total: gross,
        discount_amount: discountAmount,
        discount_campaign_id: campaign.id,
      } as never)
      .eq("id", s.id);
    if (upErr) continue;
    // Update terhubung ke cashflow_transactions
    if (s.cashflow_transaction_id) {
      // Ambil description lama, suffix " (diskon retro N%)".
      const { data: txRaw } = await supabase
        .from("cashflow_transactions")
        .select("description")
        .eq("id", s.cashflow_transaction_id)
        .maybeSingle();
      const oldDesc = (txRaw as { description: string } | null)?.description ?? "";
      const suffix = ` (diskon retro ${Math.round(campaign.percentOff)}%)`;
      const newDesc = oldDesc.includes(suffix) ? oldDesc : oldDesc + suffix;
      await supabase
        .from("cashflow_transactions")
        .update({
          credit: finalTotal,
          description: newDesc,
        })
        .eq("id", s.cashflow_transaction_id);
    }
    updated += 1;
  }

  revalidatePath("/pos", "layout");
  revalidatePath("/pos/riwayat", "layout");
  revalidatePath("/admin/finance", "layout");
  return { ok: true, data: { updated } };
}
