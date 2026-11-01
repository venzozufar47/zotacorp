"use server";

import { createAdminClient } from "./_supabase-admin";
import { requireAdminOrPosAssignee } from "./_gates";

/**
 * Daftar ready cake yang sedang ada di toko, untuk panel di halaman utama POS. Jumlah resmi datang dari stok (SKU
 * "Ready Cake", sudah ikut opname); daftar ini hanya memberi nama, harga, dan umur tiap kue. Hanya kue yang tercatat
 * masuk stok (produksi selesai) dan belum diserahkan / dibuang.
 */

export interface ReadyCakeItem {
  id: string;
  name: string;
  priceIdr: number;
  isDiy: boolean;
  /** ISO waktu produksi selesai (jam kue siap). */
  readyAt: string;
}

export async function listReadyCakeItems(bankAccountId: string): Promise<ReadyCakeItem[]> {
  const gate = await requireAdminOrPosAssignee(bankAccountId);
  if (!gate.ok) return [];
  const db = createAdminClient();

  const { data: acc } = await db
    .from("bank_accounts")
    .select("default_branch")
    .eq("id", bankAccountId)
    .maybeSingle();
  const branch = (acc?.default_branch ?? "").trim().toLowerCase();
  if (branch !== "pare" && branch !== "semarang") return [];

  const { data: orders } = await db
    .from("cake_orders" as never)
    .select("id, customer_name, total_idr, is_diy, production_done_at, created_at")
    .eq("branch", branch)
    .eq("is_ready_stock", true)
    .eq("status", "ready")
    .is("picked_up_at", null)
    .is("archived_at", null)
    .order("production_done_at", { ascending: true });
  const rows = (orders ?? []) as unknown as {
    id: string;
    customer_name: string;
    total_idr: number;
    is_diy: boolean;
    production_done_at: string | null;
    created_at: string;
  }[];
  if (rows.length === 0) return [];

  const { data: produced } = await db
    .from("pos_stock_movements")
    .select("cake_order_id")
    .eq("bank_account_id", bankAccountId)
    .eq("type", "production")
    .in("cake_order_id", rows.map((r) => r.id));
  const inStock = new Set((produced ?? []).map((r) => r.cake_order_id));

  return rows
    .filter((r) => inStock.has(r.id))
    .map((r) => ({
      id: r.id,
      name: r.customer_name,
      priceIdr: r.total_idr,
      isDiy: r.is_diy,
      readyAt: r.production_done_at ?? r.created_at,
    }));
}
