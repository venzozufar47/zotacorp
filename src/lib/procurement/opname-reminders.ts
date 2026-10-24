import "server-only";
import { createAdminClient } from "@/lib/actions/_supabase-admin";
import { sendPushToAdmins, sendPushToUser } from "@/lib/push/web-push";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { computeCountPlan } from "./count-plan";
import { CYCLE_COUNT_BRANDS } from "./cycle-count";

export interface OpnameReminderSummary {
  brands: number;
  pending: number;
  remindedUsers: number;
  ownerNotified: boolean;
}

/**
 * Pengingat opname harian. Hanya petugas pengadaan cabang yang SUDAH absen masuk hari ini dan belum pulang (hari libur
 * tak diingatkan). Tahap 1 (≈14.00 WIB): ajakan ke petugas. Tahap 2 (≈18.00 WIB): ajakan terakhir + owner diberi tahu
 * bila daftar hari ini masih belum selesai. Selesai = semua bahan di daftar hari ini sudah dihitung.
 */
export async function runOpnameReminders(stage: 1 | 2): Promise<OpnameReminderSummary> {
  const admin = createAdminClient();
  const today = jakartaDateString(new Date());
  const summary: OpnameReminderSummary = { brands: 0, pending: 0, remindedUsers: 0, ownerNotified: false };
  const ownerLines: string[] = [];

  for (const brand of CYCLE_COUNT_BRANDS) {
    summary.brands++;
    const plan = await computeCountPlan(admin, brand);
    if (!plan.enabled || plan.total === 0 || plan.doneCount >= plan.total) continue;

    const { data: assigned } = await admin.from("procurement_assignments").select("user_id").eq("business_unit", brand);
    const staffIds = (assigned ?? []).map((a) => a.user_id);
    if (staffIds.length === 0) continue;
    const { data: logs } = await admin
      .from("attendance_logs")
      .select("user_id")
      .eq("date", today)
      .in("user_id", staffIds)
      .not("checked_in_at", "is", null)
      .is("checked_out_at", null);
    const present = [...new Set((logs ?? []).map((l) => l.user_id))];
    if (present.length === 0) continue; // tak ada petugas yang sedang bekerja: tak ada yang diingatkan

    summary.pending++;
    const short = brand.replace("Haengbocake ", "");
    for (const userId of present) {
      const res = await sendPushToUser(userId, {
        title: stage === 1 ? "Waktunya opname bahan" : "Opname hari ini belum selesai",
        body:
          plan.doneCount === 0
            ? `${short}: ${plan.total} bahan perlu dihitung hari ini (±${plan.minutesLeft} menit).`
            : `${short}: ${plan.doneCount}/${plan.total} bahan sudah dihitung, sisa ±${plan.minutesLeft} menit.`,
        url: `/pengadaan/opname?bu=${encodeURIComponent(brand)}`,
      });
      if (res.delivered > 0) summary.remindedUsers++;
    }
    ownerLines.push(`${short} ${plan.doneCount}/${plan.total}`);
  }

  if (stage === 2 && ownerLines.length > 0) {
    try {
      await sendPushToAdmins({
        title: "Opname hari ini belum selesai",
        body: `${ownerLines.join(" · ")} bahan dihitung. Petugas sudah diingatkan.`,
        url: "/admin/costing/pengadaan",
      });
      summary.ownerNotified = true;
    } catch {
      // Notifikasi owner gagal tak boleh membatalkan cron.
    }
  }
  return summary;
}
