export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/supabase/cached";
import { createClient } from "@/lib/supabase/server";
import { listSpEntries } from "@/lib/actions/cleaning-review.actions";
import { SpAdminClient } from "@/components/admin/sp/SpAdminClient";

/**
 * Sistem SP (PRD-6) — terbitkan teguran/SP, lihat yang sedang aktif, dan
 * riwayat lengkap 1 tahun. Dibangun di atas `employee_coaching_notes` yang sudah
 * ada (migrasi 131, diperluas migrasi 197) — bukan tabel/halaman terpisah.
 */
export default async function AdminSpPage() {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const supabase = await createClient();
  const [activeRes, recentRes, employeesRes] = await Promise.all([
    listSpEntries({ onlyActive: true }),
    listSpEntries({ days: 365, includePlain: true }),
    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("role", "employee")
      .eq("is_active", true)
      .order("full_name", { ascending: true }),
  ]);

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Sistem SP</h1>
        <p className="text-sm text-muted-foreground">
          Teguran serius dan SP1–SP3. Sanksi (SP1–SP3) hanya bisa diterbitkan dari sini. Riwayat lengkap
          semua catatan pembinaan (termasuk catatan biasa) hanya ada di sini — Owner saja.
        </p>
      </div>
      <SpAdminClient
        active={activeRes.ok ? activeRes.data ?? [] : []}
        recent={recentRes.ok ? recentRes.data ?? [] : []}
        employees={(employeesRes.data ?? []).map((e) => ({ id: e.id, name: e.full_name }))}
      />
    </div>
  );
}
