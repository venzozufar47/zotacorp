/**
 * Nama saldo belanja online per cabang. Datanya tetap satu mekanisme ("shopee" di basis data: sumber uang, tabel saldo,
 * tambah saldo); hanya tampilannya yang berbeda: Semarang memakai Saldo Seabank, cabang lain Saldo Shopee. Modul murni
 * (aman untuk client).
 */

const SEABANK_UNITS = new Set(["Haengbocake Semarang"]);

/** "Seabank" untuk Semarang, selain itu "Shopee". */
export function walletName(businessUnit: string | null | undefined): "Shopee" | "Seabank" {
  return businessUnit && SEABANK_UNITS.has(businessUnit) ? "Seabank" : "Shopee";
}

/** "Saldo Seabank" / "Saldo Shopee". */
export function walletLabel(businessUnit: string | null | undefined): string {
  return `Saldo ${walletName(businessUnit)}`;
}
