export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { listSimCards } from "@/lib/actions/sim-cards.actions";
import { listBusinessUnits } from "@/lib/actions/business-units.actions";
import { listAssignableProfiles } from "@/lib/actions/cashflow-assignments.actions";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { PageHeader } from "@/components/shared/PageHeader";
import { RealtimeRefresher } from "@/components/shared/RealtimeRefresher";
import { SimCardsManager } from "@/components/sim-cards/SimCardsManager";

/**
 * Admin — daftar nomor kartu SIM seluruh unit bisnis: tenggat masa aktif /
 * tenggang, penanggung jawab, dan pencatatan isi pulsa (dengan bukti).
 * Unit bisnis diambil dari `business_units` yang dikelola di /admin/settings.
 */
export default async function AdminSimCardsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const [cards, units, profilesRes] = await Promise.all([
    listSimCards(true), // admin lihat termasuk arsip
    listBusinessUnits(),
    listAssignableProfiles(),
  ]);

  return (
    <div className="space-y-6">
      <RealtimeRefresher channel="sim-cards-admin" table="sim_cards" />
      <PageHeader
        title="Kartu SIM"
        subtitle="Nomor per unit bisnis, tenggat masa aktif & tenggang, penanggung jawab, dan riwayat isi pulsa."
      />
      <SimCardsManager
        uid={user.id}
        isAdmin
        cards={cards}
        units={units.map((u) => ({ id: u.id, name: u.name }))}
        profiles={profilesRes.ok ? (profilesRes.data ?? []) : []}
        today={jakartaDateString(new Date())}
      />
    </div>
  );
}
