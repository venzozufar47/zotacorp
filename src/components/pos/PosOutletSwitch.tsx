"use client";

import { ArrowLeftRight } from "lucide-react";
import { posSwitchTarget } from "@/lib/pos/branch";
import { PosNavLink } from "./PosNavLink";

/**
 * Tombol bolak-balik Haengbocake Semarang ↔ Mamaya House di top bar POS. Keduanya satu shift & laci,
 * katalognya terpisah, jadi kasir cukup satu ketukan untuk pindah. Tidak tampil di cabang lain (Pare).
 */
export function PosOutletSwitch({ basePath }: { basePath: string }) {
  const target = posSwitchTarget(basePath.replace(/^\/pos/, ""));
  if (!target) return null;
  return (
    <PosNavLink
      href={target.href}
      className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-border bg-card text-foreground text-xs font-semibold shrink-0 hover:bg-muted"
      title={`Pindah ke ${target.label}`}
      aria-label={`Pindah ke ${target.label}`}
    >
      <ArrowLeftRight size={14} aria-hidden />
      {target.shortLabel}
    </PosNavLink>
  );
}
