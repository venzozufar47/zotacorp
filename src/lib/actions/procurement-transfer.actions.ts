"use server";

/**
 * Pindah uang antar kantong pengadaan cabang: uang pengadaan, isi laci, dan dompet (Shopee/Seabank).
 * Tidak menulis buku kas — uang tetap milik cabang, hanya pindah kantong. Saldo kantong diturunkan dari riwayat
 * ini (lihat pocket-transfers.ts, procurement-wallet.actions.ts, shift-data.ts), jadi tidak ada angka yang bisa tak cocok.
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "./_supabase-admin";
import { requireProcurementForBu, type ActionResult } from "./_gates";
import { getCashPosition } from "./procurement-wallet.actions";
import { shopeeBalance } from "@/lib/procurement/shopee-wallet";
import { isPocket, type Pocket } from "@/lib/procurement/pocket-transfers";
import { jakartaDateString } from "@/lib/utils/jakarta";

/* eslint-disable @typescript-eslint/no-explicit-any */

const MAX_TRANSFER = 100_000_000;

export interface PocketTransferView {
  id: string;
  from: Pocket;
  to: Pocket;
  amount: number;
  note: string | null;
  createdAt: string;
  createdByName: string | null;
  canDelete: boolean;
}

function revalidateAll() {
  revalidatePath("/pengadaan", "layout");
  revalidatePath("/admin/costing", "layout");
  revalidatePath("/pos", "layout");
}

const POCKET_LABEL: Record<Pocket, string> = { pengadaan: "Pengadaan", laci: "Laci", dompet: "Dompet" };

export async function transferPocketMoney(input: {
  businessUnit: string;
  from: Pocket;
  to: Pocket;
  amount: number;
  note?: string | null;
}): Promise<ActionResult> {
  const gate = await requireProcurementForBu(input.businessUnit);
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!isPocket(input.from) || !isPocket(input.to)) return { ok: false, error: "Kantong tidak dikenal" };
  if (input.from === input.to) return { ok: false, error: "Kantong asal dan tujuan harus berbeda" };
  const amount = Math.round(Number(input.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Nominal harus lebih dari 0" };
  if (amount > MAX_TRANSFER) return { ok: false, error: "Nominal terlalu besar — periksa lagi" };

  const posRes = await getCashPosition(input.businessUnit);
  if (!posRes.ok) return { ok: false, error: posRes.error };
  const pos = posRes.data;
  if (!pos) return { ok: false, error: "Posisi kas tidak ditemukan" };
  const admin = createAdminClient() as any;

  // Saldo kantong asal harus cukup — uang yang tidak ada tidak bisa dipindah.
  let available: number | null;
  if (input.from === "pengadaan") available = pos.procurementBalance;
  else if (input.from === "laci") available = pos.drawer.balance;
  else available = await shopeeBalance(admin, input.businessUnit);
  if (available === null)
    return { ok: false, error: `Saldo ${POCKET_LABEL[input.from]} belum bisa dihitung (belum ada hitungan tutup shift)` };
  if (amount > available + 0.005)
    return { ok: false, error: `Saldo ${POCKET_LABEL[input.from]} tidak cukup (tersedia Rp ${Math.floor(Math.max(0, available)).toLocaleString("id-ID")})` };
  // Tujuan laci tanpa saldo yang diketahui membuat hitungan laci tak punya pembanding.
  if (input.to === "laci" && pos.drawer.balance === null)
    return { ok: false, error: "Isi laci belum diketahui (belum ada hitungan tutup shift)" };

  const { error } = await admin.from("procurement_pocket_transfers").insert({
    business_unit: input.businessUnit,
    bank_account_id: pos.accountId,
    from_pocket: input.from,
    to_pocket: input.to,
    amount,
    note: input.note?.trim().slice(0, 120) || null,
    created_by: gate.userId,
  });
  if (error) return { ok: false, error: error.message };
  revalidateAll();
  return { ok: true };
}

export async function listPocketTransfers(businessUnit: string, limit = 10): Promise<ActionResult<PocketTransferView[]>> {
  const gate = await requireProcurementForBu(businessUnit);
  if (!gate.ok) return { ok: false, error: gate.error };
  const admin = createAdminClient() as any;
  const { data, error } = await admin
    .from("procurement_pocket_transfers")
    .select("id, from_pocket, to_pocket, amount, note, created_by, created_at")
    .eq("business_unit", businessUnit)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return { ok: false, error: error.message };
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
    data: rows.map((r) => ({
      id: r.id,
      from: r.from_pocket,
      to: r.to_pocket,
      amount: Number(r.amount),
      note: r.note ?? null,
      createdAt: r.created_at,
      createdByName: r.created_by ? names.get(r.created_by) ?? null : null,
      canDelete: gate.isAdmin || (r.created_by === gate.userId && jakartaDateString(new Date(r.created_at)) === today),
    })),
  };
}

/** Batalkan pindah uang yang salah: admin kapan saja, pencatatnya sendiri hanya di hari yang sama. */
export async function deletePocketTransfer(id: string): Promise<ActionResult> {
  const admin = createAdminClient() as any;
  const { data: row } = await admin
    .from("procurement_pocket_transfers")
    .select("id, business_unit, created_by, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!row) return { ok: false, error: "Catatan tidak ditemukan" };
  const gate = await requireProcurementForBu(row.business_unit);
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!gate.isAdmin) {
    if (row.created_by !== gate.userId) return { ok: false, error: "Hanya pencatatnya yang bisa membatalkan" };
    if (jakartaDateString(new Date(row.created_at)) !== jakartaDateString(new Date()))
      return { ok: false, error: "Hanya bisa dibatalkan di hari yang sama — minta owner untuk koreksi" };
  }
  const { error } = await admin.from("procurement_pocket_transfers").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidateAll();
  return { ok: true };
}
