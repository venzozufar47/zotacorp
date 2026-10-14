"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/cached";
import { createAdminClient } from "@/lib/actions/_supabase-admin";
import type { ActionResult } from "@/lib/actions/_gates";
import { MAX_ACCOUNTS, MAX_PARKED } from "@/lib/auth/account-limits";
import { readVault, writeVault, type VaultEntry } from "@/lib/auth/account-vault";

/**
 * Ganti akun tanpa sign out / sign in. Desain lengkap + alasannya ada di
 * `src/lib/auth/account-vault.ts` (vault hanya berisi akun TIDAK aktif).
 *
 * Semua operasi yang memakai refresh token akun lain berjalan di klien
 * Supabase SEMENTARA tanpa cookie: kegagalan refresh membuat auth-js
 * memanggil `_removeSession()` pada klien yang dipakainya, dan itu tidak
 * boleh sampai menghapus cookie sesi akun yang sedang aktif.
 */

export interface SavedAccount {
  userId: string;
  fullName: string | null;
  email: string | null;
  role: string | null;
  avatarUrl: string | null;
  avatarSeed: string | null;
}

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  avatar_url: string | null;
  avatar_seed: string | null;
  is_active: boolean | null;
};

function tempClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  );
}

async function loadProfiles(ids: string[]): Promise<Map<string, ProfileRow>> {
  const map = new Map<string, ProfileRow>();
  if (ids.length === 0) return map;
  const { data } = await createAdminClient()
    .from("profiles")
    .select("id, full_name, email, role, avatar_url, avatar_seed, is_active")
    .in("id", ids);
  for (const p of (data ?? []) as unknown as ProfileRow[]) map.set(p.id, p);
  return map;
}

function toSaved(p: ProfileRow): SavedAccount {
  return {
    userId: p.id,
    fullName: p.full_name,
    email: p.email,
    role: p.role,
    avatarUrl: p.avatar_url,
    avatarSeed: p.avatar_seed,
  };
}

/** Cabut sesi satu akun yang diparkir (best-effort) — dipakai saat dihapus dari perangkat. */
async function revokeParked(entry: VaultEntry): Promise<void> {
  try {
    const t = tempClient();
    const { data } = await t.auth.refreshSession({ refresh_token: entry.rt });
    if (data.session) await t.auth.signOut({ scope: "local" });
  } catch {
    // Token sudah mati/dicabut — memang itu tujuannya.
  }
}

/** Akun aktif + akun tersimpan (nama/avatar segar dari DB; yang nonaktif/hilang dibuang). */
export async function listSavedAccounts(): Promise<
  ActionResult<{ current: SavedAccount | null; saved: SavedAccount[] }>
> {
  const me = await getCurrentProfile();
  const vault = await readVault();
  const parked = vault.filter((e) => e.userId !== me?.id);
  const profiles = await loadProfiles(parked.map((e) => e.userId));
  const valid = parked.filter((e) => profiles.get(e.userId)?.is_active);
  if (valid.length !== vault.length) await writeVault(valid);

  return {
    ok: true,
    data: {
      current: me
        ? {
            userId: me.id,
            fullName: me.full_name ?? null,
            email: me.email ?? null,
            role: me.role ?? null,
            avatarUrl: me.avatar_url ?? null,
            avatarSeed: me.avatar_seed ?? null,
          }
        : null,
      saved: valid.map((e) => toSaved(profiles.get(e.userId)!)),
    },
  };
}

