export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { Images } from "lucide-react";
import { getCurrentRole } from "@/lib/supabase/cached";
import { listBoothDevices, listBoothEvents } from "@/lib/actions/booth.actions";
import { PageHeader } from "@/components/shared/PageHeader";
import { DevicesManager } from "@/components/booth/DevicesManager";

export default async function PhotoboothDevicesPage() {
  // Sementara khusus superadmin (admin Zota).
  if ((await getCurrentRole()) !== "admin") redirect("/dashboard");

  const [devices, events] = await Promise.all([
    listBoothDevices(),
    listBoothEvents(),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Perangkat Photobooth"
        subtitle="Laptop booth di tiap cabang: status terakhir dari heartbeat, event aktif, dan token perangkat."
        action={
          <Link
            href="/admin/yeobo-booth/photobooth/sesi"
            className="inline-flex items-center gap-1.5 rounded-xl border-2 border-foreground bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            <Images size={14} strokeWidth={2.5} />
            Sesi Foto
          </Link>
        }
      />
      <DevicesManager devices={devices} events={events} />
    </div>
  );
}
