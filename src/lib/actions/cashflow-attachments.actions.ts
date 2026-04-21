"use server";

import { revalidatePath } from "next/cache";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { requireAdminOrAssignee, type ActionResult } from "./_gates";

/**
 * Lampiran bukti transaksi untuk rekening cash (saat ini hanya Cash
 * Haengbocake Pare). Opsional — kasir / admin boleh snap bon / struk
 * dan tempel ke row cashflow untuk audit. Tidak wajib.
 *
 * Storage: bucket `cashflow-receipts`, path
 * `<bankAccountId>/<txId>-<ts>.<ext>`. Akses storage ke bucket itu
 * admin-only; assignee non-admin tidak pernah menyentuh storage
 * langsung — semua baca/tulis jalan lewat action ini yang pakai
 * service-role client setelah `requireAdminOrAssignee` lulus.
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

async function loadTxWithBank(
  txId: string
): Promise<
  | { ok: true; bankAccountId: string; attachmentPath: string | null }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cashflow_transactions")
    .select(
      "id, attachment_path, cashflow_statements!inner(bank_account_id)"
    )
    .eq("id", txId)
    .maybeSingle();
  if (!data) return { ok: false, error: "Transaksi tidak ditemukan" };
  // Supabase types may expose the inner statement either as an object
  // or as a one-element array depending on the relationship shape;
  // handle both without a wider cast.
  const stmt = data.cashflow_statements as unknown as
    | { bank_account_id: string }
    | Array<{ bank_account_id: string }>;
  const bankAccountId = Array.isArray(stmt) ? stmt[0]?.bank_account_id : stmt?.bank_account_id;
  if (!bankAccountId) return { ok: false, error: "Statement tidak lengkap" };
  return { ok: true, bankAccountId, attachmentPath: data.attachment_path };
}

export async function uploadCashflowAttachment(
  formData: FormData
): Promise<ActionResult<{ path: string }>> {
  const txId = formData.get("transactionId");
  const file = formData.get("file");
  if (typeof txId !== "string" || !txId)
    return { ok: false, error: "transactionId wajib" };
  if (!(file instanceof File))
    return { ok: false, error: "File wajib" };
  if (!ALLOWED_TYPES.includes(file.type))
    return { ok: false, error: "Hanya JPG / PNG / WEBP / PDF" };
  if (file.size > MAX_SIZE)
    return { ok: false, error: "File maksimal 5MB" };

  const tx = await loadTxWithBank(txId);
  if (!tx.ok) return tx;
  const gate = await requireAdminOrAssignee(tx.bankAccountId);
  if (!gate.ok) return { ok: false, error: gate.error };

  const admin = adminClient();
  // Hapus lampiran lama kalau ada — ganti, bukan tambah.
  if (tx.attachmentPath) {
    await admin.storage.from(BUCKET).remove([tx.attachmentPath]);
  }
  const ext = (file.name.split(".").pop() ?? "bin")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const path = `${tx.bankAccountId}/${txId}-${Date.now()}.${ext || "bin"}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: true });
  if (upErr) return { ok: false, error: upErr.message };

  const { error: dbErr } = await admin
    .from("cashflow_transactions")
    .update({ attachment_path: path })
    .eq("id", txId);
  if (dbErr) {
    // Rollback file jika kolom gagal di-update supaya tidak ada
    // orphan di bucket.
    await admin.storage.from(BUCKET).remove([path]);
    return { ok: false, error: dbErr.message };
  }

  revalidatePath("/admin/finance", "layout");
  return { ok: true, data: { path } };
}

export async function removeCashflowAttachment(
  transactionId: string
): Promise<ActionResult> {
  const tx = await loadTxWithBank(transactionId);
  if (!tx.ok) return tx;
  const gate = await requireAdminOrAssignee(tx.bankAccountId);
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!tx.attachmentPath) return { ok: true };

  const admin = adminClient();
  await admin.storage.from(BUCKET).remove([tx.attachmentPath]);
  const { error } = await admin
    .from("cashflow_transactions")
    .update({ attachment_path: null })
    .eq("id", transactionId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/finance", "layout");
  return { ok: true };
}

/**
 * Issue signed URL berjangka pendek. Non-admin user tidak punya akses
 * baca langsung ke bucket; mereka butuh URL yang sudah di-sign oleh
 * action ini setelah gate lolos.
 */
export async function getCashflowAttachmentUrl(
  transactionId: string
): Promise<ActionResult<{ url: string }>> {
  const tx = await loadTxWithBank(transactionId);
  if (!tx.ok) return tx;
  const gate = await requireAdminOrAssignee(tx.bankAccountId);
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!tx.attachmentPath)
    return { ok: false, error: "Transaksi ini belum ada lampiran" };

  const admin = adminClient();
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(tx.attachmentPath, 300); // 5 menit cukup untuk buka / download.
  if (error || !data) return { ok: false, error: error?.message ?? "Gagal membuat URL" };
  return { ok: true, data: { url: data.signedUrl } };
}
