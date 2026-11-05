"use client";

import { createContext, useContext } from "react";

/**
 * Aksi top bar yang pemiliknya (POSClient) ada di luar slot shift.
 * `openStrukSettings` undefined = halaman ini tak punya setelan struk → item menu disembunyikan.
 */
interface PosTopbarActions {
  openStrukSettings?: () => void;
}

const PosTopbarContext = createContext<PosTopbarActions>({});

export const PosTopbarProvider = PosTopbarContext.Provider;

export function usePosTopbarActions(): PosTopbarActions {
  return useContext(PosTopbarContext);
}
