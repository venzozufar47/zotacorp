"use server";

/**
 * Arsip baris alokasi di halaman PnL — untuk panel "Alokasi gaji per
 * karyawan (bulk)" dan "Alokasi revenue per cabang (bulanan)".
 *
 * Murni preferensi tampilan: menyembunyikan baris yang sudah selesai diisi
 * supaya yang belum beres gampang terlihat. TIDAK memengaruhi perhitungan
 * PnL sama sekali — alokasi yang diarsipkan tetap dipakai aggregator.
 * Karena itu datanya duduk di tabel terpisah (lihat migrasi 126), bukan
 * sebagai kolom di tabel transaksi/alokasi.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, type ActionResult } from "./_gates";

export type AllocationArchiveKind = "salary_tx" | "revenue_month";

/**
 * Kunci yang sudah diarsipkan untuk satu kind + BU.
 *
 * Dipakai halaman PnL untuk menandai baris mana yang disembunyikan.
 * Bukan admin → Set kosong, jadi tidak ada yang tersembunyi secara diam-diam
 * bagi peran lain.
 */
export async function listArchivedKeys(
  kind: AllocationArchiveKind,
  businessUnit: string
): Promise<Set<string>> {
  const gate = await requireAdmin();
  if (!gate.ok) return new Set();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("allocation_archives")
    .select("ref_key")
    .eq("kind", kind)
    .eq("business_unit", businessUnit);
  if (error) {
    // Jangan menelan diam-diam: gagal baca arsip berarti UI menampilkan
    // semua baris (aman), tapi penyebabnya harus terlihat di log.
    console.error("[listArchivedKeys]", { kind, businessUnit, message: error.message });
    return new Set();
  }
  return new Set((data ?? []).map((r) => r.ref_key));
}

/** Arsipkan / kembalikan satu baris. `archived=false` = munculkan lagi. */
export async function setAllocationArchived(input: {
  kind: AllocationArchiveKind;
  refKey: string;
  businessUnit: string;
  archived: boolean;
}): Promise<ActionResult<undefined>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!input.refKey?.trim()) return { ok: false, error: "refKey wajib" };
  if (!input.businessUnit?.trim())
    return { ok: false, error: "businessUnit wajib" };

  const supabase = await createClient();

  if (input.archived) {
    const { error } = await supabase.from("allocation_archives").upsert(
      {
        kind: input.kind,
        ref_key: input.refKey,
        business_unit: input.businessUnit,
        archived_by: gate.userId,
      },
      { onConflict: "kind,ref_key,business_unit" }
    );
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase
      .from("allocation_archives")
      .delete()
      .eq("kind", input.kind)
      .eq("ref_key", input.refKey)
      .eq("business_unit", input.businessUnit);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/admin/finance/pnl");
  return { ok: true, data: undefined };
}
