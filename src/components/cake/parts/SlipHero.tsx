"use client";

import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

interface Props {
  /** ISO date / Date the slip is for. */
  targetDate: Date;
  /** Day difference (target - today). Drives banner variant. */
  dayDiff: number;
  /** Branch label ("Pare" | "Semarang") shown in the count cell. */
  branchLabel: string;
  /** Count of cakes included in the slip. */
  count: number;
}

const VARIANT_BY_DIFF = (diff: number) => {
  if (diff < 0) {
    return {
      key: "late" as const,
      label: "Slip TANGGAL LAMPAU",
      sub: "Hati-hati — slip ini untuk hari yang sudah lewat.",
      bg: "linear-gradient(135deg, #FEE2E2 0%, #FCA5A5 100%)",
      borderColor: "#991B1B",
      ink: "#7F1D1D",
    };
  }
  if (diff === 0) {
    return {
      key: "today" as const,
      label: "Slip HARI INI",
      sub: "Slip ini untuk hari ini — verifikasi cepat, kue harus dipanggang sekarang.",
      bg: "linear-gradient(135deg, #D1FAE5 0%, #6EE7B7 100%)",
      borderColor: "#065F46",
      ink: "#064E3B",
    };
  }
  if (diff === 1) {
    return {
      key: "besok" as const,
      label: "Slip BESOK",
      sub: "Alur normal — siapkan untuk produksi besok pagi.",
      bg: "linear-gradient(135deg, #F4EEDD 0%, #FDE68A 100%)",
      borderColor: "#92400E",
      ink: "#78350F",
    };
  }
  return {
    key: "far" as const,
    label: "Slip lebih jauh",
    sub: "Slip ini untuk hari setelah besok — pastikan tidak salah membuka slip yang seharusnya besok.",
    bg: "linear-gradient(135deg, #EAE4F2 0%, #C4B5FD 100%)",
    borderColor: "#5B21B6",
    ink: "#4C1D95",
  };
};

const RELATIVE_LABEL = (diff: number): string => {
  if (diff < -1) return `${Math.abs(diff)} hari lalu`;
  if (diff === -1) return "Kemarin";
  if (diff === 0) return "Hari ini";
  if (diff === 1) return "Besok";
  return `${diff} hari lagi`;
};

/**
 * Hero banner above the slip controls. Color signals urgency: red for
 * past dates (dangerous to send), green for today (urgent), warm for
 * tomorrow (normal), purple for later (verify-twice).
 */
export function SlipHero({ targetDate, dayDiff, branchLabel, count }: Props) {
  const variant = VARIANT_BY_DIFF(dayDiff);
  const dateLong = format(targetDate, "EEEE, d MMMM", { locale: idLocale });
  const relative = RELATIVE_LABEL(dayDiff);

  return (
    <div
      className="rounded-2xl border-2 px-5 py-4 sm:px-6 sm:py-5 mb-4 flex flex-col sm:flex-row sm:items-center gap-4 sm:justify-between"
      style={{
        background: variant.bg,
        borderColor: variant.borderColor,
        color: variant.ink,
      }}
    >
      <div className="min-w-0 flex-1">
        <div className="text-[10.5px] font-bold uppercase tracking-[0.16em]" style={{ opacity: 0.85 }}>
          {variant.label}
        </div>
        <h2 className="text-[22px] sm:text-[26px] font-bold tracking-tight mt-0.5">
          {dateLong}
        </h2>
        <p className="text-[12.5px] mt-1 leading-snug" style={{ opacity: 0.85 }}>
          {variant.sub}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ opacity: 0.85 }}>
          Untuk
        </div>
        <div className="text-[24px] font-bold tracking-tight leading-none mt-1">
          {relative}
        </div>
        <div className="text-[11.5px] mt-1" style={{ opacity: 0.85 }}>
          {count} cake · {branchLabel}
        </div>
      </div>
    </div>
  );
}
