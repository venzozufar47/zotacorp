/**
 * Omzet Custom Cake sebuah cabang pada [from, to] (inklusif, tanggal WIB menurut `scheduled_at`): total − ongkir − refund,
 * tanpa order batal/dibuang/gratis. Aturan yang sama dengan petunjuk alokasi di laporan laba-rugi (`fetchPnL`).
 *
 * BUKAN "use server": modul biasa yang dipanggil server action (Scorecard Cabang, Kalkulator Bonus) dengan klien
 * service-role mereka sendiri, supaya tidak terekspos sebagai endpoint.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function sumCakeRevenue(admin: any, branch: "Pare" | "Semarang", from: string, to: string): Promise<number> {
  const startIso = `${from}T00:00:00+07:00`;
  const endIso = `${addDays(to, 1)}T00:00:00+07:00`;
  const PAGE = 1000;
  let total = 0;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin
      .from("cake_orders")
      .select("total_idr, delivery_fee_idr, refund_idr, status, free_claim")
      .ilike("branch", branch)
      .gte("scheduled_at", startIso)
      .lt("scheduled_at", endIso)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as {
      total_idr: number | null;
      delivery_fee_idr: number | null;
      refund_idr: number | null;
      status: string | null;
      free_claim: boolean | null;
    }[];
    for (const c of rows) {
      if (c.status === "cancelled" || c.status === "discarded" || c.free_claim) continue;
      total += (Number(c.total_idr) || 0) - (Number(c.delivery_fee_idr) || 0) - (Number(c.refund_idr) || 0);
    }
    if (rows.length < PAGE) break;
  }
  return total;
}

export interface CakeOrderRow {
  baseOptionId: string | null;
  diameterCm: number | null;
  /** total − ongkir − refund (rupiah). */
  net: number;
}

/** Pesanan Custom Cake per baris (aturan sama dengan `sumCakeRevenue`) — untuk menghitung HPP per kue dasar × diameter. */
export async function listCakeOrdersNet(admin: any, branch: "Pare" | "Semarang", from: string, to: string): Promise<CakeOrderRow[]> {
  const startIso = `${from}T00:00:00+07:00`;
  const endIso = `${addDays(to, 1)}T00:00:00+07:00`;
  const PAGE = 1000;
  const out: CakeOrderRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin
      .from("cake_orders")
      .select("base_cake_option_id, dimension_cm, total_idr, delivery_fee_idr, refund_idr, status, free_claim")
      .ilike("branch", branch)
      .gte("scheduled_at", startIso)
      .lt("scheduled_at", endIso)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as {
      base_cake_option_id: string | null;
      dimension_cm: number | null;
      total_idr: number | null;
      delivery_fee_idr: number | null;
      refund_idr: number | null;
      status: string | null;
      free_claim: boolean | null;
    }[];
    for (const c of rows) {
      if (c.status === "cancelled" || c.status === "discarded" || c.free_claim) continue;
      out.push({
        baseOptionId: c.base_cake_option_id,
        diameterCm: c.dimension_cm == null ? null : Number(c.dimension_cm),
        net: (Number(c.total_idr) || 0) - (Number(c.delivery_fee_idr) || 0) - (Number(c.refund_idr) || 0),
      });
    }
    if (rows.length < PAGE) break;
  }
  return out;
}
