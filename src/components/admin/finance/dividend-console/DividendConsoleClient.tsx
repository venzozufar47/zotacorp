"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Check,
  Link2Off,
  Send,
} from "lucide-react";
import { formatRp, formatIDR } from "@/lib/cashflow/format";
import { MONTH_FULL_NAMES, formatDateID } from "@/lib/utils/date-formats";
import {
  saveDividendConsoleMonth,
  type DividendConsoleData,
  type ConsoleBranch,
} from "@/lib/actions/yeobo-dividend-console.actions";

const ymRank = (s: string) => {
  const [y, m] = s.split("-").map(Number);
  return y * 100 + m;
};
const ymStr = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;
function shiftMonth(y: number, m: number, d: number) {
  let mm = m + d;
  let yy = y;
  while (mm < 1) {
    mm += 12;
    yy -= 1;
  }
  while (mm > 12) {
    mm -= 12;
    yy += 1;
  }
  return { year: yy, month: mm };
}
function parseAmount(s: string): number {
  const digits = s.replace(/[^\d]/g, "");
  return digits ? parseInt(digits, 10) : 0;
}

export function DividendConsoleClient({
  data,
  minYm,
  maxYm,
}: {
  data: DividendConsoleData;
  minYm: string;
  maxYm: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Nominal transfer per recipient (init: allocation tersimpan ?? computed).
  const [amounts, setAmounts] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const b of data.branches)
      for (const r of b.rows) init[r.recipientId] = r.savedAllocation ?? r.computed;
    return init;
  });
  const [paidAt, setPaidAt] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [ref, setRef] = useState("");

  const setAmount = (id: string, v: number) =>
    setAmounts((prev) => ({ ...prev, [id]: v }));

  const curR = ymRank(ymStr(data.year, data.month));
  const canPrev = curR > ymRank(minYm);
  const canNext = curR < ymRank(maxYm);
  const monthLabel = `${MONTH_FULL_NAMES[data.month - 1]} ${data.year}`;
  const go = (y: number, m: number) =>
    router.push(`/admin/finance/dividen?month=${ymStr(y, m)}`);

  // Per-branch balance + includable.
  const branchState = useMemo(() => {
    return data.branches.map((b) => {
      const sum = b.rows.reduce((s, r) => s + (amounts[r.recipientId] ?? 0), 0);
      const includable = b.pool > 0;
      const balanced = Math.abs(sum - Math.round(b.pool)) <= 1;
      return { branch: b.branch, sum, includable, balanced };
    });
  }, [data.branches, amounts]);

  const includable = branchState.filter((s) => s.includable);
  const allBalanced =
    includable.length > 0 && includable.every((s) => s.balanced);

  // Total nominal yang akan ditransfer ke investor (cabang includable saja).
  const totalToInvestors = useMemo(() => {
    let t = 0;
    for (const b of data.branches) {
      if (b.pool <= 0) continue;
      for (const r of b.rows)
        if (r.kind === "investor") t += amounts[r.recipientId] ?? 0;
    }
    return t;
  }, [data.branches, amounts]);

  function handleSave() {
    if (!allBalanced) return;
    const branches = data.branches
      .filter((b) => b.pool > 0)
      .map((b) => ({
        branch: b.branch,
        rows: b.rows.map((r) => ({
          recipientId: r.recipientId,
          amount: amounts[r.recipientId] ?? 0,
        })),
      }));
    startTransition(async () => {
      const res = await saveDividendConsoleMonth({
        year: data.year,
        month: data.month,
        paidAt,
        ref: ref.trim() || null,
        branches,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        `Tersimpan — ${res.data?.savedBranches} cabang, ${res.data?.syncedPayouts} payout investor disinkron.`
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* 1. Month navigation */}
      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          disabled={!canPrev}
          onClick={() => {
            const p = shiftMonth(data.year, data.month, -1);
            go(p.year, p.month);
          }}
          className="grid size-9 place-items-center rounded-full border border-border bg-card text-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none transition"
          aria-label="Bulan sebelumnya"
        >
          <ChevronLeft size={17} />
        </button>
        <div className="min-w-[170px] text-center text-lg font-bold text-foreground">
          {monthLabel}
        </div>
        <button
          type="button"
          disabled={!canNext}
          onClick={() => {
            const n = shiftMonth(data.year, data.month, +1);
            go(n.year, n.month);
          }}
          className="grid size-9 place-items-center rounded-full border border-border bg-card text-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none transition"
          aria-label="Bulan berikutnya"
        >
          <ChevronRight size={17} />
        </button>
      </div>

      {/* 2. Branch summary cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        {data.branches.map((b) => (
          <div
            key={b.branch}
            className="rounded-2xl border border-border bg-card p-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-foreground">
                {b.branch}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                  b.afterBep
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {b.afterBep ? "Setelah BEP" : "Sebelum BEP"} · Mgmt {b.mgmtPct}%
              </span>
            </div>
            <dl className="mt-3 space-y-1.5 text-[12.5px]">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Operating profit</dt>
                <dd
                  className={`font-mono tabular-nums ${
                    b.operatingProfit < 0 ? "text-destructive" : "text-foreground"
                  }`}
                >
                  {formatRp(b.operatingProfit)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Pool dividen</dt>
                <dd
                  className={`font-mono tabular-nums font-semibold ${
                    b.pool < 0 ? "text-destructive" : "text-foreground"
                  }`}
                >
                  {formatRp(b.pool)}
                </dd>
              </div>
              {b.totalInvestmentIdr != null && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Modal terbalik</dt>
                  <dd className="font-mono tabular-nums text-muted-foreground">
                    {formatIDR(b.investorRecouped)} /{" "}
                    {formatIDR(b.totalInvestmentIdr)}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        ))}
      </div>

      {/* 3. Per-branch allocation tables */}
      <div className="space-y-4">
        {data.branches.map((b, i) => (
          <BranchAllocationTable
            key={b.branch}
            branch={b}
            sum={branchState[i].sum}
            amounts={amounts}
            setAmount={setAmount}
          />
        ))}
      </div>

      {/* 4. Cross-branch investor view */}
      <InvestorCrossBranchTable data={data} amounts={amounts} />

      {/* 5. Transfer panel */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="text-sm font-bold text-foreground">
          Tandai transfer bulan {monthLabel}
        </h3>
        <div className="mt-3 flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Tanggal transfer
            </span>
            <input
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Referensi (opsional)
            </span>
            <input
              type="text"
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder="mis. BCA bulk 13/06"
              className="w-56 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </label>
          <div className="ml-auto flex flex-col items-end gap-1.5">
            <span className="text-[12px] text-muted-foreground">
              {includable.length} cabang siap ·{" "}
              <span className="font-mono tabular-nums font-semibold text-foreground">
                {formatRp(totalToInvestors)}
              </span>{" "}
              ke investor
            </span>
            <button
              type="button"
              onClick={handleSave}
              disabled={!allBalanced || pending}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40 disabled:pointer-events-none transition"
            >
              <Send size={15} />
              {pending ? "Menyimpan…" : "Simpan & tandai tertransfer"}
            </button>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Menyimpan ulang menimpa nominal & tanggal transfer bulan ini. Cabang
          dengan pool ≤ 0 tidak ikut disimpan.
        </p>
      </div>

      {/* 6. Payout history */}
      {data.history.length > 0 && <PayoutHistory data={data} />}
    </div>
  );
}

// ── Branch allocation table ────────────────────────────────────────────
function BranchAllocationTable({
  branch,
  sum,
  amounts,
  setAmount,
}: {
  branch: ConsoleBranch;
  sum: number;
  amounts: Record<string, number>;
  setAmount: (id: string, v: number) => void;
}) {
  const negative = branch.pool < 0;
  const zero = branch.pool === 0;
  const readOnly = negative || zero;
  const balanced = Math.abs(sum - Math.round(branch.pool)) <= 1;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-sm font-bold text-foreground">{branch.branch}</span>
        <span className="font-mono tabular-nums text-sm text-muted-foreground">
          Pool {formatRp(branch.pool)}
        </span>
      </div>

      {negative && (
        <div className="flex items-center gap-2 bg-amber-500/10 px-4 py-2.5 text-[12.5px] text-amber-700 dark:text-amber-400">
          <AlertTriangle size={15} />
          Bulan rugi — investor ikut menanggung; tidak ada dividen yang
          ditransfer.
        </div>
      )}
      {zero && (
        <div className="px-4 py-2.5 text-[12.5px] text-muted-foreground">
          Belum ada nominal Dividend untuk bulan ini — cabang dikecualikan dari
          transfer.
        </div>
      )}

      {!readOnly && (
        <>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 text-left font-semibold">Penerima</th>
                <th className="px-4 py-2 text-right font-semibold">Dihitung</th>
                <th className="px-4 py-2 text-right font-semibold">
                  Nominal transfer
                </th>
                <th className="px-4 py-2 text-right font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {branch.rows.map((r) => {
                const val = amounts[r.recipientId] ?? 0;
                const edited = val !== r.computed;
                return (
                  <tr
                    key={r.recipientId}
                    className="border-t border-border/60"
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">
                          {r.label}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[9.5px] font-semibold uppercase ${
                            r.kind === "management"
                              ? "bg-muted text-muted-foreground"
                              : "bg-primary/10 text-primary"
                          }`}
                        >
                          {r.kind === "management" ? "Mgmt" : "Investor"}
                        </span>
                        {r.kind === "investor" && !r.contractId && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-amber-600">
                            <Link2Off size={11} /> belum tersambung
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                      {formatIDR(r.computed)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={formatIDR(val)}
                        onChange={(e) =>
                          setAmount(r.recipientId, parseAmount(e.target.value))
                        }
                        className={`w-32 rounded-lg border bg-background px-2.5 py-1.5 text-right font-mono tabular-nums text-foreground ${
                          edited ? "border-primary/60" : "border-border"
                        }`}
                      />
                    </td>
                    <td className="px-4 py-2.5 text-right text-[11.5px]">
                      {r.payout ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600">
                          <Check size={13} />
                          {r.payout.paidAt
                            ? formatDateID(r.payout.paidAt)
                            : "tersinkron"}
                        </span>
                      ) : edited ? (
                        <span className="text-primary">diubah manual</span>
                      ) : (
                        <span className="text-muted-foreground/60">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div
            className={`flex items-center justify-between px-4 py-2.5 text-[12.5px] border-t ${
              balanced
                ? "border-emerald-500/30 bg-emerald-500/5"
                : "border-destructive/30 bg-destructive/5"
            }`}
          >
            <span className="font-medium">
              {balanced ? (
                <span className="inline-flex items-center gap-1 text-emerald-600">
                  <Check size={14} /> Total cocok dengan pool
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-destructive">
                  <AlertTriangle size={14} /> Total belum sama dengan pool
                </span>
              )}
            </span>
            <span className="font-mono tabular-nums">
              {formatRp(sum)} / {formatRp(branch.pool)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// ── Cross-branch investor view ─────────────────────────────────────────
function InvestorCrossBranchTable({
  data,
  amounts,
}: {
  data: DividendConsoleData;
  amounts: Record<string, number>;
}) {
  const liveSliceDue = (recipientId: string | null, fallback: number) =>
    recipientId != null ? amounts[recipientId] ?? fallback : fallback;

  const grand = data.investors.reduce(
    (acc, inv) => {
      const due = inv.slices.reduce(
        (s, sl) => s + liveSliceDue(sl.recipientId, sl.dueThisMonth),
        0
      );
      acc.due += due;
      acc.cum += inv.totalCumulative;
      return acc;
    },
    { due: 0, cum: 0 }
  );

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <span className="text-sm font-bold text-foreground">
          Per investor — lintas cabang
        </span>
        <span className="ml-2 text-[12px] text-muted-foreground">
          satu baris per investor; sub-baris per cabang
        </span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-2 text-left font-semibold">Investor</th>
            <th className="px-4 py-2 text-left font-semibold">Cabang</th>
            <th className="px-4 py-2 text-right font-semibold">Due bulan ini</th>
            <th className="px-4 py-2 text-right font-semibold">Kumulatif</th>
            <th className="px-4 py-2 text-right font-semibold">BEP</th>
          </tr>
        </thead>
        <tbody>
          {data.investors.map((inv) => {
            const liveDue = inv.slices.reduce(
              (s, sl) => s + liveSliceDue(sl.recipientId, sl.dueThisMonth),
              0
            );
            return (
              <FragmentInvestor
                key={inv.userId}
                name={inv.name}
                multiBranch={inv.multiBranch}
                liveDue={liveDue}
                totalCumulative={inv.totalCumulative}
                totalBepTarget={inv.totalBepTarget}
                totalBepPct={inv.totalBepPct}
                slices={inv.slices.map((sl) => ({
                  branch: sl.branch,
                  bankName: sl.bankName,
                  rekeningNumber: sl.rekeningNumber,
                  permanent: sl.permanent,
                  due: liveSliceDue(sl.recipientId, sl.dueThisMonth),
                  cumulativePayout: sl.cumulativePayout,
                  bepTargetIdr: sl.bepTargetIdr,
                  bepPct: sl.bepPct,
                }))}
              />
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border bg-muted/40 font-semibold">
            <td className="px-4 py-2.5" colSpan={2}>
              Total semua investor
            </td>
            <td className="px-4 py-2.5 text-right font-mono tabular-nums">
              {formatRp(grand.due)}
            </td>
            <td className="px-4 py-2.5 text-right font-mono tabular-nums">
              {formatRp(grand.cum)}
            </td>
            <td className="px-4 py-2.5" />
          </tr>
        </tfoot>
      </table>

      {data.unlinkedRecipients.length > 0 && (
        <div className="border-t border-border px-4 py-3 text-[12px] text-muted-foreground">
          <span className="inline-flex items-center gap-1 font-medium">
            <Link2Off size={12} /> Belum tersambung ke kontrak
          </span>{" "}
          (link di tab Dividen Yeobo):{" "}
          {data.unlinkedRecipients
            .map((u) => `${u.label} (${u.branch}, ${formatIDR(u.due)})`)
            .join(" · ")}
        </div>
      )}
    </div>
  );
}

function FragmentInvestor({
  name,
  multiBranch,
  liveDue,
  totalCumulative,
  totalBepTarget,
  totalBepPct,
  slices,
}: {
  name: string;
  multiBranch: boolean;
  liveDue: number;
  totalCumulative: number;
  totalBepTarget: number;
  totalBepPct: number;
  slices: Array<{
    branch: string | null;
    bankName: string | null;
    rekeningNumber: string | null;
    permanent: boolean;
    due: number;
    cumulativePayout: number;
    bepTargetIdr: number;
    bepPct: number;
  }>;
}) {
  const bank = slices.find((s) => s.bankName || s.rekeningNumber);
  return (
    <>
      <tr className="border-t border-border bg-muted/20">
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">{name}</span>
            {multiBranch && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                {slices.length} cabang
              </span>
            )}
          </div>
          {bank && (bank.bankName || bank.rekeningNumber) && (
            <span className="text-[11px] text-muted-foreground">
              {[bank.bankName, bank.rekeningNumber].filter(Boolean).join(" · ")}
            </span>
          )}
        </td>
        <td className="px-4 py-2.5 text-[12px] text-muted-foreground">
          {multiBranch ? "—" : slices[0]?.branch ?? "—"}
        </td>
        <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold">
          {formatRp(liveDue)}
        </td>
        <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold">
          {formatRp(totalCumulative)}
        </td>
        <td className="px-4 py-2.5 text-right">
          {totalBepTarget > 0 ? (
            <BepBar pct={totalBepPct} />
          ) : (
            <span className="text-[11px] text-muted-foreground/60">—</span>
          )}
        </td>
      </tr>
      {multiBranch &&
        slices.map((sl, i) => (
          <tr key={i} className="border-t border-border/40 text-[12.5px]">
            <td className="px-4 py-1.5 pl-8 text-muted-foreground">↳</td>
            <td className="px-4 py-1.5 text-muted-foreground">
              {sl.branch ?? "—"}
              {sl.permanent && (
                <span className="ml-1.5 rounded bg-muted px-1 py-0.5 text-[9px] uppercase text-muted-foreground">
                  permanen
                </span>
              )}
            </td>
            <td className="px-4 py-1.5 text-right font-mono tabular-nums">
              {formatRp(sl.due)}
            </td>
            <td className="px-4 py-1.5 text-right font-mono tabular-nums">
              {formatRp(sl.cumulativePayout)}
            </td>
            <td className="px-4 py-1.5 text-right">
              {sl.bepTargetIdr > 0 ? (
                <BepBar pct={sl.bepPct} small />
              ) : (
                <span className="text-[11px] text-muted-foreground/60">—</span>
              )}
            </td>
          </tr>
        ))}
    </>
  );
}

function BepBar({ pct, small }: { pct: number; small?: boolean }) {
  const done = pct >= 100;
  return (
    <div className="inline-flex items-center gap-2">
      <div
        className={`${small ? "w-16" : "w-20"} h-1.5 rounded-full bg-muted overflow-hidden`}
      >
        <div
          className={`h-full rounded-full ${done ? "bg-emerald-500" : "bg-primary"}`}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
      <span className="font-mono tabular-nums text-[11px] text-muted-foreground">
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}

// ── Payout history ─────────────────────────────────────────────────────
function PayoutHistory({ data }: { data: DividendConsoleData }) {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <span className="text-sm font-bold text-foreground">
          Riwayat payout (bulan sebelumnya)
        </span>
      </div>
      <div className="divide-y divide-border/60">
        {data.history.map((h) => (
          <div key={`${h.year}-${h.month}`} className="px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-foreground">
                {MONTH_FULL_NAMES[h.month - 1]} {h.year}
              </span>
              <span className="font-mono tabular-nums text-[13px] font-semibold text-foreground">
                {formatRp(h.total)}
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-muted-foreground">
              {h.entries.map((e, i) => (
                <span key={i}>
                  {e.investorName}
                  {e.branch ? ` (${e.branch})` : ""}:{" "}
                  <span className="font-mono tabular-nums text-foreground">
                    {formatIDR(e.amountIdr)}
                  </span>
                  {e.paidAt ? ` · ${formatDateID(e.paidAt)}` : ""}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
