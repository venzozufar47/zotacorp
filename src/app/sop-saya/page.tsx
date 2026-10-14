export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { listMyOwnedSops } from "@/lib/actions/cleaning-governance.actions";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { SopOwnerPanel } from "@/components/cleaning/SopOwnerPanel";

/**
 * Halaman pemilik SOP: SOP yang menjadi tanggung jawabnya, kapan harus
 * ditinjau, kendala dari karyawan, dan perubahan terakhir. Pemilik bisa
 * menandai "sudah ditinjau" dan menutup kendala; mengubah isi SOP tetap di
 * Pengaturan SOP admin.
 */
export default async function SopOwnerPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const sops = await listMyOwnedSops();
  if (sops.length === 0) {
    redirect((await getCurrentRole()) === "admin" ? "/admin/cleaning" : "/dashboard");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link
          href="/dashboard"
          className="rounded-full p-2 hover:bg-muted text-muted-foreground"
          aria-label="Kembali"
        >
          <ArrowLeft size={18} strokeWidth={2.5} />
        </Link>
        <div>
          <h1 className="font-display text-xl font-extrabold tracking-tight leading-none">
            SOP saya<span className="text-primary">.</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            SOP yang kamu jaga. Tinjau saat jadwalnya tiba, tanggapi kendala dari rekan, lalu
            tandai selesai.
          </p>
        </div>
      </div>

      <SopOwnerPanel sops={sops} today={jakartaDateString(new Date())} />
    </div>
  );
}
