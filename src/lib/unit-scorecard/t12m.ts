/**
 * Angka 12 bulan terakhir (T12M) untuk metrik struktural: margin four-wall, sewa terhadap omzet, dan payback.
 * Murni (tanpa import dari luar modul ini) supaya bisa diuji. Dihitung dari snapshot bulanan yang sudah tersimpan,
 * jadi tidak menghitung ulang laporan keuangan. Hanya pembanding: tidak mengubah status hijau/kuning/merah.
 *
 * Syarat: 12 bulan berturut-turut yang berakhir di bulan terpilih, semuanya sudah dinilai (bukan "belum lengkap" /
 * "tidak dinilai"). Selain itu hasilnya null: "belum cukup periode".
 */

export interface T12Snap {
  month: string; // "YYYY-MM-01"
  unit_id: string;
  code: string;
  status: string;
  inputs: Record<string, unknown> | null;
}

export type T12Result = { value: number | null; unit: "pct" | "months" } | null;

const FOUR_WALL = new Set(["B4", "S3"]);
const RENT = new Set(["B3", "S4"]);
const PAYBACK = "S5";

export const T12_CODES = [...FOUR_WALL, ...RENT, PAYBACK];

function monthsBack(monthIso: string, n: number): string[] {
  let y = Number(monthIso.slice(0, 4));
  let m = Number(monthIso.slice(5, 7));
  const out: string[] = [];
  for (let k = 0; k < n; k++) {
    out.push(`${y}-${String(m).padStart(2, "0")}-01`);
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
  }
  return out;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const NOT_READY = new Set(["incomplete", "not_assessed"]);

/** Snapshot 12 bulan lengkap & sudah dinilai untuk satu unit+metrik, atau null. */
function window12(snaps: T12Snap[], unitId: string, codes: Set<string> | string, monthIso: string): T12Snap[] | null {
  const want = typeof codes === "string" ? new Set([codes]) : codes;
  const rows: T12Snap[] = [];
  for (const m of monthsBack(monthIso, 12)) {
    const s = snaps.find((x) => x.unit_id === unitId && x.month === m && want.has(x.code));
    if (!s || NOT_READY.has(s.status) || !s.inputs) return null;
    rows.push(s);
  }
  return rows;
}

function sum(xs: (number | null)[]): number | null {
  let t = 0;
  for (const x of xs) {
    if (x == null) return null;
    t += x;
  }
  return t;
}

/** `code` = kode metrik kartu (B3/B4/S3/S4/S5). null → belum cukup periode, atau metrik tanpa T12M. */
export function t12For(snaps: T12Snap[], unitId: string, code: string, monthIso: string): T12Result {
  if (FOUR_WALL.has(code)) {
    const w = window12(snaps, unitId, FOUR_WALL, monthIso);
    if (!w) return null;
    const profit = sum(w.map((s) => num(s.inputs!.laba_four_wall_rp)));
    const revenue = sum(w.map((s) => num((s.inputs!.komponen as Record<string, unknown> | undefined)?.revenue)));
    if (profit == null || revenue == null || !(revenue > 0)) return null;
    return { value: Math.round((profit / revenue) * 1000) / 10, unit: "pct" };
  }
  if (RENT.has(code)) {
    const w = window12(snaps, unitId, RENT, monthIso);
    if (!w) return null;
    const rent = sum(w.map((s) => num(s.inputs!.pembilang_sewa_rp)));
    const revenue = sum(w.map((s) => num(s.inputs!.penyebut_revenue_rp)));
    if (rent == null || revenue == null || !(revenue > 0)) return null;
    return { value: Math.round((rent / revenue) * 1000) / 10, unit: "pct" };
  }
  if (code === PAYBACK) {
    const w = window12(snaps, unitId, FOUR_WALL, monthIso);
    const cur = snaps.find((x) => x.unit_id === unitId && x.month === monthIso && x.code === PAYBACK);
    const capex = num(cur?.inputs?.modal_awal_rp);
    if (!w || !(capex != null && capex > 0)) return null;
    const profit = sum(w.map((s) => num(s.inputs!.laba_four_wall_rp)));
    if (profit == null) return null;
    const avg = profit / 12;
    // Laba rata-rata ≤ 0: modal tidak kembali; nilai null dengan unit "months" ditampilkan sebagai "—" oleh pemanggil.
    return { value: avg > 0 ? Math.round((capex / avg) * 10) / 10 : null, unit: "months" };
  }
  return null;
}
