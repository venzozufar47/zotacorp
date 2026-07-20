export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/cached";
import { canOpenSimCards, canManageSimCards } from "@/lib/sim-cards/access";
import { listSimCards } from "@/lib/actions/sim-cards.actions";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { SimCardsManager } from "@/components/sim-cards/SimCardsManager";

/**
 * Halaman penanggung jawab kartu SIM. Menampilkan HANYA nomor yang PIC-nya
 * user ini (scoping ada di `listSimCards`), dengan aksi "Isi pulsa" yang
 * mewajibkan upload bukti screenshot. Admin diarahkan ke halaman admin
 * yang fiturnya lebih lengkap.
 */
export default async function SimCardsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!(await canOpenSimCards())) redirect("/dashboard");
  if (await canManageSimCards()) redirect("/admin/sim-cards");

  const cards = await listSimCards(false);

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
            Kartu SIM saya<span className="text-primary">.</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Nomor yang kamu tanggung jawabi. Setelah isi pulsa, perbarui masa
            aktif & unggah bukti supaya pengingat berhenti.
          </p>
        </div>
      </div>

      <SimCardsManager
        uid={user.id}
        isAdmin={false}
        cards={cards}
        units={[]}
        profiles={[]}
        today={jakartaDateString(new Date())}
      />
    </div>
  );
}
