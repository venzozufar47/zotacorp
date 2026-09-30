import Link from "next/link";
import { cn } from "@/lib/utils";
import type { MetaAdsPeriod } from "@/lib/actions/meta-ads.actions";
import { metaAdsHref, type MetaAdsAccountKey } from "@/lib/meta-ads/accounts";

const OPTIONS: { value: MetaAdsPeriod; label: string }[] = [
  { value: "this_month", label: "Bulan ini" },
  { value: "last_month", label: "Bulan kemarin" },
];

export function PeriodToggle({
  accountKey,
  period,
}: {
  accountKey: MetaAdsAccountKey;
  period: MetaAdsPeriod;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border-2 border-foreground bg-card p-1">
      {OPTIONS.map((opt) => {
        const active = opt.value === period;
        return (
          <Link
            key={opt.value}
            href={metaAdsHref(accountKey, opt.value)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm font-semibold transition",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            {opt.label}
          </Link>
        );
      })}
    </div>
  );
}
