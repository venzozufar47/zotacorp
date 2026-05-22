/**
 * Konstanta metric_id yang dipakai oleh KPI tiles, chart, dan
 * comment thread. Satu set untuk semua sisi (server + client) supaya
 * id tidak drift dan badge count cocok dengan tile.
 */
export const METRIC_IDS = {
  revenue: { id: "revenue", label: "Revenue" },
  netProfit: { id: "netProfit", label: "Net profit" },
  gpMargin: { id: "gpMargin", label: "Gross margin" },
  opMargin: { id: "opMargin", label: "Operating margin" },
  npMargin: { id: "npMargin", label: "Net margin" },
  utilization: { id: "utilization", label: "Utilization" },
  revenueTrend: { id: "revenueTrend", label: "Revenue per bulan" },
  pnlBreakdown: { id: "pnlBreakdown", label: "P&L breakdown" },
  marginTrend: { id: "marginTrend", label: "Margin trend" },
  utilizationChart: { id: "utilizationChart", label: "Utilization rate" },
  pnlTable: { id: "pnlTable", label: "Rincian P&L" },
  orders: { id: "orders", label: "Total order" },
  customers: { id: "customers", label: "Unique customer" },
  aov: { id: "aov", label: "Average order value" },
  cogsRatio: { id: "cogsRatio", label: "COGS ratio" },
  opexRatio: { id: "opexRatio", label: "Opex ratio" },
  cashback: { id: "cashback", label: "Bagi hasil" },
} as const;

export type MetricId = (typeof METRIC_IDS)[keyof typeof METRIC_IDS]["id"];

export function metricLabel(id: string): string {
  const entry = Object.values(METRIC_IDS).find((m) => m.id === id);
  return entry?.label ?? id;
}
