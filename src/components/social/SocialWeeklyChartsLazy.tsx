"use client";

import dynamic from "next/dynamic";

/** recharts keluar dari initial bundle, dimuat saat tab Bagan dibuka. Pembungkus klien terpisah karena server
 *  component tidak boleh meneruskan `ssr: false`. */
export const SocialWeeklyChartsLazy = dynamic(() => import("./SocialWeeklyCharts").then((m) => m.SocialWeeklyCharts), {
  ssr: false,
  loading: () => (
    <div className="grid gap-4 lg:grid-cols-2">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-[290px] animate-pulse rounded-2xl bg-muted/50" />
      ))}
    </div>
  ),
});
