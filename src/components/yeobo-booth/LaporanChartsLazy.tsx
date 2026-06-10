"use client";

import dynamic from "next/dynamic";

/**
 * Wrapper client untuk LaporanCharts — halaman laporan adalah server
 * component dan `ssr: false` tidak boleh dipakai di sana (Next 16).
 * recharts (~102KB gz) keluar dari initial bundle, dimuat saat render.
 */
export const LaporanChartsLazy = dynamic(
  () => import("./LaporanCharts").then((m) => m.LaporanCharts),
  {
    ssr: false,
    loading: () => (
      <div className="h-64 animate-pulse rounded-2xl bg-muted/50" />
    ),
  }
);
