import "server-only";
import { createAdminClient } from "@/lib/actions/_supabase-admin";
import { OWNER_LEVEL, type Link } from "./chain-logic";

export { OWNER_LEVEL, PERSON_LEVEL, resolveTarget, wouldCreateCycle, holderLabel, type Link, type Target } from "./chain-logic";

/**
 * Hierarki tiket per orang: tiap karyawan punya atasan langsung per cabang (ticket_superiors); owner (admin) selalu puncak.
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

/** Atasan langsung seseorang di sebuah cabang (kosong = langsung ke owner). */
export async function superiorsOf(branchId: string, userId: string): Promise<string[]> {
  const admin = createAdminClient() as any;
  const { data } = await admin.from("ticket_superiors").select("superior_id").eq("branch_id", branchId).eq("user_id", userId);
  const ids = ((data ?? []) as any[]).map((r) => r.superior_id as string);
  if (ids.length === 0) return ids;
  // Atasan yang sudah nonaktif/resign tidak boleh jadi tujuan tiket (tiket akan menggantung tanpa penanggung jawab).
  const { data: alive } = await admin.from("profiles").select("id").in("id", ids).eq("is_active", true).is("resigned_at", null);
  const ok = new Set(((alive ?? []) as any[]).map((r) => r.id as string));
  return ids.filter((id) => ok.has(id));
}

/** Bawahan langsung seseorang di sebuah cabang. */
export async function subordinatesOf(branchId: string, userId: string): Promise<string[]> {
  const admin = createAdminClient() as any;
  const { data } = await admin.from("ticket_superiors").select("user_id").eq("branch_id", branchId).eq("superior_id", userId);
  return ((data ?? []) as any[]).map((r) => r.user_id as string);
}

/** Cabang tempat seseorang menjadi atasan (punya bawahan), beserta id bawahannya. */
export async function managedBy(userId: string): Promise<{ branchId: string; subordinateIds: string[] }[]> {
  const admin = createAdminClient() as any;
  const { data } = await admin.from("ticket_superiors").select("branch_id, user_id").eq("superior_id", userId);
  const byBranch = new Map<string, string[]>();
  for (const r of (data ?? []) as any[]) byBranch.set(r.branch_id, [...(byBranch.get(r.branch_id) ?? []), r.user_id as string]);
  return Array.from(byBranch, ([branchId, subordinateIds]) => ({ branchId, subordinateIds }));
}

/** Semua garis atasan-bawahan sebuah cabang. */
export async function linksOf(branchId: string): Promise<Link[]> {
  const admin = createAdminClient() as any;
  const { data } = await admin.from("ticket_superiors").select("user_id, superior_id").eq("branch_id", branchId);
  return ((data ?? []) as any[]).map((r) => ({ userId: r.user_id as string, superiorId: r.superior_id as string }));
}

/** Penerima notifikasi pemegang tiket: orangnya, atau semua admin bila owner. */
export async function holderRecipients(level: number, handlerId: string | null): Promise<string[]> {
  if (level >= OWNER_LEVEL) {
    const admin = createAdminClient() as any;
    const { data } = await admin.from("profiles").select("id").eq("role", "admin");
    return ((data ?? []) as any[]).map((r) => r.id as string);
  }
  return handlerId ? [handlerId] : [];
}

/**
 * Orang di cabang itu (untuk "tiket ke bawah" ke seluruh cabang dan antrean rekan): yang ditugaskan ke lokasi kerja
 * cabang, DITAMBAH siapa pun yang terdaftar di hierarki tiket cabang itu (bawahan maupun atasan). Atasan cabang seperti
 * Tasya (Semarang) atau Nisa (Pare) sering tidak punya penugasan lokasi kerja, tapi jelas bagian dari cabangnya.
 */
export async function employeesOfBranch(branchId: string): Promise<string[]> {
  const admin = createAdminClient() as any;
  const { data: b } = await admin.from("ticket_branches").select("location_id").eq("id", branchId).maybeSingle();
  const [located, links] = await Promise.all([
    b?.location_id ? admin.from("employee_locations").select("employee_id").eq("location_id", b.location_id) : Promise.resolve({ data: [] }),
    admin.from("ticket_superiors").select("user_id, superior_id").eq("branch_id", branchId),
  ]);
  const ids = new Set<string>();
  for (const r of (located.data ?? []) as any[]) if (r.employee_id) ids.add(r.employee_id as string);
  for (const r of (links.data ?? []) as any[]) {
    if (r.user_id) ids.add(r.user_id as string);
    if (r.superior_id) ids.add(r.superior_id as string);
  }
  return Array.from(ids);
}
