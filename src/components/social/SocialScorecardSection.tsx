import { getMySocialScorecard } from "@/lib/actions/social-scorecard.actions";
import { SocialBrandTiles } from "./SocialScorecardView";

/**
 * Scorecard sosmed di beranda pengisi laporan (Ana Intaning, Hasna): hanya brand yang ia pegang, tanpa omset. Komponen
 * server asinkron di dalam <Suspense> supaya hitungannya tidak menahan halaman. Menghilang sendiri bila bukan pengisi.
 */
export async function SocialScorecardSection({ simulate }: { simulate?: string | null }) {
  const data = await getMySocialScorecard(simulate);
  if (!data || data.brands.length === 0) return null;
  return (
    <section aria-label="Scorecard sosmed" className="space-y-4 animate-fade-up">
      {data.brands.map((b) => (
        <div key={b.brandId} className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <span className="eyebrow text-muted-foreground">Scorecard sosmed {b.label}</span>
            <span aria-hidden className="ml-3 h-px flex-1 bg-gradient-to-r from-border to-transparent" />
          </div>
          <SocialBrandTiles brand={b} />
          <p className="px-1 text-[11px] text-muted-foreground">
            {data.monthLabel} · {b.weeksReported} minggu terlapor · {b.accountsReporting}/{b.accountCount} akun terisi
          </p>
        </div>
      ))}
    </section>
  );
}
