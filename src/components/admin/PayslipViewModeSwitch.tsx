"use client";

import Link from "next/link";
import { User, Sliders } from "lucide-react";

type Mode = "employee" | "variable";

interface Props {
  current: Mode;
}

/**
 * Big segmented toggle untuk switch antara dua paradigma payslip:
 * employee-based (per-orang detail) vs variable-based (lintas karyawan
 * per variabel). Ini fitur utama, bukan link kecil — diberi visual
 * weight setara header.
 */
export function ViewModeSwitch({ current }: Props) {
  return (
    <section className="rounded-2xl border-2 border-foreground bg-card p-1.5 shadow-hard-sm">
      <div className="grid grid-cols-2 gap-1.5">
        <ModeTile
          href="/admin/payslips"
          active={current === "employee"}
          icon={<User size={18} />}
          label="Per karyawan"
          desc="Drill detail satu orang — settings, deliverables, payslip bulanan"
        />
        <ModeTile
          href="/admin/payslips/variables"
          active={current === "variable"}
          icon={<Sliders size={18} />}
          label="Per variabel"
          desc="Edit satu variabel lintas semua karyawan dalam satu tabel"
        />
      </div>
    </section>
  );
}

function ModeTile({
  href,
  active,
  icon,
  label,
  desc,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
  desc: string;
}) {
  const base =
    "flex items-start gap-3 rounded-xl p-3 transition-colors text-left border-2";
  if (active) {
    return (
      <div
        className={
          base +
          " border-foreground bg-primary text-primary-foreground shadow-hard cursor-default"
        }
      >
        <span className="shrink-0 mt-0.5">{icon}</span>
        <div className="min-w-0">
          <p className="font-display font-extrabold uppercase tracking-wider text-sm">
            {label}
          </p>
          <p className="text-[11px] opacity-90 leading-snug mt-0.5">{desc}</p>
        </div>
      </div>
    );
  }
  return (
    <Link
      href={href}
      className={
        base +
        " border-transparent hover:border-border bg-muted/40 text-foreground hover:bg-muted"
      }
    >
      <span className="shrink-0 mt-0.5 text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <p className="font-display font-bold uppercase tracking-wider text-sm">
          {label}
        </p>
        <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
          {desc}
        </p>
      </div>
    </Link>
  );
}
