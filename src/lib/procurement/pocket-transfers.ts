/**
 * Pindah uang antar kantong pengadaan (pengadaan / laci / dompet Shopee-Seabank). Modul biasa (bukan "use server")
 * supaya dipakai server action dan hitungan saldo dengan klien service-role mereka sendiri.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export type Pocket = "pengadaan" | "laci" | "dompet";
export const POCKETS: readonly Pocket[] = ["pengadaan", "laci", "dompet"];

export function isPocket(v: unknown): v is Pocket {
  return typeof v === "string" && (POCKETS as readonly string[]).includes(v);
}

interface TransferRow {
  from_pocket: Pocket;
  to_pocket: Pocket;
  amount: number | string;
}

async function fetchTransfers(
  admin: any,
  filter: (q: any) => any
): Promise<TransferRow[]> {
  const PAGE = 1000;
  const out: TransferRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const q = filter(admin.from("procurement_pocket_transfers").select("from_pocket, to_pocket, amount"));
    const { data, error } = await q.order("id", { ascending: true }).range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as TransferRow[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

function netInto(rows: TransferRow[], pocket: Pocket): number {
  let net = 0;
  for (const r of rows) {
    const a = Number(r.amount) || 0;
    if (r.to_pocket === pocket) net += a;
    if (r.from_pocket === pocket) net -= a;
  }
  return Math.round(net * 100) / 100;
}

/** Pindah neto ke dompet Shopee/Seabank sepanjang waktu (masuk − keluar) untuk satu cabang. */
export async function walletTransferNet(admin: any, businessUnit: string): Promise<number> {
  return netInto(await fetchTransfers(admin, (q) => q.eq("business_unit", businessUnit)), "dompet");
}

/**
 * Pindah neto ke laci pada jendela (from, to] — dasar `created_at`, sama dengan gerakan buku kas laci.
 * `fromIso` null = dari awal.
 */
export async function drawerTransferNet(
  admin: any,
  bankAccountId: string,
  fromIso: string | null,
  toIso: string
): Promise<{ into: number; out: number }> {
  const rows = await fetchTransfers(admin, (q) => {
    let f = q.eq("bank_account_id", bankAccountId).lte("created_at", toIso);
    if (fromIso) f = f.gt("created_at", fromIso);
    return f;
  });
  let into = 0;
  let out = 0;
  for (const r of rows) {
    const a = Number(r.amount) || 0;
    if (r.to_pocket === "laci") into += a;
    if (r.from_pocket === "laci") out += a;
  }
  return { into, out };
}
