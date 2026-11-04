import "server-only";
import { createAdminClient } from "@/lib/actions/_supabase-admin";
import { sendPushToUser } from "@/lib/push/web-push";
import { formatRp } from "@/lib/cashflow/format";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { loadBrandProcurement } from "./rows";
import { CYCLE_COUNT_BRANDS } from "./cycle-count";
import { lateWorkingDays } from "./lead-time";
import { offWorkdayUserIds } from "./workday";

export interface ShoppingReminderSummary {
  brands: number;
  notified: number;
}

/**
 * Arahan belanja pagi hari untuk petugas pengadaan cabang yang hari ini bekerja. Isinya hanya bahan yang SUDAH punya
 * titik awal stok (opname). Bahan terpakai yang belum pernah dihitung tidak ditebak: disebut terpisah ("opname dulu").
 * Bahan yang sudah dipesan (dalam perjalanan) tidak disarankan dibeli lagi; pesanan telat disebut.
 */
export async function runShoppingReminders(): Promise<ShoppingReminderSummary> {
  const admin = createAdminClient();
  const today = jakartaDateString(new Date());
  const summary: ShoppingReminderSummary = { brands: 0, notified: 0 };

  for (const brand of CYCLE_COUNT_BRANDS) {
    summary.brands++;
    const { rows } = await loadBrandProcurement(admin, { businessUnit: brand });
    const toBuy = rows.filter((r) => (r.metrics.suggestion?.qtyPurchaseUnits ?? 0) > 0);
    const needOpname = rows.filter((r) => r.metrics.status === "belum_opname" && (r.autoDailyUsage != null || r.params.avgDailyUsage > 0));
    const late = rows.filter((r) => r.inTransit.count > 0 && lateWorkingDays(r.inTransit.expectedAt, today) > 0);
    if (toBuy.length === 0 && needOpname.length === 0 && late.length === 0) continue;

    const { data: assigned } = await admin.from("procurement_assignments").select("user_id").eq("business_unit", brand);
    const ids = (assigned ?? []).map((a) => a.user_id);
    const off = await offWorkdayUserIds(admin, ids);
    const staff = ids.filter((id) => !off.has(id));
    if (staff.length === 0) continue;

    const parts: string[] = [];
    if (toBuy.length > 0) {
      const cost = toBuy.reduce((s, r) => s + (r.metrics.suggestion?.estCost ?? 0), 0);
      parts.push(`Beli ${toBuy.length} bahan (≈${formatRp(cost)})`);
    }
    if (late.length > 0) parts.push(`${late.length} pesanan telat`);
    if (needOpname.length > 0) parts.push(`${needOpname.length} bahan belum bisa dihitung, opname dulu`);
    const short = brand.replace("Haengbocake ", "");
    const url =
      toBuy.length > 0 || late.length > 0
        ? `/pengadaan?tab=${toBuy.length > 0 ? "stok" : "pesanan"}&bu=${encodeURIComponent(brand)}`
        : `/pengadaan/opname?bu=${encodeURIComponent(brand)}`;
    for (const userId of staff) {
      const res = await sendPushToUser(userId, { title: `Arahan belanja ${short}`, body: `${parts.join(" · ")}.`, url });
      if (res.delivered > 0) summary.notified++;
    }
  }
  return summary;
}
