"use server";

import { createAdminClient } from "./_supabase-admin";
import { requireAdminOrPosAssignee } from "./_gates";

/**
 * Ready cake cabang ini untuk pemilih di tombol "Ready Cake" POS. Dua kelompok:
 *  - siap dijual: produksi selesai (baker + cake artist), tercatat masuk stok, belum terjual / dibuang;
 *  - masih dikerjakan: tampil abu-abu supaya kasir tahu ada kue yang akan siap, tetapi belum bisa dipilih.
 * Jumlah resmi di stok tetap dari SKU "Ready Cake" (sudah ikut opname); daftar ini memberi nama, harga, dan tahap.
 */

export type ReadyCakeStage = "ready" | "queued" | "baking" | "decorating";

export interface ReadyCakeItem {
  id: string;
  name: string;
  priceIdr: number;
  isDiy: boolean;
  stage: ReadyCakeStage;
  /** ISO waktu produksi selesai; null selama masih dikerjakan. */
  readyAt: string | null;
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
    .select("id, customer_name, total_idr, is_diy, status, production_status, production_done_at, created_at")
    .eq("branch", branch)
    .eq("is_ready_stock", true)
    .not("status", "in", "(cancelled,discarded,done)")
    .is("picked_up_at", null)
    .is("sold_pos_sale_id", null)
    .is("archived_at", null)
    .order("created_at", { ascending: true });
  const rows = (orders ?? []) as unknown as {
    id: string;
    customer_name: string;
    total_idr: number;
    is_diy: boolean;
    status: string;
    production_status: string;
    production_done_at: string | null;
    created_at: string;
  }[];
  if (rows.length === 0) return [];

  const finished = rows.filter((r) => r.status === "ready" && r.production_status === "done");
  const { data: produced } =
    finished.length > 0
      ? await db
          .from("pos_stock_movements")
          .select("cake_order_id")
          .eq("bank_account_id", bankAccountId)
          .eq("type", "production")
          .in("cake_order_id", finished.map((r) => r.id))
      : { data: [] as { cake_order_id: string | null }[] };
  const inStock = new Set((produced ?? []).map((r) => r.cake_order_id));

  const items: ReadyCakeItem[] = [];
  for (const r of rows) {
    const base = { id: r.id, name: r.customer_name, priceIdr: r.total_idr, isDiy: r.is_diy };
    if (r.status === "ready" && r.production_status === "done") {
      // Kue tanpa catatan masuk stok tidak boleh dijual (stok tidak akan cocok).
      if (!inStock.has(r.id)) continue;
      items.push({ ...base, stage: "ready", readyAt: r.production_done_at ?? r.created_at });
    } else if (r.production_status === "decorating") {
      items.push({ ...base, stage: "decorating", readyAt: null });
    } else if (r.production_status === "in_progress") {
      items.push({ ...base, stage: "baking", readyAt: null });
    } else if (r.production_status === "pending") {
      items.push({ ...base, stage: "queued", readyAt: null });
    }
  }
  // Siap dijual didahulukan, tertua dulu (FIFO); sisanya menyusul.
  const rank: Record<ReadyCakeStage, number> = { ready: 0, decorating: 1, baking: 2, queued: 3 };
  return items.sort((a, b) => rank[a.stage] - rank[b.stage]);
}
