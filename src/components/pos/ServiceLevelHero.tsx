"use client";

import Link, { useLinkStatus } from "next/link";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { ServiceLevelSummary } from "@/lib/actions/pos-service-level.actions";

/**
 * Kartu Service Level — dipakai di layar kasir (`compact`) dan di
 * halaman detail / cek shift (`hero`).
 *
 * "use client" karena varian `compact`-ber-href butuh `useLinkStatus`
 * untuk spinner loading (lihat `CompactLinkPending` di bawah) — hook itu
 * cuma jalan di dalam pohon `<Link>`. Tidak ada regresi bundle: file ini
 * cuma pernah dipakai langsung dari `POSClient.tsx` yang sudah
 * "use client", jadi sudah lama ikut ter-bundle ke client apa pun
 * anotasinya sendiri.
 *
 * PALET: layar POS meng-override palet jadi pink lewat `data-pos-palette`.
 * Pakai token semantik saja — `bg-primary`, `text-success` — JANGAN hex,
 * kalau tidak warnanya akan menyimpang dari tema POS.
 */

/**
 * Spinner navigasi. HARUS jadi descendant `<Link>` — dipanggil hanya saat
 * `href` terisi (lihat pemakaian di bawah), sesuai syarat `useLinkStatus`.
 *
 * Slot ikonnya SELALU dirender di ukuran tetap, cuma opacity yang
 * berubah — anjuran dokumentasi Next sendiri: indikator inline gampang
 * menggeser layout kalau elemennya cuma muncul saat pending.
 */
function CompactLinkPending() {
  const { pending } = useLinkStatus();
  return (
    <Loader2
      size={11}
      aria-hidden
      className={`shrink-0 animate-spin text-muted-foreground transition-opacity duration-150 ${
        pending ? "opacity-100" : "opacity-0"
      }`}
    />
  );
}

function tone(pct: number | null): {
  text: string;
  border: string;
  bg: string;
} {
  if (pct === null)
    return { text: "text-muted-foreground", border: "border-border", bg: "bg-card" };
  if (pct >= 0.95)
    return { text: "text-success", border: "border-success/40", bg: "bg-success/10" };
  if (pct >= 0.85)
    return { text: "text-warning", border: "border-warning/40", bg: "bg-warning/10" };
  return {
    text: "text-destructive",
    border: "border-destructive/40",
    bg: "bg-destructive/10",
  };
}

export function ServiceLevelHero({
  summary,
  size = "compact",
  href,
  days = 30,
}: {
  summary: ServiceLevelSummary;
  size?: "hero" | "compact";
  href?: string;
  days?: number;
}) {
  const pct = summary.percent;
  const t = tone(pct);
  const label = pct === null ? "—" : `${(pct * 100).toFixed(1)}%`;
  const belum = summary.daysCounted === 0;

  if (size === "compact") {
    const inner = (
      <div
        className={`flex items-center gap-3 rounded-2xl border-2 border-foreground ${t.bg} px-3 py-2 shadow-[3px_3px_0_0_var(--foreground)]`}
      >
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Service Level · {days} hari
            {href && <CompactLinkPending />}
          </p>
          <p className={`font-display text-2xl font-extrabold tabular-nums leading-none ${t.text}`}>
            {label}
          </p>
        </div>
        <p className="ml-auto text-right text-[11px] text-muted-foreground">
          {belum ? (
            "belum ada data"
          ) : (
            <>
              target 100%
              <br />
              {summary.lostSkuHours.toLocaleString("id-ID")} SKU-jam kosong
            </>
          )}
        </p>
      </div>
    );
    return href ? (
      <Link href={href} className="block">
        {inner}
      </Link>
    ) : (
      inner
    );
  }

  return (
    <div className="rounded-3xl border-2 border-foreground bg-card p-6 sm:p-8 shadow-[4px_4px_0_0_var(--foreground)]">
      <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Service Level · {days} hari
      </p>
      <p
        className={`font-display text-5xl sm:text-6xl font-extrabold tabular-nums leading-none mt-2 ${t.text}`}
      >
        {label}
      </p>
      <p className="mt-3 text-sm text-muted-foreground">
        {belum ? (
          "Belum ada data terhitung — snapshot berjalan tiap jam."
        ) : (
          <>
            Target 100% · {summary.daysCounted} hari terhitung ·{" "}
            {summary.lostSkuHours.toLocaleString("id-ID")} SKU-jam kosong
          </>
        )}
      </p>
      {/* Peringatan dibatasi ~65 karakter per baris; tanpa max-w teksnya
          membentang selebar kartu dan jadi sulit dibaca di layar lebar. */}
      {(summary.hasPartialOpname || summary.hasBackfill) && (
        <div className="mt-4 space-y-2 border-t border-border pt-3">
          {summary.hasPartialOpname && (
            <p className="flex max-w-prose items-start gap-2 text-[11px] leading-relaxed text-warning">
              <AlertTriangle size={13} className="mt-px shrink-0" />
              <span>
                Ada hari dengan opname parsial — SKU yang tidak ikut dihitung
                saat opname terbaca habis, jadi angkanya bisa tertekan semu.
              </span>
            </p>
          )}
          {summary.hasBackfill && (
            <p className="flex max-w-prose items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
              <AlertTriangle size={13} className="mt-px shrink-0" />
              <span>
                Sebagian hari dihitung mundur — penyebutnya memakai katalog
                hari ini, jadi tidak sebanding dengan hari yang benar-benar
                terukur.
              </span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
