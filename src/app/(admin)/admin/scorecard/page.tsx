export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/supabase/cached";
import { getBranchScorecard } from "@/lib/actions/scorecard.actions";
import { ScorecardView } from "@/components/scorecard/ScorecardView";

const BRANCHES = ["Pare", "Semarang"] as const;

// Hanya metrik yang punya halaman pengaturan sungguhan. Ambang waste ada di kode; target omzet harian belum punya halaman input.
const SETTINGS_LINKS = {
  service_level: { href: "/admin/service-level", label: "Atur target service level" },
};

/**
 * Superadmin — Scorecard Cabang: empat angka tiap cabang, dihitung langsung dari data yang sudah
 * ada (POS, selisih kas tutup shift, log keluhan). Karyawan melihat cabangnya sendiri di beranda.
 */
export default async function AdminScorecardPage() {
  if ((await getCurrentRole()) !== "admin") redirect("/dashboard");
  const cards = await Promise.all(BRANCHES.map((b) => getBranchScorecard(b)));

  return (
    <div className="space-y-6 p-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Scorecard Cabang</h1>
        <p className="text-sm text-muted-foreground">
          Waste, selisih kas, omzet, dan keluhan per cabang — dihitung otomatis, tanpa input manual.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {BRANCHES.map((b, i) => (
          <section key={b} className="space-y-3">
            <h2 className="font-display text-base font-bold">Cabang {b}</h2>
            {cards[i] ? (
              <ScorecardView scorecard={cards[i]!} settingsLinks={SETTINGS_LINKS} />
            ) : (
              <p className="rounded-xl border-2 border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Data cabang {b} belum tersedia (rekening POS cabang tidak ditemukan).
              </p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
