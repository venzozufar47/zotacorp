"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Settings2, X } from "lucide-react";
import type {
  DividendRecipient,
  DividendBranchConfig,
} from "@/lib/actions/yeobo-dividend.actions";
import type {
  InvestorSummary,
  InvestorContract,
} from "@/lib/actions/investor.actions";
import { YeoboDividendStructureManager } from "../YeoboDividendStructureManager";

/**
 * "Aturan bagi hasil" sebagai drawer di tab Distribusi Bulanan, bukan tab
 * sendiri.
 *
 * Isinya adalah SETELAN dari konsol Distribusi: % manajemen sebelum/sesudah
 * BEP, slot penerima, dan penyambungan placeholder. Sebagai tab sejajar ia
 * tampak seperti alur kerja bulanan yang setara — padahal ia disentuh
 * beberapa kali setahun, sementara Distribusi dipakai tiap bulan. Menaruhnya
 * di drawer di atas konsol membuat hubungan itu terbaca: aturan ada di
 * belakang angka, bukan di sebelahnya.
 *
 * Porsi & nominal modal TIDAK bisa diubah di sini — itu milik kontrak
 * (SSOT). Drawer ini hanya mengatur yang bukan turunan.
 */
export function AturanBagiHasilDrawer({
  recipientsByBranch,
  configByBranch,
  investors,
  contracts,
}: {
  recipientsByBranch: Record<string, DividendRecipient[]>;
  configByBranch: Record<string, DividendBranchConfig>;
  investors: InvestorSummary[];
  contracts: InvestorContract[];
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  // Esc menutup drawer — ia menutupi konsol sepenuhnya di layar sempit, jadi
  // harus ada jalan keluar yang tidak menuntut mengincar tombol X.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const drawer = (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Aturan bagi hasil">
      <div
        className="absolute inset-0 bg-foreground/40"
        onClick={() => setOpen(false)}
      />
      <aside className="relative flex h-full w-full max-w-3xl flex-col border-l border-border bg-card shadow-xl animate-in fade-in-0 slide-in-from-right-8 duration-200">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-3.5">
          <div>
            <h2 className="font-display text-base font-bold">
              Aturan bagi hasil
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Rumus &amp; slot penerima yang dipakai konsol Distribusi. Nominal
              modal dan porsi % dibaca dari kontrak — ubah lewat tab{" "}
              <b>Daftar Investor</b>.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Tutup"
          >
            <X size={17} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <YeoboDividendStructureManager
            recipientsByBranch={recipientsByBranch}
            configByBranch={configByBranch}
            investors={investors}
            contracts={contracts}
          />
        </div>
      </aside>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg border border-border text-sm font-semibold hover:bg-muted"
      >
        <Settings2 size={14} /> Aturan bagi hasil
      </button>
      {mounted && open && createPortal(drawer, document.body)}
    </>
  );
}
