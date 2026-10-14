"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmployeeAvatar } from "@/components/shared/EmployeeAvatar";
import {
  listSavedAccounts,
  removeSavedAccount,
  switchAccount,
  type SavedAccount,
} from "@/lib/actions/accounts.actions";
import { rebindPushToCurrentUser } from "@/lib/push/rebind";
import { announceAccountSwitch } from "@/lib/auth/switch-sync";

function roleLabel(role: string | null): string {
  if (role === "admin") return "Admin";
  if (role === "investor") return "Investor";
  return "Karyawan";
}

/**
 * "Pilih akun" di halaman login: akun yang tersimpan di perangkat ini
 * (lihat `account-vault.ts`). Ketuk = masuk tanpa password.
 * `onEmpty` dipanggil bila tidak (lagi) ada akun yang valid → tampilkan form biasa.
 */
export function SavedAccountsChooser({
  onUseOther,
  onEmpty,
}: {
  onUseOther: () => void;
  onEmpty: () => void;
}) {
  const [accounts, setAccounts] = useState<SavedAccount[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const onEmptyRef = useRef(onEmpty);
  useEffect(() => {
    onEmptyRef.current = onEmpty;
  });

  async function load() {
    const res = await listSavedAccounts();
    const list = res.ok && res.data ? res.data.saved : [];
    setAccounts(list);
    if (list.length === 0) onEmptyRef.current();
  }

  useEffect(() => {
    let alive = true;
    listSavedAccounts().then((res) => {
      if (!alive) return;
      const list = res.ok && res.data ? res.data.saved : [];
      setAccounts(list);
      if (list.length === 0) onEmptyRef.current();
    });
    return () => {
      alive = false;
    };
  }, []);

  async function onPick(id: string) {
    if (busyId) return;
    setBusyId(id);
    const res = await switchAccount(id);
    if (!res.ok) {
      toast.error(res.error);
      setBusyId(null);
      await load();
      return;
    }
    await rebindPushToCurrentUser();
    announceAccountSwitch();
    window.location.assign("/");
  }

  async function onRemove(acc: SavedAccount) {
    if (busyId) return;
    const name = acc.fullName ?? acc.email ?? "akun ini";
    if (!window.confirm(`Hapus ${name} dari perangkat ini? Login lagi butuh password.`)) return;
    setBusyId(acc.userId);
    await removeSavedAccount(acc.userId);
    setBusyId(null);
    await load();
  }

  if (accounts === null) {
    return (
      <div className="space-y-2" aria-busy="true">
        <div className="h-14 animate-pulse rounded-xl bg-muted" />
        <div className="h-14 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-muted-foreground">Pilih akun untuk masuk</p>
      <ul className="space-y-1.5">
        {accounts.map((acc) => {
          const busy = busyId === acc.userId;
          return (
            <li
              key={acc.userId}
              className="flex items-center gap-1 rounded-xl border-2 border-border hover:border-foreground/40"
            >
              <button
                type="button"
                onClick={() => onPick(acc.userId)}
                disabled={!!busyId}
                className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2 text-left disabled:opacity-60"
              >
                <EmployeeAvatar
                  id={acc.userId}
                  full_name={acc.fullName}
                  avatar_url={acc.avatarUrl}
                  avatar_seed={acc.avatarSeed}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold leading-tight">
                    {acc.fullName ?? acc.email}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {roleLabel(acc.role)}
                    {acc.email ? ` · ${acc.email}` : ""}
                  </span>
                </span>
                {busy && <Loader2 size={16} className="shrink-0 animate-spin text-muted-foreground" />}
              </button>
              <button
                type="button"
                onClick={() => onRemove(acc)}
                disabled={!!busyId}
                className="mr-1 flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-60"
                aria-label={`Hapus ${acc.fullName ?? "akun"} dari perangkat ini`}
                title="Hapus dari perangkat ini"
              >
                <Trash2 size={15} />
              </button>
            </li>
          );
        })}
      </ul>
      <Button type="button" variant="outline" size="lg" className="w-full" onClick={onUseOther} disabled={!!busyId}>
        Gunakan akun lain
      </Button>
    </div>
  );
}
