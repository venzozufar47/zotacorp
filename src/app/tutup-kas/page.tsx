export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { getMyCashClosingBranchStatuses } from "@/lib/actions/cash-closing.actions";

const STATUS_LABEL: Record<string, string> = {
  not_started: "Belum tutup kas hari ini",
  pending_verification: "Menunggu verifikasi",
  verified: "Sudah diverifikasi",
};

/**
 * Hub tutup kas (lintas cabang Haengbocake). 1 cabang yang bisa diakses →
 * langsung redirect; banyak → daftar pilihan; kosong → pulang. Sama pola
 * dengan hub `/cash`.
 */
export default async function TutupKasHubPage() {
  const statuses = await getMyCashClosingBranchStatuses();
  if (statuses.length === 0) redirect("/dashboard");
  if (statuses.length === 1) redirect(`/tutup-kas/${statuses[0].branch.toLowerCase()}`);

  return (
    <div data-theme="oceanic" className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-md px-4 py-8 space-y-4">
        <header>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Zota Corp
          </p>
          <h1 className="mt-0.5 text-2xl font-bold text-foreground">Tutup Kas Harian</h1>
          <p className="text-sm text-muted-foreground">Pilih cabang.</p>
        </header>
        <div className="space-y-3">
          {statuses.map((s) => (
            <Link
              key={s.branch}
              href={`/tutup-kas/${s.branch.toLowerCase()}`}
              className="press-feedback flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4 hover:border-primary/50 transition"
            >
              <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Wallet size={18} strokeWidth={2.4} />
              </span>
              <span className="min-w-0">
                <span className="block text-base font-semibold text-foreground">{s.branch}</span>
                <span className="block text-xs text-muted-foreground">
                  {STATUS_LABEL[s.status]}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
