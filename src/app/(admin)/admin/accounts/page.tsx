export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { listManagedAccounts } from "@/lib/actions/managed-accounts.actions";
import { PageHeader } from "@/components/shared/PageHeader";
import { AccountsManager } from "@/components/admin/accounts/AccountsManager";

/**
 * Admin — brankas login & password per business unit & cabang. Password
 * tidak pernah dikirim ke halaman ini; hanya diambil saat admin menekan
 * lihat/salin.
 */
export default async function AdminAccountsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const accounts = await listManagedAccounts();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Akun & Password"
        subtitle="Simpan login per unit & cabang, atau pribadi owner. Cukup email dan password; info lain opsional."
      />
      <AccountsManager accounts={accounts} />
    </div>
  );
}
