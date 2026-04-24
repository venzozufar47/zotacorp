"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/supabase/cached";

/**
 * Admin CRUD untuk business units + roles per BU.
 *
 * Sumber kebenaran sebelumnya ada di `src/lib/utils/constants.ts`
 * (hard-coded array + record of role lists). Sekarang DB-backed
 * lewat tabel `business_units` + `business_unit_roles` supaya admin
 * bisa ubah runtime. Constants tetap di-retain sebagai seed awal
 * (migration 0XX) — pasca seed, semua consumer read dari sini.
 */

export interface BusinessUnitWithRoles {
  id: string;
  name: string;
  roles: string[];
}

async function requireAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const role = await getCurrentRole();
  if (role !== "admin") return { ok: false, error: "Forbidden" };
  return { ok: true };
}

/**
 * List semua business unit beserta daftar role-nya. Ordered by nama
 * BU dan role alphabetis — stable supaya UI tidak "loncat" tiap refresh.
 * Read policy: authenticated (non-admin juga boleh baca — ProfileForm
 * pakai ini).
 */
export async function listBusinessUnits(): Promise<BusinessUnitWithRoles[]> {
  const supabase = await createClient();
  const { data: bus, error: buErr } = await supabase
    .from("business_units")
    .select("id, name")
    .order("name");
  if (buErr || !bus) return [];
  const ids = bus.map((b) => b.id);
  const { data: roles } = await supabase
    .from("business_unit_roles")
    .select("business_unit_id, role_name")
    .in("business_unit_id", ids)
    .order("role_name");
  const rolesByBu = new Map<string, string[]>();
  for (const r of roles ?? []) {
    const arr = rolesByBu.get(r.business_unit_id) ?? [];
    arr.push(r.role_name);
    rolesByBu.set(r.business_unit_id, arr);
  }
  return bus.map((b) => ({
    id: b.id,
    name: b.name,
    roles: rolesByBu.get(b.id) ?? [],
  }));
}

export async function createBusinessUnit(input: { name: string }) {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };
  const name = input.name.trim();
  if (!name) return { error: "Nama business unit wajib diisi" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("business_units")
    .insert({ name })
    .single();
  if (error) {
    if (error.code === "23505") return { error: `"${name}" sudah ada` };
    return { error: error.message };
  }
  revalidatePath("/admin/settings");
  return { ok: true as const };
}

export async function renameBusinessUnit(input: { id: string; newName: string }) {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };
  const newName = input.newName.trim();
  if (!newName) return { error: "Nama tidak boleh kosong" };

  const supabase = await createClient();
  // Ambil nama lama supaya bisa cascading update ke profiles.business_unit
  // yang menyimpan nama (bukan FK id). Profile data lama di-rename
  // serentak supaya admin tidak kehilangan referensi.
  const { data: old } = await supabase
    .from("business_units")
    .select("name")
    .eq("id", input.id)
    .single();
  if (!old) return { error: "Business unit tidak ditemukan" };
  if (old.name === newName) return { ok: true as const };

  const { error } = await supabase
    .from("business_units")
    .update({ name: newName, updated_at: new Date().toISOString() })
    .eq("id", input.id);
  if (error) {
    if (error.code === "23505") return { error: `"${newName}" sudah ada` };
    return { error: error.message };
  }
  // Cascade rename ke profiles & bank_accounts (kolom business_unit
  // menyimpan nama string). Kedua tabel aman di-update tanpa FK karena
  // mereka memang pakai string, bukan FK id.
  await supabase
    .from("profiles")
    .update({ business_unit: newName })
    .eq("business_unit", old.name);
  await supabase
    .from("bank_accounts")
    .update({ business_unit: newName })
    .eq("business_unit", old.name);
  revalidatePath("/admin/settings");
  return { ok: true as const };
}

export async function deleteBusinessUnit(input: { id: string }) {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };

  const supabase = await createClient();
  const { data: bu } = await supabase
    .from("business_units")
    .select("name")
    .eq("id", input.id)
    .single();
  if (!bu) return { error: "Business unit tidak ditemukan" };

  // Safety: blok delete kalau masih dipakai profile atau bank_account.
  // Admin harus pindahkan dulu atau hapus referensinya manual.
  const { count: profCount } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("business_unit", bu.name);
  if ((profCount ?? 0) > 0) {
    return {
      error: `Masih ada ${profCount} profile di "${bu.name}". Pindahkan dulu.`,
    };
  }
  const { count: baCount } = await supabase
    .from("bank_accounts")
    .select("id", { count: "exact", head: true })
    .eq("business_unit", bu.name);
  if ((baCount ?? 0) > 0) {
    return {
      error: `Masih ada ${baCount} rekening di "${bu.name}". Pindahkan dulu.`,
    };
  }

  const { error } = await supabase
    .from("business_units")
    .delete()
    .eq("id", input.id);
  if (error) return { error: error.message };
  revalidatePath("/admin/settings");
  return { ok: true as const };
}

export async function addRoleToBusinessUnit(input: {
  businessUnitId: string;
  roleName: string;
}) {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };
  const role = input.roleName.trim();
  if (!role) return { error: "Nama role wajib diisi" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("business_unit_roles")
    .insert({ business_unit_id: input.businessUnitId, role_name: role })
    .single();
  if (error) {
    if (error.code === "23505") return { error: `"${role}" sudah ada di BU ini` };
    return { error: error.message };
  }
  revalidatePath("/admin/settings");
  return { ok: true as const };
}

export async function removeRoleFromBusinessUnit(input: {
  businessUnitId: string;
  roleName: string;
}) {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };

  const supabase = await createClient();
  // Safety: cek apakah role masih dipakai profile di BU ini.
  const { data: bu } = await supabase
    .from("business_units")
    .select("name")
    .eq("id", input.businessUnitId)
    .single();
  if (bu) {
    const { count } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("business_unit", bu.name)
      .eq("position", input.roleName);
    if ((count ?? 0) > 0) {
      return {
        error: `Masih ada ${count} profile dengan role "${input.roleName}". Pindahkan dulu.`,
      };
    }
  }

  const { error } = await supabase
    .from("business_unit_roles")
    .delete()
    .eq("business_unit_id", input.businessUnitId)
    .eq("role_name", input.roleName);
  if (error) return { error: error.message };
  revalidatePath("/admin/settings");
  return { ok: true as const };
}
