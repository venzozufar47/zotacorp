/**
 * Inti penulisan satu leg pembayaran cake.
 *
 * ==> MODUL INI SENGAJA BUKAN "use server". <==
 *
 * Alasannya bukan gaya, melainkan keamanan. `cake-orders.actions.ts`
 * adalah `"use server"`, sehingga SETIAP export di sana menjadi
 * endpoint yang bisa dipanggil langsung dari browser. Helper tanpa
 * gerbang otorisasi tidak boleh tinggal di file seperti itu — ia akan
 * menjadi jalan pintas menulis pembayaran tanpa pemeriksaan apa pun.
 *
 * Fungsi di sini TIDAK memeriksa otorisasi. Setiap pemanggil wajib
 * sudah lolos gerbangnya sendiri lebih dulu:
 *   - `addCakeOrderPayment`   → requireCakeOrderAccess()   (staf cake)
 *   - `markCakePickedUpAtPos` → requireAdminOrPosAssignee() (kasir cabang,
 *                                akunnya diturunkan dari cabang order)
 *
 * Dipisah karena kasir POS TIDAK punya `cake_access_assignments`, jadi
 * ia pasti gagal di `requireCakeOrderAccess` — memanggil
 * `addCakeOrderPayment` dari POS mustahil, sementara logika insert-nya
 * (cap refund, auto-nomor label, rollback lampiran) tidak boleh
 * diketik ulang di tempat kedua.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { AddCakePaymentInput } from "./types";

export type CakePaymentWriteResult =
  | { ok: true; paymentId: string }
  | { ok: false; error: string };

export async function insertCakePaymentLeg(
  db: SupabaseClient<Database>,
  input: AddCakePaymentInput,
  actorUserId: string
): Promise<CakePaymentWriteResult> {
  const amount = Math.max(0, Math.round(input.amountIdr));
  if (amount <= 0) return { ok: false, error: "Nominal harus > 0" };

  const { data: rowRaw } = await db
    .from("cake_orders" as never)
    .select("id, total_idr, refund_idr")
    .eq("id", input.orderId)
    .maybeSingle();
  if (!rowRaw) return { ok: false, error: "Order tidak ditemukan" };
  const order = rowRaw as unknown as {
    id: string;
    total_idr: number;
    refund_idr: number;
  };

  const { data: optRaw } = await db
    .from("cake_options" as never)
    .select("id, kind")
    .eq("id", input.paymentOptionId)
    .maybeSingle();
  const opt = optRaw as unknown as { id: string; kind: string } | null;
  if (!opt || opt.kind !== "payment_method")
    return { ok: false, error: "Metode pembayaran tidak valid" };

  // Batasi refund supaya trigger tidak perlu bertahan dari over-refund.
  if (input.kind === "refund") {
    const { data: existingRaw } = await db
      .from("cake_order_payments" as never)
      .select("kind, amount_idr")
      .eq("cake_order_id", order.id);
    type R = { kind: string; amount_idr: number };
    const existing = (existingRaw ?? []) as unknown as R[];
    const paid = existing
      .filter((r) => r.kind !== "refund")
      .reduce((s, r) => s + r.amount_idr, 0);
    const refunded = existing
      .filter((r) => r.kind === "refund")
      .reduce((s, r) => s + r.amount_idr, 0);
    const refundable = paid - refunded;
    if (amount > refundable)
      return {
        ok: false,
        error: `Refund maksimum Rp ${refundable.toLocaleString("id-ID")}`,
      };
  }

  // Auto-nomor label DP kalau tidak diisi.
  let label = input.label?.trim() ?? "";
  if (!label) {
    if (input.kind === "dp") {
      const { count } = await db
        .from("cake_order_payments" as never)
        .select("id", { count: "exact", head: true })
        .eq("cake_order_id", order.id)
        .eq("kind", "dp");
      label = `DP ${(count ?? 0) + 1}`;
    } else if (input.kind === "pelunasan") {
      label = "Pelunasan";
    } else {
      label = "Refund";
    }
  }

  // Lampiran bukti ditulis lebih dulu supaya id-nya bisa ditautkan.
  let attachmentId: string | null = null;
  if (input.proofPath) {
    const { data: att, error: attErr } = await db
      .from("cake_order_attachments" as never)
      .insert({
        cake_order_id: order.id,
        field: "payment_proof",
        storage_path: input.proofPath,
        mime_type: input.proofMimeType ?? null,
        size_bytes: input.proofSizeBytes ?? null,
        uploaded_by: actorUserId,
      } as never)
      .select("id")
      .single();
    if (attErr || !att)
      return { ok: false, error: attErr?.message ?? "Gagal simpan bukti" };
    attachmentId = (att as unknown as { id: string }).id;
  }

  const { data: payRow, error: payErr } = await db
    .from("cake_order_payments" as never)
    .insert({
      cake_order_id: order.id,
      kind: input.kind,
      label,
      amount_idr: amount,
      payment_option_id: input.paymentOptionId,
      notes: input.notes?.trim() || null,
      attachment_id: attachmentId,
      created_by: actorUserId,
    } as never)
    .select("id")
    .single();
  if (payErr || !payRow) {
    // Rollback lampiran kalau leg-nya gagal — kalau tidak, bukti
    // yatim menumpuk di storage tanpa pembayaran yang menautnya.
    if (attachmentId) {
      await db
        .from("cake_order_attachments" as never)
        .delete()
        .eq("id", attachmentId);
    }
    return { ok: false, error: payErr?.message ?? "Gagal simpan pembayaran" };
  }

  return { ok: true, paymentId: (payRow as unknown as { id: string }).id };
}
