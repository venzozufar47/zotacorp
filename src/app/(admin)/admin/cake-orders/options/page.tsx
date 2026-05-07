export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { listCakeOptionsAdmin } from "@/lib/actions/cake-options.actions";
import { PageHeader } from "@/components/shared/PageHeader";
import { CakeOptionsManager } from "@/components/admin/CakeOptionsManager";

/**
 * CRUD for the five dropdown lists used by the cake-order form.
 * Tabbed by kind. Soft-delete (is_active=false) when an option is
 * referenced by any existing order.
 */
export default async function AdminCakeOptionsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const res = await listCakeOptionsAdmin();
  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="Opsi Cake"
        subtitle="Kelola dropdown base cake, bentuk, filling, pengiriman, dan metode pembayaran."
      />
      <CakeOptionsManager
        initialOptions={res.ok ? res.data ?? [] : []}
      />
    </div>
  );
}
