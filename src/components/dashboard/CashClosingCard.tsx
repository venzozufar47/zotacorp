import Link from "next/link";
import { Wallet, CheckCircle2, Clock } from "lucide-react";
import { formatRp } from "@/lib/cashflow/format";
import type { CashClosingBranchStatus } from "@/lib/actions/cash-closing.actions";

const STATUS_META: Record<
  CashClosingBranchStatus["status"],
  { label: string; icon: typeof Wallet; className: string }
> = {
  not_started: {
    label: "Belum tutup kas",
    icon: Wallet,
    className: "text-muted-foreground",
  },
  pending_verification: {
    label: "Menunggu verifikasi",
    icon: Clock,
    className: "text-amber-600",
  },
  verified: {
    label: "Sudah diverifikasi",
    icon: CheckCircle2,
    className: "text-success",
  },
};

/**
 * Kartu beranda untuk staf POS Haengbocake (Koordinator Toko / staf depan
 * yang ditunjuk): status tutup kas hari ini per cabang yang bisa mereka
 * akses. Kosong (bukan staf POS) → tidak render apa pun.
 */
export function CashClosingCard({ statuses }: { statuses: CashClosingBranchStatus[] }) {
  if (statuses.length === 0) return null;

  return (
    <div className="rounded-2xl border-2 border-foreground bg-card px-4 py-3 shadow-hard-sm space-y-2.5">
      <div className="flex items-center gap-2">
        <span className="grid place-items-center size-10 rounded-full border-2 border-foreground bg-primary/10 shrink-0">
          <Wallet size={18} />
        </span>
        <p className="font-display font-bold text-sm">Tutup Kas Harian</p>
      </div>
      <ul className="space-y-1.5">
        {statuses.map((s) => {
          const meta = STATUS_META[s.status];
          const Icon = meta.icon;
          return (
            <li key={s.branch}>
              <Link
                href={`/tutup-kas/${s.branch.toLowerCase()}`}
                className="press-feedback flex items-center justify-between gap-3 rounded-xl border-2 border-border bg-background px-3 py-2"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{s.branch}</span>
                  <span className={`flex items-center gap-1 text-[11px] ${meta.className}`}>
                    <Icon size={12} /> {meta.label}
                    {s.cashDiff != null && s.cashDiff !== 0 && (
                      <span className="font-semibold"> · {formatRp(s.cashDiff)}</span>
                    )}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
