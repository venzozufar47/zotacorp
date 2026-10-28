/**
 * Saldo Shopee pengadaan per cabang: saldo awal + Σ tambah saldo − Σ nota ber-sumber 'shopee'.
 * Modul biasa (bukan "use server") supaya dipakai server action dengan klien service-role mereka sendiri.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Jumlahkan satu kolom lintas halaman (PostgREST membatasi 1000 baris per permintaan, `.limit()` tak menembusnya). */
async function sumColumn(admin: any, table: string, column: string, filters: Record<string, string>): Promise<number> {
  const PAGE = 1000;
  let total = 0;
  for (let offset = 0; ; offset += PAGE) {
    let q = admin.from(table).select(column);
    for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
    const { data, error } = await q.order("id", { ascending: true }).range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Record<string, unknown>[];
    for (const r of rows) total += Number(r[column]) || 0;
    if (rows.length < PAGE) break;
  }
  return total;
}

export async function shopeeBalance(admin: any, businessUnit: string): Promise<number> {
  const [{ data: wallet }, topups, spent] = await Promise.all([
    admin.from("procurement_shopee_wallets").select("opening_balance").eq("business_unit", businessUnit).maybeSingle(),
    sumColumn(admin, "procurement_shopee_topups", "amount", { business_unit: businessUnit }),
    sumColumn(admin, "procurement_purchases", "total", { business_unit: businessUnit, money_source: "shopee" }),
  ]);
  return Math.round((Number(wallet?.opening_balance ?? 0) + topups - spent) * 100) / 100;
}
