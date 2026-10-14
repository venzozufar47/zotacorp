"use client";

import { useEffect } from "react";
import { ACCOUNT_SWITCH_KEY } from "@/lib/auth/switch-sync";

/** Memuat ulang tab ini bila akun diganti di tab lain (lihat `switch-sync.ts`). */
export function AccountSwitchSync() {
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === ACCOUNT_SWITCH_KEY && e.newValue) window.location.reload();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return null;
}
