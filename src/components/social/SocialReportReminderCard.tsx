import Link from "next/link";
import { Megaphone } from "lucide-react";
import type { SocialReportReminder } from "@/lib/actions/social-report.actions";
import { weekLabel } from "./SocialReportForm";

/**
 * Pengingat di beranda pengisi laporan sosmed: tiap Senin laporan minggu lalu jatuh tempo, dan kartu ini tetap
 * muncul sampai semua akun terisi. Menghilang sendiri bila sudah lengkap.
 */
export function SocialReportReminderCard({ reminder }: { reminder: SocialReportReminder | null }) {
  if (!reminder) return null;
  const done = reminder.total - reminder.missing.length;
  return (
    <Link
      href={`/sosmed?week=${reminder.weekStart}`}
      className="flex items-start gap-3 rounded-2xl border-2 border-foreground bg-warning/15 p-3.5 shadow-hard-sm transition hover:-translate-y-0.5"
    >
      <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-card">
        <Megaphone size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[14.5px] font-bold leading-snug">Laporan sosmed minggu lalu belum lengkap</span>
        <span className="block text-[12.5px] text-muted-foreground">
          {weekLabel(reminder.weekStart)} · {done}/{reminder.total} akun terisi. Belum: {reminder.missing.map((m) => `${m.platform === "instagram" ? "IG" : "TikTok"} @${m.handle}`).join(", ")}.
        </span>
        <span className="mt-1 block text-[12px] font-semibold text-primary">Isi sekarang →</span>
      </span>
    </Link>
  );
}
