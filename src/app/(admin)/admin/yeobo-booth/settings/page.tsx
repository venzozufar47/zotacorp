export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { canAccessYeoboBooth } from "@/lib/yeobo-booth/access";
import {
  listReminderCheckpoints,
  listReminderRecipients,
} from "@/lib/actions/yeobo-booth-reminders.actions";
import { PageHeader } from "@/components/shared/PageHeader";
import { ReminderCheckpointsCard } from "@/components/yeobo-booth/ReminderCheckpointsCard";
import { ReminderRecipientsCard } from "@/components/yeobo-booth/ReminderRecipientsCard";

/**
 * Pengaturan reminder WhatsApp Yeobo Booth. Bisa diakses admin Zota ATAU
 * admin unit Yeobo Booth (canAccessYeoboBooth). Atur checkpoint (H-N +
 * jam kirim) & daftar nomor penerima.
 */
export default async function YeoboBoothReminderSettingsPage() {
  if (!(await canAccessYeoboBooth())) redirect("/dashboard");

  const [checkpoints, recipients] = await Promise.all([
    listReminderCheckpoints(),
    listReminderRecipients(),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reminder Yeobo Booth"
        subtitle="Atur kapan reminder WhatsApp dikirim (checkpoint H-berapa + jam) dan ke nomor mana saja. Reminder dikirim otomatis untuk sesi yang berstatus terjadwal."
        action={
          <Link
            href="/admin/yeobo-booth"
            className="inline-flex items-center gap-1.5 rounded-xl border-2 border-foreground bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            <ArrowLeft size={14} strokeWidth={2.5} />
            Yeobo Booth
          </Link>
        }
      />
      <ReminderCheckpointsCard initialCheckpoints={checkpoints} />
      <ReminderRecipientsCard initialRecipients={recipients} />
    </div>
  );
}
