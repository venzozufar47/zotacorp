"use client";

import { useRouter, useSearchParams } from "next/navigation";

export type CakeOrdersTab = "orders" | "finance" | "archive" | "production";

interface Props {
  current: CakeOrdersTab;
}

/**
 * Tab switcher for the admin cake-orders page: kanban board ("Order"),
 * the read-only production board + slip checklist ("Produksi" — reuses
 * ProductionLobby/SlipChecklist from the employee /cake-production
 * flow, see admin/cake-orders/page.tsx), the finance recap ("Finance"),
 * and the archive. Mirrors PayslipTabsNav — toggles the `?tab=` search
 * param while preserving any other params (month, year, slip) so
 * switching back and forth keeps the chosen period/selection.
 */
export function CakeOrdersTabsNav({ current }: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  function go(tab: CakeOrdersTab) {
    const params = new URLSearchParams(sp.toString());
    params.set("tab", tab);
    router.push(`/admin/cake-orders?${params.toString()}`);
  }

  const tabs: Array<{ key: CakeOrdersTab; label: string }> = [
    { key: "orders", label: "Order" },
    { key: "production", label: "Produksi" },
    { key: "finance", label: "Finance" },
    { key: "archive", label: "Arsip" },
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
