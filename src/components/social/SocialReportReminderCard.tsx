import { Megaphone } from "lucide-react";
import { NoticeCard } from "@/components/dashboard/NoticeCard";
import type { SocialReportReminder } from "@/lib/actions/social-report.actions";
import { weekLabel } from "@/lib/social/week-label";

/**
 * Pengingat di beranda pengisi laporan sosmed: tiap Senin laporan minggu lalu jatuh tempo, dan kartu ini tetap
 * muncul sampai semua akun terisi. Menghilang sendiri bila sudah lengkap.
 */
export function SocialReportReminderCard({ reminder }: { reminder: SocialReportReminder | null }) {
  if (!reminder) return null;
  const done = reminder.total - reminder.missing.length;
  const missing = reminder.missing.map((m) => `${m.platform === "instagram" ? "IG" : "TikTok"} @${m.handle.replace(/^@/, "")}`).join(", ");
  return (
    <NoticeCard
      href={`/sosmed?week=${reminder.weekStart}`}
      tone="warn"
      icon={<Megaphone size={20} />}
      title="Laporan sosmed minggu lalu belum lengkap"
      body={`${weekLabel(reminder.weekStart)} · ${done}/${reminder.total} akun terisi. Belum: ${missing}.`}
    />
  );
}
