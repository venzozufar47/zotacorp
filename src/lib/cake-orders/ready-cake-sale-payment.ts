/**
 * Pembukuan ready cake yang dijual lewat keranjang POS.
 *
 * Aturan (keputusan owner): ready cake tetap OMSET CUSTOM CAKE, tetapi uang tunainya masuk kas cabang POS, dan tidak boleh
 * tercatat dua kali. Maka tiap kue di keranjang dibukukan sebagai pembayaran pesanan kuenya sendiri
 * (`cake_order_payments`, jenis pelunasan): itu yang membuat kanban kue berstatus lunas, dan itu pula sumber omset/bonus
 * admin kue. Penjualan POS-nya sendiri (`pos_sales.total`) hanya memuat item POS biasa.
 *   - tunai : + baris kas kategori non-operasional "Pelunasan Cake" (masuk laci, tidak masuk PnL operasional);
 *   - QRIS  : tanpa baris kas (uangnya tidak pernah menyentuh laci), sama seperti pelunasan kue di serah terima;
 *   - admin : uang masuk di luar POS (transfer), dicatat memakai metode non-tunai non-QRIS.
 *
 * Modul biasa (bukan "use server"): pemanggilnya server action yang sudah lolos gerbang kasirnya sendiri.
 * Semua-atau-tidak-sama-sekali: bila satu kue gagal, yang sudah tertulis di panggilan ini dibatalkan lagi.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { classifyPaymentMethod } from "@/lib/cake-orders/payment-method";
import { insertCakePaymentLeg } from "@/lib/cake-orders/payment-write";
import { deleteCakeCashSettlement, recordCakeCashSettlement } from "@/lib/cake-orders/pos-cake-cash";

type Db = SupabaseClient<Database>;

export type ReadyCakeSaleMethod = "cash" | "qris" | "admin";

export interface ReadyCakeSaleLine {
  orderId: string;
  customerName: string;
  amountIdr: number;
}

type Result = { ok: true } | { ok: false; error: string };

/** Id metode bayar `cake_options` untuk kanal ini. Null bila opsinya belum ada / nonaktif. */
async function resolvePaymentOptionId(db: Db, method: ReadyCakeSaleMethod): Promise<string | null> {
  const { data } = await db
    .from("cake_options" as never)
    .select("id, label")
    .eq("kind", "payment_method")
    .eq("is_active", true);
  const options = (data ?? []) as unknown as { id: string; label: string }[];
  const pick = options.find((o) => {
    const channel = classifyPaymentMethod(o.label);
    return method === "admin" ? channel === null : channel === method;
  });
  return pick?.id ?? null;
}

/** Baris ready cake pada penjualan POS (harga = harga satuan yang dikunci saat dijual), lengkap dengan nama pesanannya. */
export async function loadReadyCakeSaleLines(db: Db, saleId: string): Promise<ReadyCakeSaleLine[]> {
  const { data: items } = await db
    .from("pos_sale_items")
    .select("ready_cake_order_id, unit_price")
    .eq("sale_id", saleId)
    .not("ready_cake_order_id", "is", null);
  const rows = (items ?? []).filter((r) => r.ready_cake_order_id);
  if (rows.length === 0) return [];
  const { data: orders } = await db
    .from("cake_orders" as never)
    .select("id, customer_name")
    .in("id", rows.map((r) => r.ready_cake_order_id as string));
  const names = new Map(((orders ?? []) as unknown as { id: string; customer_name: string }[]).map((o) => [o.id, o.customer_name]));
  return rows.map((r) => ({
    orderId: r.ready_cake_order_id as string,
    customerName: names.get(r.ready_cake_order_id as string) ?? "Ready cake",
    amountIdr: Number(r.unit_price),
  }));
}

/**
 * Catat pembayaran semua kue di satu penjualan POS. Kue bernilai 0 (klaim gratis) dilewati: tidak ada uang yang masuk.
 * `userClient` dipakai menulis baris kas (sesi kasir, sama seperti jalur serah terima); `db` (service-role) menulis
 * pembayaran kue karena kasir POS tidak punya akses tulis ke tabel itu.
 */
