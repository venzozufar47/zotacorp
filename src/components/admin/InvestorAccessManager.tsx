"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import {
  assignInvestorBusinessUnit,
  revokeInvestorAssignment,
  type InvestorSummary,
} from "@/lib/actions/investor.actions";

interface Props {
  investors: InvestorSummary[];
  businessUnits: string[];
  assignmentIdByPair: Record<string, string>; // "userId|businessUnit" → assignmentId
}

export function InvestorAccessManager({
  investors,
  businessUnits,
  assignmentIdByPair,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const onAssign = (userId: string, businessUnit: string) => {
    if (!businessUnit) return;
    startTransition(async () => {
      const res = await assignInvestorBusinessUnit({ userId, businessUnit });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Akses ${businessUnit} ditambahkan`);
      router.refresh();
    });
  };

  const onRevoke = (assignmentId: string, label: string) => {
    if (!confirm(`Cabut akses ${label}?`)) return;
    startTransition(async () => {
      const res = await revokeInvestorAssignment(assignmentId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Akses dicabut");
      router.refresh();
    });
  };

  if (investors.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
        Belum ada investor terdaftar. Investor dapat mendaftar mandiri
        di <code className="text-foreground">/register-investor</code>.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {investors.map((inv) => (
        <InvestorRow
          key={inv.userId}
          investor={inv}
          businessUnits={businessUnits}
          assignmentIdByPair={assignmentIdByPair}
          pending={pending}
          onAssign={onAssign}
          onRevoke={onRevoke}
        />
      ))}
    </div>
  );
}

function InvestorRow({
  investor,
  businessUnits,
  assignmentIdByPair,
  pending,
  onAssign,
  onRevoke,
}: {
  investor: InvestorSummary;
  businessUnits: string[];
  assignmentIdByPair: Record<string, string>;
  pending: boolean;
  onAssign: (userId: string, businessUnit: string) => void;
  onRevoke: (assignmentId: string, label: string) => void;
}) {
  const remaining = businessUnits.filter(
    (bu) => !investor.businessUnits.includes(bu)
  );
  const [pick, setPick] = useState<string>(remaining[0] ?? "");
  const isPending = investor.businessUnits.length === 0;

  return (
    <div
      className={`rounded-2xl border-2 p-4 ${
        isPending
          ? "border-warning/50 bg-warning/5"
          : "border-foreground bg-card"
      }`}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="font-semibold text-foreground text-sm">
            {investor.fullName ?? "(tanpa nama)"}
          </p>
          <p className="text-xs text-muted-foreground">{investor.email}</p>
          {isPending && (
            <p className="mt-1 text-[11px] font-semibold text-warning uppercase tracking-wider">
              Menunggu assignment
            </p>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground tabular-nums">
          Daftar {new Date(investor.createdAt).toLocaleDateString("id-ID")}
        </div>
      </div>

      {investor.businessUnits.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {investor.businessUnits.map((bu) => {
            const assignmentId =
              assignmentIdByPair[`${investor.userId}|${bu}`];
            return (
              <li
                key={bu}
                className="inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-semibold"
              >
                {bu}
                {assignmentId && (
                  <button
                    type="button"
                    aria-label={`Cabut akses ${bu}`}
                    onClick={() => onRevoke(assignmentId, bu)}
                    disabled={pending}
                    className="size-5 inline-flex items-center justify-center rounded-full hover:bg-destructive/20 text-primary hover:text-destructive disabled:opacity-50"
                  >
                    <X size={11} strokeWidth={2.5} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {remaining.length > 0 && (
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <select
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            className="h-9 rounded-lg border border-border bg-background px-3 text-sm"
            aria-label="Pilih unit bisnis"
          >
            {remaining.map((bu) => (
              <option key={bu} value={bu}>
                {bu}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onAssign(investor.userId, pick)}
            disabled={pending || !pick}
            className="inline-flex items-center gap-1 h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          >
            <Plus size={14} strokeWidth={2.5} />
            Tambah akses
          </button>
        </div>
      )}
    </div>
  );
}
