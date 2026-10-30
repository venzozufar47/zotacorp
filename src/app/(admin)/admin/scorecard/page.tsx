export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/supabase/cached";
import { getBranchScorecard, getOmzetHistory } from "@/lib/actions/scorecard.actions";
import { ScorecardView } from "@/components/scorecard/ScorecardView";
import { OmzetTargetEditor } from "@/components/scorecard/OmzetTargetEditor";

const BRANCHES = ["Pare", "Semarang"] as const;

// Hanya metrik yang punya tempat pengaturan sungguhan. Omzet: editor di halaman ini; Waste & Service level: ambang di halaman Service Level.
const SETTINGS_LINKS = {
  service_level: { href: "/admin/service-level#ambang-scorecard", label: "Atur ambang waste & service level" },
};

/**
 * Superadmin — Scorecard Cabang: empat angka tiap cabang, dihitung langsung dari data yang sudah
 * ada (POS, selisih kas tutup shift, log keluhan). Karyawan melihat cabangnya sendiri di beranda.
 */
export default async function AdminScorecardPage() {
  if ((await getCurrentRole()) !== "admin") redirect("/dashboard");
  const [cards, history] = await Promise.all([
    Promise.all(BRANCHES.map((b) => getBranchScorecard(b))),
    Promise.all(BRANCHES.map((b) => getOmzetHistory(b))),
  ]);

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
              <>
                <OmzetTargetEditor branch={b} initial={cards[i]!.omzetTarget} history={history[i]} />
                <ScorecardView
                  scorecard={cards[i]!}
                  settingsLinks={{ ...SETTINGS_LINKS, omzet: { href: `#target-omzet-${b}`, label: "Atur target omzet" } }}
                />
              </>
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
