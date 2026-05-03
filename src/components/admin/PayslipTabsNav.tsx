"use client";

import { useRouter, useSearchParams } from "next/navigation";

export type PayslipView = "variables" | "payments" | "bonus-cake";

interface Props {
  current: PayslipView;
}

export function PayslipTabsNav({ current }: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  function go(view: PayslipView) {
    const params = new URLSearchParams(sp.toString());
    params.set("view", view);
    router.push(`/admin/payslips/variables?${params.toString()}`);
  }

  const tabs: Array<{ key: PayslipView; label: string }> = [
    { key: "variables", label: "Variabel" },
    { key: "payments", label: "Pembayaran" },
    { key: "bonus-cake", label: "Bonus Cake" },
  ];

  return (
    <div className="inline-flex rounded-xl border-2 border-foreground bg-card p-1 gap-1">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => go(t.key)}
          className={
            "px-3 h-8 rounded-md text-xs font-display font-bold uppercase tracking-wider transition " +
            (current === t.key
              ? "bg-primary text-primary-foreground shadow-hard-sm"
              : "text-muted-foreground hover:bg-muted")
          }
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
