import type { CakeProductionSlipStatus } from "@/lib/cake-orders/types";

/**
 * One styling table for the slip lifecycle badge so the admin
 * dashboard, the admin slip preview, and the production team's lobby
 * can't drift apart.
 */
const STATUS_MAP: Record<
  CakeProductionSlipStatus,
  { label: string; cls: string }
> = {
  draft: {
    label: "Draft",
    cls: "bg-muted text-muted-foreground border-border",
  },
  verified: {
    label: "Diverifikasi",
    cls: "bg-tertiary/30 text-foreground border-foreground",
  },
  sent: {
    label: "Dikirim",
    cls: "bg-pop-emerald/20 text-foreground border-foreground",
  },
  received: {
    label: "Diterima",
    cls: "bg-card text-foreground border-foreground",
  },
  closed: {
    label: "Selesai",
    cls: "bg-pop-emerald/30 text-foreground border-foreground",
  },
};

export function SlipStatusBadge({
  status,
  emphasiseSent,
}: {
  status: CakeProductionSlipStatus;
  /** When true (production lobby), highlight 'sent' as a freshly-arrived slip. */
  emphasiseSent?: boolean;
}) {
  const m = STATUS_MAP[status];
  const label = emphasiseSent && status === "sent" ? "Dikirim — baru!" : m.label;
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${m.cls}`}
    >
      {label}
    </span>
  );
}
