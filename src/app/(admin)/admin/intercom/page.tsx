export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import {
  listVoiceRoomsAdmin,
  listBrandOptions,
} from "@/lib/actions/voice-rooms.actions";
import { PageHeader } from "@/components/shared/PageHeader";
import { IntercomRoomsManager } from "@/components/admin/IntercomRoomsManager";

/**
 * Admin → Intercom rooms
 *
 * CRUD for the voice channels listed at /intercom. Each room is either
 * cross-brand (`business_unit IS NULL`, visible to everyone) or scoped
 * to a single brand. Sort order controls the order in the lobby.
 */
export default async function AdminIntercomPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const [roomsRes, brandsRes] = await Promise.all([
    listVoiceRoomsAdmin(),
    listBrandOptions(),
  ]);

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="Intercom"
        subtitle="Kelola room voice channel yang tampil di /intercom."
      />
      <IntercomRoomsManager
        initialRooms={roomsRes.ok ? roomsRes.data ?? [] : []}
        brandOptions={brandsRes.ok ? brandsRes.data ?? [] : []}
      />
    </div>
  );
}
