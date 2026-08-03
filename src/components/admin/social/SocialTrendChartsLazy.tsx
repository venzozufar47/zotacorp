"use client";

import dynamic from "next/dynamic";

/** recharts (~102KB gz) keluar dari initial bundle, dimuat saat tab Tren
 *  benar-benar dibuka. Pembungkus klien terpisah karena server component
 *  tidak boleh meneruskan `ssr: false`. */
export const SocialTrendChartsLazy = dynamic(
  () => import("./SocialTrendCharts").then((m) => m.SocialTrendCharts),
  {
    ssr: false,
    loading: () => (
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[260px] animate-pulse rounded-2xl bg-muted/50" />
        ))}
      </div>
    ),
  }
);
