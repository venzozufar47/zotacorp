import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { PageHeader } from "@/components/shared/PageHeader";
import { RealtimeRefresher } from "@/components/shared/RealtimeRefresher";
import {
  listSocialAccounts,
  getSocialFormOptions,
  listSyncRuns,
} from "@/lib/actions/social.actions";
import { SocialAccountsManager } from "@/components/admin/social/SocialAccountsManager";

/**
 * Registri akun sosmed yang dipantau.
 *
 * Halaman terpisah dari dashboard insight karena ini satu-satunya layar yang
 * menulis hal yang bersinggungan dengan kredensial — memberinya URL sendiri
 * membuat jejak auditnya jelas dan tidak tercampur dengan lalu lintas baca.
 */
export const dynamic = "force-dynamic";

export default async function SocialAccountsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const [accounts, options, runs] = await Promise.all([
    listSocialAccounts({ includeArchived: true }),
    getSocialFormOptions(),
    listSyncRuns(20),
  ]);

  return (
    <div className="space-y-6">
      <RealtimeRefresher channel="social-accounts" table="social_accounts" />
      <PageHeader
        title="Akun Sosmed"
        subtitle="Daftar akun Instagram & TikTok yang dipantau, kreator penanggung jawabnya, dan status koneksi API."
      />
      <SocialAccountsManager
        accounts={accounts}
        options={options}
        runs={runs}
      />
    </div>
  );
}
