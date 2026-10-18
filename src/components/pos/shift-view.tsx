import "server-only";

import type { ReactNode } from "react";
import { isPosUsable, loadPosGate, type PosGate } from "@/lib/pos/shift-gate";
import { PosLockedScreen } from "./PosLockedScreen";
import { PosShiftControls } from "./PosShiftControls";

const WIB = "Asia/Jakarta";

function hhmm(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: WIB }).format(
    new Date(iso)
  );
}

function dayAndTime(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: WIB,
  }).format(new Date(iso));
}

export interface PosShiftView {
  gate: PosGate;
  /** false → tampilkan `locked` (halaman utama) atau redirect (sub-halaman). */
  usable: boolean;
  /** Layar kunci siap render (hanya bila !usable). */
  locked: ReactNode | null;
  /** Pengganti pill "Shift aktif" di top bar: undefined = tampilan lama (mode shift mati). */
  shiftSlot: ReactNode | null | undefined;
  /** Nama kasir untuk struk bila mode shift menyala; undefined = aturan lama. */
  fixedCashierName: string | undefined;
}

/** Gabungan gerbang kunci + elemen UI-nya untuk satu halaman POS. */
export async function resolvePosShiftView(args: {
  bankAccountId: string;
  accountName: string;
  basePath: string;
  userId: string;
  isAdmin: boolean;
}): Promise<PosShiftView> {
  const { bankAccountId, accountName, basePath, userId, isAdmin } = args;
  const gate = await loadPosGate(bankAccountId, userId);

  if (gate.mode === "off") {
    return { gate, usable: true, locked: null, shiftSlot: undefined, fixedCashierName: undefined };
  }

  if (gate.mode === "shift") {
    return {
      gate,
      usable: true,
      locked: null,
      fixedCashierName: gate.cashierName,
      shiftSlot: (
        <PosShiftControls
          mode="shift"
          bankAccountId={bankAccountId}
          accountName={accountName}
          basePath={basePath}
          cashier={{ id: gate.cashierId, name: gate.cashierName }}
          openedAtLabel={hhmm(gate.openedAt)}
          isAdmin={isAdmin}
        />
      ),
    };
  }

  if (gate.mode === "incidental") {
    return {
      gate,
      usable: true,
      locked: null,
      fixedCashierName: gate.userName,
      shiftSlot: (
        <PosShiftControls
          mode="incidental"
          bankAccountId={bankAccountId}
          accountName={accountName}
          basePath={basePath}
          userName={gate.userName}
          isAdmin={isAdmin}
        />
      ),
    };
  }

  const locked =
    gate.mode === "stale" ? (
      <PosLockedScreen
        mode="stale"
        bankAccountId={bankAccountId}
        accountName={accountName}
        basePath={basePath}
        isAdmin={isAdmin}
        stale={{
          cashierId: gate.cashierId,
          cashierName: gate.cashierName,
          openedAtLabel: dayAndTime(gate.openedAt),
        }}
      />
    ) : (
      <PosLockedScreen
        mode="locked"
        bankAccountId={bankAccountId}
        accountName={accountName}
        basePath={basePath}
        isAdmin={isAdmin}
      />
    );
  return {
    gate,
    usable: isPosUsable(gate),
    locked,
    shiftSlot: null,
    fixedCashierName: undefined,
  };
}
