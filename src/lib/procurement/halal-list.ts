/**
 * Perakit Daftar Bahan Halal (Lampiran 5) satu cabang dari master bahan, merek, dan riwayat pembelian. Hanya sisi server
 * (memakai klien service-role yang diberikan pemanggil setelah lolos gate pengadaan).
 */

import type { createAdminClient } from "@/lib/actions/_supabase-admin";
import { defaultHalalKind } from "./brand-store.ts";

type Admin = ReturnType<typeof createAdminClient>;

export const KIND_LABEL = { baku: "Bahan baku", tambahan: "Bahan tambahan", penolong: "Bahan penolong" } as const;

export interface HalalRow {
  name: string;
  kind: string | null;
  producer: string | null;
  country: string | null;
  supplier: string | null;
  issuer: string | null;
  certNo: string | null;
  validUntil: string | null;
  doc: string | null;
  /** Sel yang masih kosong (untuk disorot di berkas). */
  gaps: ("kind" | "producer" | "country" | "supplier" | "issuer" | "certNo" | "validUntil" | "doc")[];
}

export interface HalalProfileRow {
  businessName: string;
  place: string;
  ownerName: string;
  halalSupervisorName: string;
}

/** Apakah rentang pemakaian [startedOn, endedOn?] beririsan dengan [from, to]. */
export function usageOverlaps(u: { started_on: string; ended_on: string | null }, from: string, to: string): boolean {
  return u.started_on <= to && (u.ended_on == null || u.ended_on >= from);
}

/**
 * Baris daftar. Tanpa rentang tanggal: merek yang SEDANG dipakai (atau semua merek aktif bila belum ada penanda dipakai).
 * Dengan rentang: merek yang dipakai pada rentang itu. Bahan tanpa merek tetap tampil (sel merek kosong tersorot).
 */
export async function buildHalalRows(
  admin: Admin,
  businessUnit: string,
  range?: { from: string; to: string }
): Promise<{ rows: HalalRow[]; profile: HalalProfileRow }> {
  const [{ data: mats }, { data: brands }, { data: usage }, { data: recs }, { data: prof }] = await Promise.all([
    admin.from("costing_materials" as never).select("id, name, category, halal_kind").eq("business_unit", businessUnit).eq("is_active", true).eq("in_halal_list", true).order("name"),
    admin.from("costing_material_brands" as never).select("*").eq("business_unit", businessUnit),
    admin.from("costing_material_brand_usage" as never).select("material_id, brand_id, started_on, ended_on").eq("business_unit", businessUnit),
    admin
      .from("costing_material_receipts" as never)
      .select("material_id, brand_id, supplier, receipt_date")
      .eq("business_unit", businessUnit)
      .not("supplier", "is", null)
      .order("receipt_date", { ascending: false })
      .limit(3000),
    admin.from("procurement_halal_profiles" as never).select("*").eq("business_unit", businessUnit).maybeSingle(),
  ]);

  const brandsByMat = new Map<string, Record<string, unknown>[]>();
  for (const b of (brands ?? []) as Record<string, unknown>[]) {
    const arr = brandsByMat.get(b.material_id as string) ?? [];
    arr.push(b);
    brandsByMat.set(b.material_id as string, arr);
  }
  const usageRows = (usage ?? []) as { material_id: string; brand_id: string; started_on: string; ended_on: string | null }[];
  // Pemasok terakhir per merek dan per bahan (terbaru dulu, jadi yang pertama menang).
  const supplierByBrand = new Map<string, string>();
  const supplierByMat = new Map<string, string>();
  for (const r of (recs ?? []) as { material_id: string; brand_id: string | null; supplier: string }[]) {
    if (r.brand_id && !supplierByBrand.has(r.brand_id)) supplierByBrand.set(r.brand_id, r.supplier);
    if (!supplierByMat.has(r.material_id)) supplierByMat.set(r.material_id, r.supplier);
  }

  const rows: HalalRow[] = [];
  for (const m of (mats ?? []) as { id: string; name: string; category: string | null; halal_kind: keyof typeof KIND_LABEL | null }[]) {
    const all = (brandsByMat.get(m.id) ?? []).filter((b) => b.is_active === true || range);
    let chosen: Record<string, unknown>[];
    const mine = usageRows.filter((u) => u.material_id === m.id);
    if (range) {
      const ids = new Set(mine.filter((u) => usageOverlaps(u, range.from, range.to)).map((u) => u.brand_id));
      chosen = all.filter((b) => ids.has(b.id as string));
    } else {
      const open = mine.find((u) => u.ended_on == null)?.brand_id;
      chosen = open ? all.filter((b) => b.id === open) : all;
    }
    const kind = m.halal_kind ?? defaultHalalKind(m.category);
    if (chosen.length === 0) {
      rows.push({
        name: m.name,
        kind: kind ? KIND_LABEL[kind] : null,
        producer: null,
        country: null,
        supplier: supplierByMat.get(m.id) ?? null,
        issuer: null,
        certNo: null,
        validUntil: null,
        doc: null,
        gaps: ["kind", "producer", "country", "supplier", "issuer", "certNo", "validUntil", "doc"].filter((g) => {
          if (g === "kind") return !kind;
          if (g === "supplier") return !supplierByMat.get(m.id);
          return true;
        }) as HalalRow["gaps"],
      });
      continue;
    }
    for (const b of chosen) {
      const status = b.halal_status as string;
      const cert = status === "bersertifikat";
      const exempt = status === "tidak_wajib";
      const supplier = supplierByBrand.get(b.id as string) ?? supplierByMat.get(m.id) ?? null;
      const row: HalalRow = {
        name: `${m.name} — ${b.name as string}`,
        kind: kind ? KIND_LABEL[kind] : null,
        producer: (b.producer as string | null) ?? null,
        country: (b.country as string | null) ?? null,
        supplier,
        issuer: cert ? ((b.halal_issuer as string | null) ?? null) : exempt ? "-" : null,
        certNo: cert ? ((b.halal_cert_no as string | null) ?? null) : exempt ? "-" : null,
        validUntil: cert ? ((b.halal_valid_until as string | null) ?? null) : null,
        doc: cert ? (b.halal_doc_path ? "Sertifikat halal (terlampir)" : null) : exempt ? `Positive list${b.halal_note ? ` — ${b.halal_note as string}` : ""}` : null,
        gaps: [],
      };
      if (!row.kind) row.gaps.push("kind");
      if (!row.producer && !exempt) row.gaps.push("producer");
      if (!row.country && !exempt) row.gaps.push("country");
      if (!row.supplier) row.gaps.push("supplier");
      if (!row.issuer) row.gaps.push("issuer");
      if (!row.certNo) row.gaps.push("certNo");
      if (!row.validUntil && !exempt) row.gaps.push("validUntil");
      if (!row.doc) row.gaps.push("doc");
      rows.push(row);
    }
  }

  const p = prof as Record<string, string | null> | null;
  return {
    rows,
    profile: {
      businessName: p?.business_name ?? businessUnit,
      place: p?.place ?? "",
      ownerName: p?.owner_name ?? "",
      halalSupervisorName: p?.halal_supervisor_name ?? "",
    },
  };
}
