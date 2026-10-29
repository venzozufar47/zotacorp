import { AlertTriangle, CheckCircle2, CircleDashed, XCircle, type LucideIcon } from "lucide-react";

/**
 * Gaya ubin scorecard bersama (scorecard cabang di beranda dan scorecard sosmed): gradasi searah gelap → terang seperti
 * banner sapaan, bayangan lembut berwarna status, dan label status berikon (warna bukan satu-satunya penanda).
 * Merah dan hijau sengaja sedikit lebih gelap dari warna sistem supaya scorecard jelas tetapi tidak mengalahkan banner.
 */
export type TileTone = "green" | "yellow" | "red" | "neutral";

export const TILE_STYLE: Record<TileTone, { Icon: LucideIcon; tile: string; chip: string }> = {
  green: {
    Icon: CheckCircle2,
    tile: "bg-gradient-to-br from-[color-mix(in_srgb,var(--success)_58%,black)] to-[color-mix(in_srgb,var(--success)_80%,black)] text-white shadow-[0_8px_18px_-10px_color-mix(in_srgb,var(--success)_80%,black)]",
    chip: "bg-white/20 text-white",
  },
  yellow: {
    Icon: AlertTriangle,
    tile: "bg-gradient-to-br from-[color-mix(in_srgb,var(--warning)_92%,white)] to-warning text-foreground shadow-[0_8px_18px_-10px_var(--warning)]",
    chip: "bg-black/10 text-foreground",
  },
  red: {
    Icon: XCircle,
    tile: "bg-gradient-to-br from-[color-mix(in_srgb,var(--destructive)_66%,black)] to-[color-mix(in_srgb,var(--destructive)_90%,black)] text-white shadow-[0_8px_18px_-10px_color-mix(in_srgb,var(--destructive)_85%,black)]",
    chip: "bg-white/20 text-white",
  },
  neutral: { Icon: CircleDashed, tile: "bg-muted text-muted-foreground", chip: "bg-black/5 text-muted-foreground" },
};
