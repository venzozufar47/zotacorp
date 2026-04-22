"use server";

import { revalidatePath } from "next/cache";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { requireAdminOrPosAssignee, type ActionResult } from "./_gates";

/**
 * Upload bukti foto QRIS ke sale POS. Dipanggil client POSClient tepat
 * setelah `createPosSale` sukses untuk method=qris — wajib oleh
 * compliance (kasir harus snap nota QRIS dari customer sebagai bukti).
 *
 * Lampiran disimpan di bucket `cashflow-receipts` (reuse infrastruktur
 * yang sama dengan receipt cash). Kolom `attachment_path` di
 * cashflow_transactions → ditampilkan juga di admin finance.
 *
 * Gate pos-assignee supaya kasir pos_only lulus — mereka tidak punya
 * akses `full` ke cashflow tapi boleh attach ke sale mereka sendiri.
 */

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const BUCKET = "cashflow-receipts";

function adminClient() {
  return createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function attachPosQrisReceipt(
  formData: FormData
): Promise<ActionResult<{ path: string }>> {
  const saleId = formData.get("saleId");
  const file = formData.get("file");
  if (typeof saleId !== "string" || !saleId)
    return { ok: false, error: "saleId wajib" };
  if (!(file instanceof File)) return { ok: false, error: "File wajib" };
  if (!ALLOWED_TYPES.includes(file.type))
    return { ok: false, error: "Hanya JPG / PNG / WEBP / PDF" };
  if (file.size > MAX_SIZE)
    return { ok: false, error: "File maksimal 5MB" };

  const supabase = await createClient();
  const { data: sale } = await supabase
    .from("pos_sales")
    .select("id, bank_account_id, payment_method, cashflow_transaction_id")
    .eq("id", saleId)
    .maybeSingle();
  if (!sale) return { ok: false, error: "Sale tidak ditemukan" };
  if (sale.payment_method !== "qris")
    return { ok: false, error: "Sale ini bukan QRIS" };
  if (!sale.cashflow_transaction_id)
    return { ok: false, error: "Sale belum punya transaksi cashflow" };

  const gate = await requireAdminOrPosAssignee(sale.bank_account_id);
  if (!gate.ok) return { ok: false, error: gate.error };

  const admin = adminClient();
  const ext = (file.name.split(".").pop() ?? "bin")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const path = `${sale.bank_account_id}/${sale.cashflow_transaction_id}-${Date.now()}.${ext || "bin"}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: true });
  if (upErr) return { ok: false, error: upErr.message };

  const { error: dbErr } = await admin
    .from("cashflow_transactions")
    .update({ attachment_path: path })
    .eq("id", sale.cashflow_transaction_id);
  if (dbErr) {
    await admin.storage.from(BUCKET).remove([path]);
    return { ok: false, error: dbErr.message };
  }

  revalidatePath("/pos", "layout");
  revalidatePath("/admin/finance", "layout");
  return { ok: true, data: { path } };
}
