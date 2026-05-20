"use client";

import Link from "next/link";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { ArrowLeft, Factory, ChevronRight } from "lucide-react";
import { SlipStatusBadge } from "@/components/cake/SlipStatusBadge";
import { BranchBadge } from "@/components/cake/BranchBadge";
import {
  SlipChecklist,
  type ProductionItem,
} from "@/components/cake/SlipChecklist";
import type {
  CakeProductionSlip,
  CakeProductionSlipStatus,
} from "@/lib/cake-orders/types";

interface DetailData {
  slip: CakeProductionSlip;
  items: ProductionItem[];
  myProductionRole: "baker" | "decorator" | null;
}

/**
 * Lobby halaman /cake-production. Pakai split view dua-kolom-kiri
 * (Pare + Semarang) + detail pane kanan untuk admin (hasOrders=true),
 * supaya admin bisa hop cepat antar slip tanpa kehilangan konteks
 * list. Untuk tim produksi (non-admin), kolom tunggal seperti
 * sebelumnya.
 *
 * Selection di-drive via `?slip=<id>` query param. Click card =
 * shallow router push, server re-render detail. Mobile <md: tetap
 * stack vertikal, click card → push `?slip=` lalu detail tampil di
 * bawah list (atau navigasi ke /cake-production/[slipId] kalau
 * admin mau full-screen).
 */
export function ProductionLobby({
  slips,
  isAdmin,
  selectedSlipId,
  detail,
  detailError,
}: {
  slips: CakeProductionSlip[];
  isAdmin: boolean;
  selectedSlipId: string | null;
  detail: DetailData | null;
  detailError: string | null;
}) {
  // Non-admin: single column lobby, click navigasi ke full-screen
  // detail page seperti sebelumnya. Layout split tidak relevan
  // karena tim produksi cuma lihat cabang sendiri.
  if (!isAdmin) {
    return (
      <div className="space-y-4">
        <LobbyHeader />
        {slips.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="space-y-2">
            {slips.map((s) => (
              <li key={s.id}>
                <SlipCard slip={s} href={`/cake-production/${s.id}`} />
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // Admin: split view. Card di list set `?slip=<id>` — server
  // re-render dengan detail di pane kanan.
  const pareSlips = slips.filter((s) => s.branch === "pare");
  const semarangSlips = slips.filter((s) => s.branch === "semarang");

  return (
    <div className="space-y-4">
      <LobbyHeader />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_2fr] gap-3">
        <Column
          title="Pare"
          slips={pareSlips}
          selectedSlipId={selectedSlipId}
        />
        <Column
          title="Semarang"
          slips={semarangSlips}
          selectedSlipId={selectedSlipId}
        />

        {/* Detail pane — lg+ render in-place, mobile/tablet fallback
            di bawah dua kolom karena grid stack ke 1 kolom. */}
        <div className="min-w-0">
          {detail ? (
            <div className="rounded-2xl border-2 border-foreground bg-card p-3 sm:p-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
              <SlipChecklist
                slip={detail.slip}
                items={detail.items}
                myProductionRole={detail.myProductionRole}
              />
            </div>
          ) : detailError ? (
            <div className="rounded-2xl border-2 border-destructive/40 bg-destructive/5 p-6 text-center text-sm text-destructive">
              {detailError}
            </div>
          ) : (
            <div className="rounded-2xl border-2 border-dashed border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground lg:sticky lg:top-4">
              <Factory size={28} className="mx-auto mb-2" strokeWidth={2} />
              <p>Pilih satu slip dari daftar kiri untuk lihat detailnya.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LobbyHeader() {
  return (
    <header className="flex items-center gap-2">
      <Link
        href="/dashboard"
        className="rounded-full p-1.5 hover:bg-muted text-muted-foreground"
        aria-label="Kembali ke dashboard"
      >
        <ArrowLeft size={16} strokeWidth={2.5} />
      </Link>
      <span className="flex items-center justify-center size-9 rounded-full bg-tertiary text-foreground border-2 border-foreground shrink-0">
        <Factory size={16} strokeWidth={2.5} />
      </span>
      <div className="min-w-0 flex-1">
        <h1 className="text-base sm:text-lg font-semibold text-foreground leading-tight">
          Produksi Cake
        </h1>
        <p className="text-[11px] text-muted-foreground leading-snug">
          Slip pesanan yang sudah diverifikasi admin.
        </p>
      </div>
    </header>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border-2 border-dashed border-border bg-card p-8 text-center text-muted-foreground">
      <Factory size={28} className="mx-auto" strokeWidth={2} />
      <p className="text-sm mt-2">Belum ada slip masuk.</p>
    </div>
  );
}

function Column({
  title,
  slips,
  selectedSlipId,
}: {
  title: string;
  slips: CakeProductionSlip[];
  selectedSlipId: string | null;
}) {
  return (
    <div className="min-w-0">
      <h2 className="text-[10px] uppercase tracking-[0.16em] font-bold text-muted-foreground px-1 mb-2">
        {title}{" "}
        <span className="text-muted-foreground/60 tabular-nums">
          · {slips.length}
        </span>
      </h2>
      {slips.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-border bg-card/50 p-4 text-center text-xs text-muted-foreground">
          Tidak ada slip {title}.
        </div>
      ) : (
        <ul className="space-y-2">
          {slips.map((s) => {
            const selected = s.id === selectedSlipId;
            return (
              <li key={s.id}>
                <SlipCard
                  slip={s}
                  href={`/cake-production?slip=${s.id}`}
                  selected={selected}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SlipCard({
  slip,
  href,
  selected = false,
}: {
  slip: CakeProductionSlip;
  href: string;
  selected?: boolean;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      className={`flex items-center gap-3 rounded-2xl border-2 p-3 transition-colors ${
        selected
          ? "border-foreground bg-primary/10"
          : "border-foreground bg-card hover:bg-muted/30"
      }`}
      aria-current={selected ? "true" : undefined}
    >
      <span className="flex items-center justify-center size-12 rounded-xl bg-pop-pink/30 text-foreground border-2 border-foreground shrink-0 font-display font-bold text-xs leading-tight text-center">
        {format(new Date(`${slip.target_date}T00:00:00`), "d MMM", {
          locale: idLocale,
        })}
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-foreground text-sm flex items-center gap-1.5 flex-wrap">
          {format(
            new Date(`${slip.target_date}T00:00:00`),
            "EEE, d MMM yyyy",
            { locale: idLocale }
          )}
          <BranchBadge branch={slip.branch} size="xs" />
        </div>
        <div className="mt-0.5">
          <SlipStatusBadge
            status={slip.status as CakeProductionSlipStatus}
            emphasiseSent
          />
        </div>
      </div>
      <ChevronRight size={16} className="text-muted-foreground shrink-0" />
    </Link>
  );
}
