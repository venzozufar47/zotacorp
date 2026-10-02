"use server";

/**
 * Management Akun (login & password) — admin only.
 *
 * Password TIDAK pernah ada di tabel maupun di hasil daftar. Disimpan di
 * Supabase Vault lewat fungsi `account_vault_*` yang hanya bisa dipanggil
 * service_role — jadi satu-satunya jalan baca adalah `revealManagedAccountPassword`
 * di bawah, yang memeriksa role admin lebih dulu. Metadata akun memakai klien
 * SESI admin (RLS `is_admin()` jadi pagar kedua).
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "./_supabase-admin";
import { requireAdmin, type ActionResult } from "./_gates";
import type { ManagedAccount } from "@/lib/accounts/types";
import { GENERAL_BU } from "@/lib/admin-registry/taxonomy";

/* eslint-disable @typescript-eslint/no-explicit-any */

const PATH = "/admin/accounts";

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((s) => (s ? s : null));

const inputSchema = z.object({
  id: z.string().uuid().nullable(),
  login: z.string().trim().min(1, "Email / username wajib diisi").max(200),
  /** Wajib saat membuat; kosong saat edit = password tidak diubah. */
  password: z.string().max(500).nullable(),
  businessUnit: z.string().trim().min(1).default(GENERAL_BU),
  branch: optional(80),
  service: optional(120),
  linkedPhone: optional(40),
  loginUrl: optional(300),
  notes: optional(1000),
});

export type ManagedAccountInput = z.input<typeof inputSchema>;

const COLS =
  "id, service, login, business_unit, branch, linked_phone, login_url, notes";

function toAccount(r: any): ManagedAccount {
  return {
    id: r.id,
    service: r.service ?? null,
    login: r.login,
    businessUnit: r.business_unit,
    branch: r.branch ?? null,
    linkedPhone: r.linked_phone ?? null,
    loginUrl: r.login_url ?? null,
    notes: r.notes ?? null,
  };
}

export async function listManagedAccounts(): Promise<ManagedAccount[]> {
  const gate = await requireAdmin();
  if (!gate.ok) return [];
  const supabase = (await createClient()) as any;
  const { data, error } = await supabase
    .from("managed_accounts")
    .select(COLS)
    .order("business_unit", { ascending: true })
    .order("service", { ascending: true, nullsFirst: false })
    .order("login", { ascending: true });
  if (error) {
    console.error("[managed-accounts] list failed", error);
    return [];
  }
  return ((data ?? []) as any[]).map(toAccount);
}

export async function saveManagedAccount(
  input: ManagedAccountInput
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Data tidak valid" };
  }
  const v = parsed.data;
  const password = v.password && v.password.length > 0 ? v.password : null;

  const supabase = (await createClient()) as any;
  const vault = createAdminClient() as any;

  const fields = {
    service: v.service,
    login: v.login,
    business_unit: v.businessUnit,
    branch: v.branch,
    linked_phone: v.linkedPhone,
    login_url: v.loginUrl,
    notes: v.notes,
  };

  if (v.id) {
    const { data: cur } = await supabase
      .from("managed_accounts")
      .select("id, password_secret_id")
      .eq("id", v.id)
      .maybeSingle();
    if (!cur) return { ok: false, error: "Akun tidak ditemukan" };

    if (password) {
      const { error } = await vault.rpc("account_vault_store", {
        p_secret_id: cur.password_secret_id,
        p_password: password,
      });
      if (error) return { ok: false, error: "Gagal menyimpan password" };
    }
    const { error } = await supabase
      .from("managed_accounts")
      .update(fields)
      .eq("id", v.id);
    if (error) return { ok: false, error: error.message };
    revalidatePath(PATH);
    return { ok: true, data: { id: v.id } };
  }

  if (!password) return { ok: false, error: "Password wajib diisi" };

  const { data: secretId, error: vaultErr } = await vault.rpc(
    "account_vault_store",
    { p_secret_id: null, p_password: password }
  );
  if (vaultErr || !secretId) return { ok: false, error: "Gagal menyimpan password" };

  const { data: row, error } = await supabase
    .from("managed_accounts")
    .insert({ ...fields, password_secret_id: secretId, created_by: gate.userId })
    .select("id")
    .single();
  if (error || !row) {
    // Jangan tinggalkan password yatim di vault.
    await vault.rpc("account_vault_delete", { p_secret_id: secretId });
    return { ok: false, error: error?.message ?? "Gagal menyimpan akun" };
  }
  revalidatePath(PATH);
  return { ok: true, data: { id: row.id } };
}

/** Baca password — admin saja, dipanggil hanya saat admin menekan lihat/salin. */
export async function revealManagedAccountPassword(
  id: string
): Promise<ActionResult<{ password: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const supabase = (await createClient()) as any;
  const { data: row } = await supabase
    .from("managed_accounts")
    .select("password_secret_id")
    .eq("id", id)
    .maybeSingle();
  if (!row) return { ok: false, error: "Akun tidak ditemukan" };

  const vault = createAdminClient() as any;
  const { data, error } = await vault.rpc("account_vault_reveal", {
    p_secret_id: row.password_secret_id,
  });
  if (error || typeof data !== "string") {
    return { ok: false, error: "Password tidak bisa dibaca" };
  }
  return { ok: true, data: { password: data } };
}

/** Hapus akun; trigger DB ikut menghapus secret-nya di vault. */
export async function deleteManagedAccount(id: string): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = (await createClient()) as any;
  const { error } = await supabase.from("managed_accounts").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(PATH);
  return { ok: true };
}