export async function recordReadyCakeSalePayments(
  db: Db,
  userClient: Db,
  args: {
    saleId: string;
    method: ReadyCakeSaleMethod;
    bankAccountId: string;
    branchLabel: string;
    userId: string;
    lines: ReadyCakeSaleLine[];
  }
): Promise<Result> {
  const lines = args.lines.filter((l) => l.amountIdr > 0);
  if (lines.length === 0) return { ok: true };

  const optionId = await resolvePaymentOptionId(db, args.method);
  if (!optionId) {
    return {
      ok: false,
      error:
        args.method === "admin"
          ? 'Metode bayar non-tunai (mis. "Bank Jago") belum ada di opsi pembayaran kue'
          : `Metode bayar ${args.method === "cash" ? "Cash" : "QRIS"} belum ada di opsi pembayaran kue`,
    };
  }

  for (const line of lines) {
    const leg = await insertCakePaymentLeg(
      db,
      {
        orderId: line.orderId,
        kind: "pelunasan",
        amountIdr: line.amountIdr,
        paymentOptionId: optionId,
        label: `Pelunasan (Kasir ${args.branchLabel})`,
        notes: `Ready cake dijual lewat keranjang POS · ${args.saleId.slice(0, 8)}`,
      },
      args.userId
    );
    if (!leg.ok) {
      await reverseReadyCakeSalePayments(db, args.saleId);
      return { ok: false, error: `Gagal mencatat pembayaran "${line.customerName}": ${leg.error}` };
    }
    // Tautan ke penjualan ditulis terpisah: insertCakePaymentLeg dipakai bersama jalur lain yang tak mengenal kolom ini.
    const { error: linkErr } = await db
      .from("cake_order_payments" as never)
      .update({ pos_sale_id: args.saleId } as never)
      .eq("id", leg.paymentId);
    if (linkErr) {
      await db.from("cake_order_payments" as never).delete().eq("id", leg.paymentId);
      await reverseReadyCakeSalePayments(db, args.saleId);
      return { ok: false, error: `Gagal menautkan pembayaran "${line.customerName}": ${linkErr.message}` };
    }

    if (args.method === "cash") {
      const cash = await recordCakeCashSettlement(userClient, {
        bankAccountId: args.bankAccountId,
        branchLabel: args.branchLabel,
        amountIdr: line.amountIdr,
        customerName: line.customerName,
        orderId: line.orderId,
        paymentId: leg.paymentId,
        userId: args.userId,
        authorizerName: null,
        source: "Ready cake dijual lewat keranjang POS",
      });
      if (!cash.ok) {
        await reverseReadyCakeSalePayments(db, args.saleId);
        return { ok: false, error: `Gagal menulis kas cabang untuk "${line.customerName}": ${cash.error}` };
      }
    }
  }
  return { ok: true };
}

/**
 * Batalkan semua pembayaran kue milik penjualan POS ini (void / rollback): hapus baris kas tunainya lalu pembayarannya,
 * sehingga status lunas kanban dan omset kue ikut kembali. Aman dipanggil berulang. Baris kas dihapus LEBIH DULU supaya
 * kegagalan di tengah tidak meninggalkan uang tercatat di laci tanpa pembayaran yang menjelaskannya.
 */
export async function reverseReadyCakeSalePayments(db: Db, saleId: string): Promise<Result> {
  const { data, error } = await db
    .from("cake_order_payments" as never)
    .select("id, cake_order_id")
    .eq("pos_sale_id", saleId);
  if (error) return { ok: false, error: error.message };
  const legs = (data ?? []) as unknown as { id: string; cake_order_id: string }[];
  for (const leg of legs) {
    const cash = await deleteCakeCashSettlement(db, leg.cake_order_id, leg.id);
    if (!cash.ok) return { ok: false, error: `Baris kas kue gagal dihapus: ${cash.error}` };
    const { error: delErr } = await db.from("cake_order_payments" as never).delete().eq("id", leg.id);
    if (delErr) return { ok: false, error: `Pembayaran kue gagal dihapus: ${delErr.message}` };
  }
  return { ok: true };
}
