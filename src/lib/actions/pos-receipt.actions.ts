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
  try {
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
      .select(
        "id, bank_account_id, payment_method, cashflow_transaction_id, sale_date, total"
      )
      .eq("id", saleId)
      .maybeSingle();
    if (!sale) return { ok: false, error: "Sale tidak ditemukan" };
    if (sale.payment_method !== "qris")
      return { ok: false, error: "Sale ini bukan QRIS" };

    const gate = await requireAdminOrPosAssignee(sale.bank_account_id);
    if (!gate.ok) return { ok: false, error: gate.error };

    const admin = adminClient();

    // Auto-relink orphan sale: kasir pos_only sebelum fix RLS tidak
    // bisa UPDATE pos_sales.cashflow_transaction_id saat createPosSale,
    // jadi banyak sale lama kehilangan FK-nya. Cari tx cashflow yang
    // match by (bank_account_id via statement, tanggal, total credit),
    // lalu relink via service role.
    let cashflowTxId = sale.cashflow_transaction_id;
    if (!cashflowTxId) {
      const { data: candidates } = await admin
        .from("cashflow_transactions")
        .select("id, statement_id, cashflow_statements!inner(bank_account_id)")
        .eq("transaction_date", sale.sale_date)
        .eq("credit", sale.total)
        .eq("cashflow_statements.bank_account_id", sale.bank_account_id);
      // Buang tx yang sudah ter-link ke sale lain.
      const candidateIds = (candidates ?? []).map((c) => c.id);
      let free = candidateIds;
      if (candidateIds.length > 0) {
        const { data: linked } = await admin
          .from("pos_sales")
          .select("cashflow_transaction_id")
          .in("cashflow_transaction_id", candidateIds);
        const taken = new Set(
          (linked ?? [])
            .map((l) => l.cashflow_transaction_id)
            .filter((x): x is string => !!x)
        );
        free = candidateIds.filter((id) => !taken.has(id));
      }
      if (free.length === 1) {
        cashflowTxId = free[0];
        await admin
          .from("pos_sales")
          .update({ cashflow_transaction_id: cashflowTxId })
          .eq("id", sale.id);
      } else {
        return {
          ok: false,
          error:
            free.length > 1
              ? "Transaksi cashflow ambigu, hubungi admin untuk link manual"
              : "Sale belum punya transaksi cashflow",
        };
      }
    }
    const ext = (file.name.split(".").pop() ?? "bin")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    const path = `${sale.bank_account_id}/${cashflowTxId}-${Date.now()}.${ext || "bin"}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: file.type, upsert: true });
    if (upErr) return { ok: false, error: upErr.message };

    const { error: dbErr } = await admin
      .from("cashflow_transactions")
      .update({ attachment_path: path })
      .eq("id", cashflowTxId);
    if (dbErr) {
      await admin.storage.from(BUCKET).remove([path]);
      return { ok: false, error: dbErr.message };
    }

    // Jangan biarkan kegagalan revalidate (misal path belum di-build)
    // menggagalkan upload yang sebenarnya sudah sukses. Catat saja.
    try {
      revalidatePath("/pos", "layout");
      revalidatePath("/admin/finance", "layout");
    } catch (e) {
      console.error("[attachPosQrisReceipt] revalidate failed", e);
    }
    return { ok: true, data: { path } };
  } catch (e) {
    console.error("[attachPosQrisReceipt] unhandled", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Gagal upload bukti",
    };
  }
}

/**
 * Ambil signed URL untuk bukti QRIS sebuah sale (1 jam berlaku) —
 * supaya kasir bisa preview foto yang sudah diupload sebelumnya dari
 * /pos/riwayat tanpa harus buka admin finance. Return null kalau sale
 * bukan QRIS / belum punya cashflow tx / attachment_path kosong.
 */
export async function getPosQrisReceiptUrl(
  saleId: string
): Promise<ActionResult<{ url: string | null; path: string | null }>> {
  if (!saleId) return { ok: false, error: "saleId wajib" };

  const supabase = await createClient();
  const { data: sale } = await supabase
    .from("pos_sales")
    .select("id, bank_account_id, payment_method, cashflow_transaction_id")
    .eq("id", saleId)
    .maybeSingle();
  if (!sale) return { ok: false, error: "Sale tidak ditemukan" };
  if (sale.payment_method !== "qris")
    return { ok: false, error: "Sale ini bukan QRIS" };

  const gate = await requireAdminOrPosAssignee(sale.bank_account_id);
  if (!gate.ok) return { ok: false, error: gate.error };

  if (!sale.cashflow_transaction_id)
    return { ok: true, data: { url: null, path: null } };

  const admin = adminClient();
  const { data: tx } = await admin
    .from("cashflow_transactions")
    .select("attachment_path")
    .eq("id", sale.cashflow_transaction_id)
    .maybeSingle();
  if (!tx?.attachment_path)
    return { ok: true, data: { url: null, path: null } };

  const { data: signed, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(tx.attachment_path, 60 * 60);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { url: signed.signedUrl, path: tx.attachment_path } };
}
