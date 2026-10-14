"use client";

import { useEffect, useState } from "react";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { ChevronLeft, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { EmployeeAvatar } from "@/components/shared/EmployeeAvatar";
import {
  addAccount,
  listSavedAccounts,
  removeSavedAccount,
  signOutAll,
  switchAccount,
  type SavedAccount,
} from "@/lib/actions/accounts.actions";
import { rebindPushToCurrentUser } from "@/lib/push/rebind";
import { announceAccountSwitch } from "@/lib/auth/switch-sync";
import { MAX_ACCOUNTS } from "@/lib/auth/account-limits";

export interface SwitcherViewer {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  avatar_seed: string | null;
  email?: string | null;
}

function roleLabel(role: string | null | undefined): string {
  if (role === "admin") return "Admin";
  if (role === "investor") return "Investor";
  return "Karyawan";
}

function RoleChip({ role }: { role: string | null | undefined }) {
  return (
    <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
      {roleLabel(role)}
    </span>
  );
}

/**
 * Bagian "akun" di menu profil: akun aktif, akun tersimpan di perangkat ini
 * (ketuk = pindah tanpa password), dan "Tambah akun" (login inline).
 * Dipasang di tiap menu (karyawan, admin, investor); dimuat saat menu dibuka.
 *
 * Pindah akun = hard navigation ke "/" — membersihkan Router Cache, channel
 * Realtime, dan membiarkan proxy mengarahkan ke home sesuai peran akun baru.
 */
export function AccountSwitcher({
  me,
  className,
}: {
  me: SwitcherViewer;
  className?: string;
}) {
  const [view, setView] = useState<"list" | "add">("list");
  const [data, setData] = useState<{ current: SavedAccount | null; saved: SavedAccount[] } | null>(
    null
  );
  const [busyId, setBusyId] = useState<string | null>(null);

  async function reload() {
    const res = await listSavedAccounts();
    if (res.ok && res.data) setData(res.data);
  }

  useEffect(() => {
    let alive = true;
    listSavedAccounts().then((res) => {
      if (alive && res.ok && res.data) setData(res.data);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function finishSwitch() {
    await rebindPushToCurrentUser();
    announceAccountSwitch();
    window.location.assign("/");
  }

  async function onSwitch(id: string) {
    if (busyId) return;
    setBusyId(id);
    const res = await switchAccount(id);
    if (!res.ok) {
      toast.error(res.error);
      setBusyId(null);
      await reload();
      return;
    }
    await finishSwitch();
  }

  async function onRemove(acc: SavedAccount) {
    if (busyId) return;
    const name = acc.fullName ?? acc.email ?? "akun ini";
    if (!window.confirm(`Hapus ${name} dari perangkat ini? Sesinya akan dicabut; login lagi butuh password.`))
      return;
    setBusyId(acc.userId);
    await removeSavedAccount(acc.userId);
    setBusyId(null);
    toast.success("Akun dihapus dari perangkat ini");
    await reload();
  }

  if (view === "add") {
    return (
      <AddAccountForm
        className={className}
        onBack={() => setView("list")}
        onDone={finishSwitch}
      />
    );
  }

  const current = data?.current;
  const saved = data?.saved ?? [];
  // Total akun = 1 aktif + tersimpan; sembunyikan "Tambah" bila sudah penuh.
  const full = saved.length + 1 >= MAX_ACCOUNTS;

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center gap-3 px-3 py-2">
        <EmployeeAvatar
          id={me.id}
          full_name={me.full_name}
          avatar_url={me.avatar_url}
          avatar_seed={me.avatar_seed}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight">{me.full_name ?? "Akun saya"}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {current?.email ?? me.email ?? "Sedang aktif"}
          </p>
        </div>
        {current && <RoleChip role={current.role} />}
      </div>

      {data === null ? (
        <div className="px-3 py-2">
          <div className="h-9 animate-pulse rounded-xl bg-muted" />
        </div>
      ) : (
        saved.length > 0 && (
          <ul className="space-y-0.5" aria-label="Akun tersimpan">
            {saved.map((acc) => {
              const busy = busyId === acc.userId;
              return (
                <li key={acc.userId} className="flex items-center gap-1 rounded-xl hover:bg-muted">
                  <button
                    type="button"
                    onClick={() => onSwitch(acc.userId)}
                    disabled={!!busyId}
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-1.5 text-left disabled:opacity-60"
                    aria-label={`Pindah ke ${acc.fullName ?? acc.email ?? "akun"}`}
                  >
                    <EmployeeAvatar
                      size="sm"
                      id={acc.userId}
                      full_name={acc.fullName}
                      avatar_url={acc.avatarUrl}
                      avatar_seed={acc.avatarSeed}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium leading-tight">
                        {acc.fullName ?? acc.email}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {roleLabel(acc.role)}
                      </span>
                    </span>
                    {busy && <Loader2 size={15} className="shrink-0 animate-spin text-muted-foreground" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(acc)}
                    disabled={!!busyId}
                    className="mr-1 flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-60"
                    aria-label={`Hapus ${acc.fullName ?? "akun"} dari perangkat ini`}
                    title="Hapus dari perangkat ini"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        )
      )}

      {!full && (
        <button
          type="button"
          onClick={() => setView("add")}
          disabled={!!busyId}
          className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-1.5 text-left text-sm font-medium hover:bg-muted disabled:opacity-60"
        >
          <span className="flex size-7 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/60 text-muted-foreground">
            <Plus size={14} />
          </span>
          Tambah akun
        </button>
      )}

      {saved.length > 0 && (
        <form action={signOutAll} className="px-1">
          <button
            type="submit"
            className="w-full rounded-lg px-2 py-1.5 text-left text-[11.5px] text-muted-foreground hover:text-destructive"
          >
            Keluar dari semua akun
          </button>
        </form>
      )}
    </div>
  );
}

function AddAccountForm({
  className,
  onBack,
  onDone,
}: {
  className?: string;
  onBack: () => void;
  onDone: () => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "").trim();
    const password = String(fd.get("password") ?? "");
    if (!email || !password) {
      setError("Isi email dan password.");
      return;
    }
    setLoading(true);
    try {
      // Login di klien SEMENTARA (memori, storageKey sendiri) supaya sesi akun
      // aktif tidak tersentuh dan rate-limit Supabase tetap per IP pengguna.
      const temp = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
            storageKey: "zota-add-account-temp",
          },
        }
      );
      const { data, error: signInErr } = await temp.auth.signInWithPassword({ email, password });
      if (signInErr || !data.session) {
        setError(
          signInErr?.message === "Invalid login credentials"
            ? "Email atau password salah."
            : (signInErr?.message ?? "Gagal login.")
        );
        setLoading(false);
        return;
      }
      const res = await addAccount({
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
      });
      if (!res.ok) {
        // Sesi sementara tak terpakai — cabut supaya tidak menggantung di server.
        await temp.auth.signOut({ scope: "local" }).catch(() => {});
        setError(res.error);
        setLoading(false);
        return;
      }
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menambahkan akun.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className={cn("space-y-3 px-3 py-2", className)}>
      <button
        type="button"
        onClick={onBack}
        disabled={loading}
        className="-ml-1 flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft size={14} /> Kembali
      </button>
      <div>
        <p className="text-sm font-semibold leading-tight">Tambah akun</p>
        <p className="text-[11px] leading-snug text-muted-foreground">
          Akun tersimpan di perangkat ini. Hapus bila perangkat dipakai bersama.
        </p>
      </div>
      <Input
        name="email"
        type="email"
        autoComplete="off"
        placeholder="Email"
        aria-label="Email akun"
        required
        disabled={loading}
      />
      <PasswordInput
        name="password"
        autoComplete="off"
        placeholder="Password"
        aria-label="Password akun"
        required
        disabled={loading}
      />
      {error && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={loading}
        className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
      >
        {loading && <Loader2 size={15} className="animate-spin" />}
        Masuk &amp; tambahkan
      </button>
    </form>
  );
}
