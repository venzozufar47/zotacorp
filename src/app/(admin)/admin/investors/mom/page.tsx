export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { listMeetingNotesAdmin } from "@/lib/actions/yeobo-mom.actions";
import { PageHeader } from "@/components/shared/PageHeader";
import { MeetingNotesManager } from "@/components/admin/MeetingNotesManager";

export default async function AdminMeetingNotesPage() {
  // Gate ganda seperti halaman admin lain: sesi dulu, baru peran.
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/");

  const notes = await listMeetingNotesAdmin();

  return (
    <div>
      <PageHeader
        title="Notulen Rapat"
        subtitle="Catatan hasil rapat yang tampil di portal investor Yeobo Space"
      />
      <MeetingNotesManager notes={notes} />
    </div>
  );
}
