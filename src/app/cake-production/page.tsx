export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/cached";
import { getMyCakeAccess } from "@/lib/cake-orders/access";
import {
  getSlipForProduction,
  listMySlips,
} from "@/lib/actions/cake-slips.actions";
import { ProductionLobby } from "@/components/cake/ProductionLobby";

/**
 * Production lobby: list of slips visible to the user. RLS already
 * filters out drafts for production-only assignees. Untuk admin
 * (hasOrders), pakai split-view dua kolom (Pare + Semarang) di kiri
 * + detail pane di kanan. Untuk produksi-only, kolom tunggal seperti
 * sebelumnya.
 *
 * `?slip=<id>` query param menentukan detail mana yang dirender di
 * pane kanan. URL-driven supaya back button + shareable link tetap
 * jalan.
 */
export default async function CakeProductionPage({
  searchParams,
}: {
  searchParams: Promise<{ slip?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const access = await getMyCakeAccess();
  if (!access.hasProduction && !access.hasOrders) redirect("/dashboard");

  const sp = await searchParams;
  const selectedSlipId = sp.slip ?? null;

  const slipsRes = await listMySlips();
  const slips = slipsRes.ok ? slipsRes.data ?? [] : [];

  // Detail di-fetch server-side biar render konsisten dengan
  // direct-link `/cake-production/[slipId]`. Salah ID → null
  // (panel kanan render placeholder).
  let detailRes: Awaited<ReturnType<typeof getSlipForProduction>> | null = null;
  if (selectedSlipId) {
    detailRes = await getSlipForProduction(selectedSlipId);
  }

  return (
    <ProductionLobby
      slips={slips}
      isAdmin={access.hasOrders}
      selectedSlipId={selectedSlipId}
      detail={
        detailRes && detailRes.ok && detailRes.data
          ? {
              slip: detailRes.data.slip,
              items: detailRes.data.items,
              myProductionRole: detailRes.data.myProductionRole,
            }
          : null
      }
      detailError={detailRes && !detailRes.ok ? detailRes.error : null}
    />
  );
}
