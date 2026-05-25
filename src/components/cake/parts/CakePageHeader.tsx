"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

interface Props {
  /** Optional back href. Renders an ArrowLeft button. */
  backHref?: string;
  onBack?: () => void;
  /** Colored icon tile to the left of the title. */
  icon: ReactNode;
  /** Small eyebrow text above the title. */
  eyebrow?: string;
  title: ReactNode;
  /** Sub text below the title. */
  sub?: ReactNode;
  /** Right-aligned action cluster (buttons / status pills). */
  actions?: ReactNode;
  /** Override the icon tile gradient + colors. Defaults match the
   *  design's pink/cake variant. Pass distinct values for slip (amber)
   *  and archive (slate) to match the design. */
  iconStyle?: {
    background?: string;
    borderColor?: string;
    color?: string;
  };
}

/**
 * Reusable page header used by all Haengbocake admin pages
 * (kanban, slip, archive). Mirrors the design's `.page-header`
 * pattern: back button + icon tile + title block + actions.
 */
export function CakePageHeader({
  backHref,
  onBack,
  icon,
  eyebrow,
  title,
  sub,
  actions,
  iconStyle,
}: Props) {
  const defaultIconStyle: React.CSSProperties = {
    background: "linear-gradient(140deg, #FFE4F1 0%, #F472B6 100%)",
    borderColor: "#831843",
    color: "#831843",
  };
  const mergedIconStyle: React.CSSProperties = {
    ...defaultIconStyle,
    ...iconStyle,
  };

  const backBtn = backHref ? (
    <Link
      href={backHref}
      aria-label="Kembali"
      className="grid place-items-center size-9 shrink-0 rounded-xl border-2 hover:bg-[var(--cake-bg-elev)] transition-colors"
      style={{ borderColor: "var(--cake-border)", color: "var(--cake-fg)" }}
    >
      <ArrowLeft size={16} strokeWidth={2.5} />
    </Link>
  ) : onBack ? (
    <button
      type="button"
      onClick={onBack}
      aria-label="Kembali"
      className="grid place-items-center size-9 shrink-0 rounded-xl border-2 hover:bg-[var(--cake-bg-elev)] transition-colors"
      style={{ borderColor: "var(--cake-border)", color: "var(--cake-fg)" }}
    >
      <ArrowLeft size={16} strokeWidth={2.5} />
    </button>
  ) : null;

  return (
    <header className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3 min-w-0 flex-1">
        {backBtn}
        <div
          className="grid place-items-center size-11 shrink-0 rounded-xl border-2"
          style={mergedIconStyle}
        >
          {icon}
        </div>
        <div className="min-w-0 leading-tight">
          {eyebrow && (
            <div
              className="text-[10.5px] font-semibold uppercase tracking-[0.12em] mb-1"
              style={{ color: "var(--cake-muted)" }}
            >
              {eyebrow}
            </div>
          )}
          <h1
            className="text-[20px] sm:text-[22px] font-bold tracking-tight truncate"
            style={{ color: "var(--cake-fg)" }}
          >
            {title}
          </h1>
          {sub && (
            <p className="text-[12.5px] mt-0.5" style={{ color: "var(--cake-fg-soft)" }}>
              {sub}
            </p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap sm:shrink-0">
          {actions}
        </div>
      )}
    </header>
  );
}

/**
 * Action button styled to match design's `.btn` neutral variant.
 * Used in CakePageHeader's action cluster. Wraps Link for href, else
 * a plain button.
 */
export function CakeHeaderButton({
  href,
  onClick,
  icon,
  children,
  variant = "default",
}: {
  href?: string;
  onClick?: () => void;
  icon?: ReactNode;
  children?: ReactNode;
  variant?: "default" | "primary";
}) {
  const style: React.CSSProperties =
    variant === "primary"
      ? {
          background: "var(--cake-primary)",
          color: "var(--cake-primary-fg)",
          borderColor: "var(--cake-primary)",
        }
      : {
          background: "var(--cake-surface)",
          color: "var(--cake-fg)",
          borderColor: "var(--cake-border)",
        };
  const className =
    "inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border-2 text-[12.5px] font-medium hover:opacity-90 transition-opacity";

  if (href) {
    return (
      <Link href={href} className={className} style={style}>
        {icon}
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className} style={style}>
      {icon}
      {children}
    </button>
  );
}
