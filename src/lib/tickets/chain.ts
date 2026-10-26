import "server-only";
import { createAdminClient } from "@/lib/actions/_supabase-admin";
import { OWNER_LEVEL, type ChainMember } from "./chain-logic";

export { OWNER_LEVEL, firstLevel, nextLevelAbove, levelBelow, levelLabel, type ChainMember } from "./chain-logic";

/**
 * Hierarki tiket: tiap cabang punya rantai bertingkat (Tingkat 1, 2, ...) yang diatur owner; owner (admin) selalu
 * puncak. Tiket "naik" mulai di Tingkat 1 dan dieskalasi satu tingkat demi satu tingkat sampai owner (OWNER_LEVEL).
 * Semua pembacaan memakai service-role (tabelnya dibatasi RLS); pemanggil WAJIB sudah memeriksa siapa penggunanya.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface TicketBranchRow {
  id: string;
  businessUnit: string;
  branch: string;
  label: string;
  isActive: boolean;
}

const mapBranch = (r: any): TicketBranchRow => ({
  id: r.id,
  businessUnit: r.business_unit,
  branch: r.branch,
  label: r.label,
  isActive: r.is_active,
});

export async function listTicketBranches(opts: { onlyActive?: boolean } = {}): Promise<TicketBranchRow[]> {
  const admin = createAdminClient() as any;
  let q = admin.from("ticket_branches").select("id, business_unit, branch, label, is_active").order("sort_order");
  if (opts.onlyActive) q = q.eq("is_active", true);
  const { data } = await q;
  return ((data ?? []) as any[]).map(mapBranch);
}

export async function getTicketBranch(id: string): Promise<TicketBranchRow | null> {
  const admin = createAdminClient() as any;
  const { data } = await admin.from("ticket_branches").select("id, business_unit, branch, label, is_active").eq("id", id).maybeSingle();
  return data ? mapBranch(data) : null;
}

/** Cabang tempat seorang karyawan ditugaskan (lewat penugasan lokasi presensi). */
export async function branchesOfEmployee(userId: string): Promise<TicketBranchRow[]> {
  const admin = createAdminClient() as any;
  const { data: locs } = await admin.from("employee_locations").select("location_id").eq("employee_id", userId);
  const locIds = ((locs ?? []) as any[]).map((l) => l.location_id as string).filter(Boolean);
  if (locIds.length === 0) return [];
  const { data } = await admin
    .from("ticket_branches")
    .select("id, business_unit, branch, label, is_active")
    .in("location_id", locIds)
    .eq("is_active", true)
    .order("sort_order");
  return ((data ?? []) as any[]).map(mapBranch);
}

/** Tingkat seseorang di rantai sebuah cabang (null = bukan anggota). */
export async function memberLevel(branchId: string, userId: string): Promise<number | null> {
  const admin = createAdminClient() as any;
  const { data } = await admin.from("ticket_chain_members").select("level").eq("branch_id", branchId).eq("user_id", userId).maybeSingle();
  return data ? Number(data.level) : null;
}

/** Cabang + tingkat yang dipegang seseorang (semua cabang tempat dia masuk rantai). */
export async function chainMembershipsOf(userId: string): Promise<{ branchId: string; level: number }[]> {
  const admin = createAdminClient() as any;
  const { data } = await admin.from("ticket_chain_members").select("branch_id, level").eq("user_id", userId);
  return ((data ?? []) as any[]).map((r) => ({ branchId: r.branch_id as string, level: Number(r.level) }));
}

export async function chainOf(branchId: string): Promise<ChainMember[]> {
  const admin = createAdminClient() as any;
  const { data } = await admin.from("ticket_chain_members").select("user_id, level").eq("branch_id", branchId).order("level");
  return ((data ?? []) as any[]).map((r) => ({ userId: r.user_id as string, level: Number(r.level) }));
}

/** Penerima notifikasi untuk sebuah tingkat: anggota tingkat itu, atau semua admin bila owner. */
export async function recipientsAtLevel(branchId: string, level: number): Promise<string[]> {
  const admin = createAdminClient() as any;
  if (level >= OWNER_LEVEL) {
    const { data } = await admin.from("profiles").select("id").eq("role", "admin");
    return ((data ?? []) as any[]).map((r) => r.id as string);
  }
  const { data } = await admin.from("ticket_chain_members").select("user_id").eq("branch_id", branchId).eq("level", level);
  return ((data ?? []) as any[]).map((r) => r.user_id as string);
}

/** Karyawan yang ditugaskan ke cabang (untuk "tiket ke bawah" ke seluruh cabang dan antrean rekan). */
export async function employeesOfBranch(branchId: string): Promise<string[]> {
  const admin = createAdminClient() as any;
  const { data: b } = await admin.from("ticket_branches").select("location_id").eq("id", branchId).maybeSingle();
  if (!b?.location_id) return [];
  const { data } = await admin.from("employee_locations").select("employee_id").eq("location_id", b.location_id);
  return Array.from(new Set(((data ?? []) as any[]).map((r) => r.employee_id as string).filter(Boolean)));
}

/** True bila `userId` memegang tiket ini: anggota tingkat `handlerLevel` cabangnya, atau admin bila level owner. */
export async function canHandleAtLevel(branchId: string, handlerLevel: number, userId: string, isAdmin: boolean): Promise<boolean> {
  if (handlerLevel >= OWNER_LEVEL) return isAdmin;
  const lvl = await memberLevel(branchId, userId);
  return lvl != null && lvl === handlerLevel;
}
