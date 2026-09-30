import Link from "next/link";
import { cn } from "@/lib/utils";
import type { MetaAdsPeriod } from "@/lib/actions/meta-ads.actions";
import {
  META_ADS_ACCOUNTS,
  metaAdsHref,
  type MetaAdsAccountKey,
} from "@/lib/meta-ads/accounts";

export function AccountToggle({
  accountKey,
  period,
}: {
  accountKey: MetaAdsAccountKey;
  period: MetaAdsPeriod;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border-2 border-foreground bg-card p-1">
      {(Object.keys(META_ADS_ACCOUNTS) as MetaAdsAccountKey[]).map((key) => {
        const active = key === accountKey;
        return (
          <Link
            key={key}
            href={metaAdsHref(key, period)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm font-semibold transition",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            {META_ADS_ACCOUNTS[key].label}
          </Link>
        );
      })}
    </div>
  );
}
