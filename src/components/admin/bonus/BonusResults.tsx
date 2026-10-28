import { getBonusMonth } from "@/lib/actions/bonus.actions";
import { BranchBonusCard } from "./BranchBonusCard";

/** Hasil bonus kedua cabang untuk satu bulan (server component async; dibungkus Suspense oleh halaman). */
export async function BonusResults({ period, simulateWith }: { period: string; simulateWith?: string | null }) {
  const month = await getBonusMonth(period, simulateWith);
  if (!month) return <p className="text-sm text-destructive">Bulan ini tidak bisa dihitung.</p>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {month.branches.map((b) => (
        <BranchBonusCard key={b.branch} view={b} period={period} canPublish={month.canPublish} simulated={!!month.simulation} />
      ))}
    </div>
  );
}
