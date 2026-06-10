import Link from "next/link";
import { BOOKING_TYPE_LABEL, type BookingType } from "@/lib/yeobo-booth/types";

/**
 * Filter tipe booking (Semua / Event Hire / Sewa Space) via URL `?type=`.
 * Server component — cukup Link, tidak butuh client state.
 */
export function BookingTypeFilter({
  current,
  basePath,
}: {
  current?: BookingType;
  basePath: string;
}) {
  const opts: { value?: BookingType; label: string }[] = [
    { value: undefined, label: "Semua" },
    { value: "event_hire", label: BOOKING_TYPE_LABEL.event_hire },
    { value: "space_rent", label: BOOKING_TYPE_LABEL.space_rent },
  ];
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-card p-1">
      {opts.map((o) => {
        const active = current === o.value;
        const href = o.value ? `${basePath}?type=${o.value}` : basePath;
        return (
          <Link
            key={o.label}
            href={href}
            className={
              "px-3 py-1.5 rounded-lg text-xs font-semibold transition " +
              (active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground")
            }
          >
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}
