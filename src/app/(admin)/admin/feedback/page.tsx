export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/supabase/cached";
import { getFeedbackAdminData } from "@/lib/actions/feedback.actions";
import { FeedbackAdminClient } from "@/components/admin/FeedbackAdminClient";

/** Superadmin: kelola feedback pelanggan Haengbocake (rata-rata bintang, masukan, permintaan produk, QR cetak). */
export default async function AdminFeedbackPage() {
  if ((await getCurrentRole()) !== "admin") redirect("/dashboard");
  const initial = await getFeedbackAdminData({ branch: "all", days: 30 });
  return <FeedbackAdminClient initial={initial.ok && initial.data ? initial.data : null} />;
}
