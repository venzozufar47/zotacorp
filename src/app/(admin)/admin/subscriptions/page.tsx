export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { listSubscriptions } from "@/lib/actions/subscriptions.actions";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { PageHeader } from "@/components/shared/PageHeader";
import { SubscriptionsManager } from "@/components/admin/subscriptions/SubscriptionsManager";

/**
 * Admin — daftar subscription per business unit & cabang, dengan tanggal
 * pembaruan dan pembagian satu langganan ke beberapa unit.
 */
export default async function AdminSubscriptionsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const subscriptions = await listSubscriptions();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subscription"
        subtitle="Langganan per unit & cabang, tanggal pembaruan, dan pembagian biayanya."
      />
      <SubscriptionsManager
        subscriptions={subscriptions}
        today={jakartaDateString(new Date())}
      />
    </div>
  );
}
