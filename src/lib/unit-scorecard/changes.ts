/**
 * Selisih antara hasil hitung terbaru dan versi tersimpan sebelumnya. Versi baru hanya dibuat bila ada yang berubah,
 * dan daftar perubahannya disimpan agar kartu bisa menandai "angka berubah". Murni (tanpa import).
 */

export interface SnapRow {
  unit_id: string;
  metric_code: string;
  value: number | null;
  status: string;
}

export interface MetricChange {
  unit_id: string;
  code: string;
  oldValue: number | null;
  newValue: number | null;
  oldStatus: string | null;
  newStatus: string | null;
}

/** Selisih nilai ≤ 0,05 dianggap sama (tampilan memakai 1 desimal). */
export const VALUE_TOLERANCE = 0.05;

export function diffSnapshots(prev: SnapRow[], next: SnapRow[], tolerance = VALUE_TOLERANCE): MetricChange[] {
  const key = (r: { unit_id: string; metric_code: string }) => `${r.unit_id}|${r.metric_code}`;
  const before = new Map(prev.map((r) => [key(r), r]));
  const after = new Map(next.map((r) => [key(r), r]));
  const out: MetricChange[] = [];
  for (const k of new Set([...before.keys(), ...after.keys()])) {
    const a = before.get(k);
    const b = after.get(k);
    const av = a?.value == null ? null : Number(a.value);
    const bv = b?.value == null ? null : Number(b.value);
    const valueChanged = av == null || bv == null ? av !== bv : Math.abs(av - bv) > tolerance;
    const statusChanged = (a?.status ?? null) !== (b?.status ?? null);
    if (valueChanged || statusChanged) {
      const ref = (b ?? a)!;
      out.push({ unit_id: ref.unit_id, code: ref.metric_code, oldValue: av, newValue: bv, oldStatus: a?.status ?? null, newStatus: b?.status ?? null });
    }
  }
  return out;
}