/** Pindah ke akun tersimpan. Akun yang ditinggalkan otomatis diparkir. */
export async function switchAccount(targetId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user: cur },
  } = await supabase.auth.getUser();
  if (cur?.id === targetId) return { ok: true };

  const vault = await readVault();
  const target = vault.find((e) => e.userId === targetId);
  if (!target) return { ok: false, error: "Akun ini tidak tersimpan di perangkat ini." };
  const others = vault.filter((e) => e.userId !== targetId);

  // 1) Refresh token target di klien sementara — cookie akun aktif tak tersentuh.
  const temp = tempClient();
  const { data: fresh, error: refreshErr } = await temp.auth.refreshSession({
    refresh_token: target.rt,
  });
  if (refreshErr || !fresh.session || fresh.user?.id !== targetId) {
    await writeVault(others);
    return {
      ok: false,
      error: "Sesi akun ini sudah berakhir. Silakan login ulang dengan email dan password.",
    };
  }

  // 2) Akun nonaktif / dihapus tidak boleh dimasuki lewat jalur ini.
  const profile = (await loadProfiles([targetId])).get(targetId);
  if (!profile?.is_active) {
    await temp.auth.signOut({ scope: "local" });
    await writeVault(others);
    return { ok: false, error: "Akun ini sudah tidak aktif." };
  }

  // 3) Parkir akun yang ditinggalkan, pakai token TERBARU dari cookie.
  const {
    data: { session: curSession },
  } = await supabase.auth.getSession();
  const parked: VaultEntry[] =
    cur && curSession?.refresh_token
      ? [{ userId: cur.id, rt: curSession.refresh_token }, ...others.filter((e) => e.userId !== cur.id)]
      : others;

  // 4) Aktifkan target di cookie. Token lama target sudah terpakai (rotasi),
  //    jadi bila langkah ini gagal, simpan token BARU-nya agar akunnya tak hilang.
  const { error: setErr } = await supabase.auth.setSession({
    access_token: fresh.session.access_token,
    refresh_token: fresh.session.refresh_token,
  });
  if (setErr) {
    await writeVault([...others, { userId: targetId, rt: fresh.session.refresh_token }]);
    return { ok: false, error: "Gagal berpindah akun. Coba lagi." };
  }

  await writeVault(parked);
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Tambah akun: klien sudah login (signInWithPassword) di klien sementara dan
 * mengirim sesinya ke sini. Akun aktif diparkir, akun baru jadi aktif.
 */
export async function addAccount(input: {
  accessToken: string;
  refreshToken: string;
}): Promise<ActionResult> {
  const { accessToken, refreshToken } = input;
  if (
    !accessToken ||
    !refreshToken ||
    accessToken.length > 8192 ||
    refreshToken.length > 2048
  ) {
    return { ok: false, error: "Sesi login tidak valid." };
  }

  // Verifikasi kedua token benar-benar sesi yang sah (bukan token rakitan).
  const temp = tempClient();
  const { data: verified, error: verifyErr } = await temp.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (verifyErr || !verified.session || !verified.user) {
    return { ok: false, error: "Sesi login tidak valid. Coba login ulang." };
  }
  const newId = verified.user.id;
  const revoke = () => temp.auth.signOut({ scope: "local" });

  // `auth.users` dipakai bersama proyek lain — wajib punya profil aktif di app ini.
  const profile = (await loadProfiles([newId])).get(newId);
  if (!profile) {
    await revoke();
    return { ok: false, error: "Akun ini tidak terdaftar di aplikasi Zota Corp." };
  }
  if (!profile.is_active) {
    await revoke();
    return { ok: false, error: "Akun ini belum aktif atau sudah dinonaktifkan." };
  }

  const supabase = await createClient();
  const {
    data: { user: cur },
  } = await supabase.auth.getUser();
  if (cur?.id === newId) {
    await revoke();
    return { ok: false, error: "Akun ini sedang aktif." };
  }

  const {
    data: { session: curSession },
  } = await supabase.auth.getSession();
  const vault = (await readVault()).filter((e) => e.userId !== newId);
  const parked: VaultEntry[] =
    cur && curSession?.refresh_token
      ? [{ userId: cur.id, rt: curSession.refresh_token }, ...vault.filter((e) => e.userId !== cur.id)]
      : vault;
  if (parked.length > MAX_PARKED) {
    await revoke();
    return {
      ok: false,
      error: `Maksimal ${MAX_ACCOUNTS} akun di satu perangkat. Hapus salah satu akun tersimpan dulu.`,
    };
  }

  const { error: setErr } = await supabase.auth.setSession({
    access_token: verified.session.access_token,
    refresh_token: verified.session.refresh_token,
  });
  if (setErr) {
    await revoke();
    return { ok: false, error: "Gagal menambahkan akun. Coba lagi." };
  }

  await writeVault(parked);
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Hapus akun tersimpan: sesinya dicabut di server, bukan sekadar dilupakan. */
export async function removeSavedAccount(userId: string): Promise<ActionResult> {
  const vault = await readVault();
  const entry = vault.find((e) => e.userId === userId);
  if (!entry) return { ok: true };
  await revokeParked(entry);
  await writeVault(vault.filter((e) => e.userId !== userId));
  return { ok: true };
}

/** Keluar dari akun aktif DAN semua akun tersimpan di perangkat ini. */
export async function signOutAll() {
  const vault = await readVault();
  await Promise.all(vault.map(revokeParked));
  await writeVault([]);
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}
