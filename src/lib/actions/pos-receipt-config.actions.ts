"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient as adminClient } from "./_supabase-admin";
import { requireAdminOrPosAssignee, type ActionResult } from "./_gates";
import {
  normalizeReceiptContent,
  type ReceiptContent,
} from "@/lib/pos/receipt-settings";

/**
 * Konten struk POS BERSAMA (header/alamat/footer/cabang/label), disimpan
 * di `bank_accounts.pos_receipt_config` per rekening supaya SAMA di semua
 * perangkat kasir. Metode cetak & auto-cetak tetap device-local (lihat
 * receipt-settings.ts).
 */

/**
 * Ambil konten struk untuk sebuah rekening POS, sudah dinormalisasi ke
 * bentuk lengkap (default turunan nama rekening bila belum diset).
 * Read-only — RLS bank_accounts sudah membatasi visibilitas.
 */
export async function getPosReceiptConfig(
  bankAccountId: string
): Promise<ReceiptContent | null> {
  if (!bankAccountId) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("bank_accounts")
    .select("*")
    .eq("id", bankAccountId)
    .maybeSingle();
  if (!data) return null;
  const row = data as { account_name?: string; pos_receipt_config?: unknown };
  return normalizeReceiptContent(row.pos_receipt_config, row.account_name ?? "");
}

/**
 * Simpan konten struk bersama untuk rekening. Gate admin/assignee POS;
 * update lewat service role supaya assignee (yang tak punya UPDATE
 * langsung ke bank_accounts) tetap bisa mengatur setelan struknya.
 */
export async function savePosReceiptConfig(
  bankAccountId: string,
  content: ReceiptContent
): Promise<ActionResult<null>> {
  if (!bankAccountId) return { ok: false, error: "bankAccountId wajib" };
  const gate = await requireAdminOrPosAssignee(bankAccountId);
  if (!gate.ok) return { ok: false, error: gate.error };

  // Normalisasi ulang supaya struktur tersimpan konsisten (buang field asing).
  const clean = normalizeReceiptContent(content, content.header);

  const admin = adminClient();
  const { error } = await admin
    .from("bank_accounts")
    .update({ pos_receipt_config: clean } as never)
    .eq("id", bankAccountId);
  if (error) return { ok: false, error: error.message };

  try {
    revalidatePath("/pos", "layout");
    revalidatePath("/pos/riwayat", "layout");
  } catch {
    // abaikan kegagalan revalidate
  }
  return { ok: true, data: null };
}
