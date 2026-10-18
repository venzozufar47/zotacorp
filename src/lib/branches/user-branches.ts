import "server-only";
import { createAdminClient } from "@/lib/actions/_supabase-admin";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type BranchName = "Pare" | "Semarang";

function branchOfName(name: string): BranchName | null {
  if (/pare/i.test(name)) return "Pare";
  if (/semarang/i.test(name)) return "Semarang";
  return null;
}

/** Hitung berapa orang (dari `ids`) bertugas di tiap cabang, lewat lokasi kerjanya. */
async function branchesByLocation(ids: string[]): Promise<Map<BranchName, number>> {
  const out = new Map<BranchName, number>();
  if (ids.length === 0) return out;
  const db = createAdminClient() as any;
  const { data: links } = await db
    .from("employee_locations")
    .select("employee_id, location_id")
    .in("employee_id", ids);
  const locIds = [...new Set<string>((links ?? []).map((l: any) => l.location_id))];
  if (locIds.length === 0) return out;
  const { data: locs } = await db.from("attendance_locations").select("id, name").in("id", locIds);
  const branchOf = new Map<string, BranchName>();
  for (const l of locs ?? []) {
    const b = branchOfName(String(l.name ?? ""));
    if (b) branchOf.set(l.id, b);
  }
  for (const l of links ?? []) {
    const b = branchOf.get(l.location_id);
    if (b) out.set(b, (out.get(b) ?? 0) + 1);
  }
  return out;
}

/** Cabang dari penugasan POS (rekening "Cash Haengbocake …") — cadangan terakhir. */
async function branchesByPosAssignment(userId: string): Promise<BranchName[]> {
  const db = createAdminClient() as any;
  const { data: rows } = await db
    .from("bank_account_assignees")
    .select("bank_account_id")
    .eq("user_id", userId);
  const ids = (rows ?? []).map((r: any) => r.bank_account_id);
  if (ids.length === 0) return [];
  const { data: accts } = await db
    .from("bank_accounts")
    .select("account_name")
    .in("id", ids)
    .ilike("account_name", "cash haengbocake%");
  const set = new Set<BranchName>();
  for (const a of accts ?? []) {
    const b = branchOfName(String(a.account_name ?? ""));
    if (b) set.add(b);
  }
  return [...set].sort();
}

/**
 * Cabang seseorang, otomatis — urutan:
 *  1. lokasi kerja dirinya sendiri (kolom "Lokasi" di halaman Pengguna);
 *  2. kalau kosong dan ia atasan: cabang dengan anggota timnya terbanyak;
 *  3. kalau masih kosong: penugasan POS (rekening Cash Haengbocake …).
 * Kosong = tidak terdeteksi. Lebih dari satu = bertugas di beberapa cabang.
 * Dipakai Scorecard (beranda) dan Briefing Kilat (halaman Tim).
 */
export async function resolveUserBranches(userId: string): Promise<BranchName[]> {
  const own = await branchesByLocation([userId]);
  if (own.size > 0) return [...own.keys()].sort();

  const db = createAdminClient() as any;
  const { data: links } = await db.from("team_members").select("member_id").eq("leader_id", userId);
  const memberIds = [...new Set<string>((links ?? []).map((l: any) => l.member_id))];
  const byMembers = await branchesByLocation(memberIds);
  if (byMembers.size > 0) {
    const max = Math.max(...byMembers.values());
    return [...byMembers.entries()].filter(([, n]) => n === max).map(([b]) => b).sort();
  }

  return branchesByPosAssignment(userId);
}
