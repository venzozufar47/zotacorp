import { cn } from "@/lib/utils";
import {
  BOOKING_STATUS_LABEL,
  CANCELLATION_KIND_LABEL,
  PAYMENT_STATUS_LABEL,
  type BookingStatus,
  type CancellationKind,
  type PaymentStatus,
} from "@/lib/yeobo-booth/types";

const BOOKING_TONE: Record<BookingStatus, string> = {
  scheduled: "bg-primary/10 text-primary border-primary/30",
  ongoing: "bg-accent/15 text-accent-foreground border-accent/40",
  completed: "bg-muted text-foreground/70 border-border",
  cancelled: "bg-destructive/10 text-destructive border-destructive/30",
};

const PAYMENT_TONE: Record<PaymentStatus, string> = {
  belum_bayar: "bg-destructive/10 text-destructive border-destructive/30",
  dp: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-700",
  lunas: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-700",
};

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-full border",
        BOOKING_TONE[status]
      )}
    >
      {BOOKING_STATUS_LABEL[status]}
    </span>
  );
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-full border",
        PAYMENT_TONE[status]
      )}
    >
      {PAYMENT_STATUS_LABEL[status]}
    </span>
  );
}

const CANCEL_KIND_TONE: Record<CancellationKind, string> = {
  // Hangus: uang ditahan → tone netral abu-abu agar tidak terlihat
  // negatif (revenue tetap diakui).
  forfeit: "bg-muted text-foreground/70 border-border",
  // Refund: uang keluar lagi → tone biru info supaya visual beda jelas.
  refund:
    "bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-950 dark:text-sky-200 dark:border-sky-700",
};

export function CancellationKindBadge({
  kind,
}: {
  kind: CancellationKind;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-full border",
        CANCEL_KIND_TONE[kind]
      )}
    >
      {CANCELLATION_KIND_LABEL[kind]}
    </span>
  );
}
