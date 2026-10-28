"use server";

/**
 * Saldo Shopee pengadaan: tambah saldo saat menerima transferan dari owner (tanpa bukti transfer).
 * Saldo dihitung dari riwayat, lihat `shopeeBalance`.
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "./_supabase-admin";
import { requireProcurementForBu, type ActionResult } from "./_gates";
import { shopeeBalance } from "@/lib/procurement/shopee-wallet";
import { jakartaDateString, jakartaHHMM } from "@/lib/utils/jakarta";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ShopeeTopupView {
  id: string;
  amount: number;
  date: string;
  time: string | null;
  note: string | null;
  createdByName: string | null;
  canDelete: boolean;
}

export interface ShopeeWallet {
  businessUnit: string;
  balance: number;
  topups: ShopeeTopupView[];
}

const MAX_TOPUP = 100_000_000;

function revalidateAll() {
  revalidatePath("/pengadaan", "layout");
  revalidatePath("/admin/costing", "layout");
}

export async function getShopeeWallet(businessUnit: string): Promise<ActionResult<ShopeeWallet>> {
  const gate = await requireProcurementForBu(businessUnit);
  if (!gate.ok) return { ok: false, error: gate.error };
  const admin = createAdminClient() as any;
  const [balance, { data }] = await Promise.all([
    shopeeBalance(admin, businessUnit),
    admin
      .from("procurement_shopee_topups")
      .select("id, amount, topup_date, topup_time, note, created_by, created_at")
      .eq("business_unit", businessUnit)
      .order("topup_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(5),
  ]);
  const rows = (data ?? []) as Record<string, any>[];
  const names = new Map<string, string>();
  const ids = [...new Set(rows.map((r) => r.created_by as string | null).filter((v): v is string => !!v))];
  if (ids.length) {
    const { data: ps } = await admin.from("profiles").select("id, full_name, nickname").in("id", ids);
    for (const p of ps ?? []) names.set(p.id, p.nickname || p.full_name || "—");
  }
  const today = jakartaDateString(new Date());
  return {
    ok: true,
    data: {
      businessUnit,
      balance,
      topups: rows.map((r) => ({
        id: r.id,
        amount: Number(r.amount),
        date: r.topup_date,
        time: r.topup_time ?? null,
        note: r.note ?? null,
        createdByName: r.created_by ? names.get(r.created_by) ?? null : null,
        canDelete: gate.isAdmin || (r.created_by === gate.userId && jakartaDateString(new Date(r.created_at)) === today),
      })),
    },
  };
}

export async function addShopeeTopup(input: {
  businessUnit: string;
  amount: number;
  note?: string | null;
}): Promise<ActionResult<{ balance: number }>> {
  const gate = await requireProcurementForBu(input.businessUnit);
  if (!gate.ok) return { ok: false, error: gate.error };
  const amount = Math.round(Number(input.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Nominal harus lebih dari 0" };
  if (amount > MAX_TOPUP) return { ok: false, error: "Nominal terlalu besar — periksa lagi" };
  const note = input.note?.trim().slice(0, 120) || null;

  const admin = createAdminClient() as any;
  const now = new Date();
  const { error } = await admin.from("procurement_shopee_topups").insert({
    business_unit: input.businessUnit,
    amount,
    topup_date: jakartaDateString(now),
    topup_time: jakartaHHMM(now),
    note,
    created_by: gate.userId,
  });
  if (error) return { ok: false, error: error.message };
  revalidateAll();
  return { ok: true, data: { balance: await shopeeBalance(admin, input.businessUnit) } };
}

/** Hapus tambah saldo yang salah ketik: admin kapan saja, pencatatnya sendiri hanya di hari yang sama. */
export async function deleteShopeeTopup(id: string): Promise<ActionResult> {
  const admin = createAdminClient() as any;
  const { data: row } = await admin
    .from("procurement_shopee_topups")
    .select("id, business_unit, created_by, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!row) return { ok: false, error: "Catatan tidak ditemukan" };
  const gate = await requireProcurementForBu(row.business_unit);
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!gate.isAdmin) {
    if (row.created_by !== gate.userId) return { ok: false, error: "Hanya pencatatnya yang bisa menghapus" };
    if (jakartaDateString(new Date(row.created_at)) !== jakartaDateString(new Date()))
      return { ok: false, error: "Hanya bisa dihapus di hari yang sama — minta owner untuk koreksi" };
  }
  const { error } = await admin.from("procurement_shopee_topups").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidateAll();
  return { ok: true };
}
