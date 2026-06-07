"use client";

import { Fragment, useMemo, useState, useTransition, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Edit2, Layers, Loader2, Plus, Trash2 } from "lucide-react";
import {
  upsertPayout,
  bulkUpsertPayouts,
  deletePayout,
  listPayoutsForContract,
  type InvestorPayout,
} from "@/lib/actions/investor-payouts.actions";
import type { InvestorContract } from "@/lib/actions/investor.actions";
import { formatRp } from "@/lib/cashflow/format";
import { MONTH_NAMES } from "@/lib/utils/date-formats";

interface Investor {
  userId: string;
  fullName: string | null;
  email: string | null;
}


export function InvestorPayoutsManager({
  contracts,
  investors,
}: {
  contracts: InvestorContract[];
  investors: Investor[];
}) {
  const [selectedContract, setSelectedContract] = useState(
    contracts[0]?.id ?? ""
  );
  const [payouts, setPayouts] = useState<InvestorPayout[]>([]);
  const [editing, setEditing] = useState<InvestorPayout | "new" | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const router = useRouter();

  const contract = useMemo(
    () => contracts.find((c) => c.id === selectedContract),
    [contracts, selectedContract]
  );
  const investorName = useMemo(() => {
    if (!contract) return "";
    const i = investors.find((x) => x.userId === contract.userId);
    return i?.fullName ?? i?.email ?? contract.userId.slice(0, 8);
  }, [contract, investors]);

  useEffect(() => {
    if (!selectedContract) return;
    listPayoutsForContract(selectedContract).then(setPayouts);
  }, [selectedContract]);

  if (contracts.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
        Buat kontrak dulu di tab &ldquo;Kontrak&rdquo; sebelum bisa input payouts.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <label className="text-xs flex items-center gap-2">
          <span className="text-muted-foreground">Kontrak:</span>
          <select
            value={selectedContract}
            onChange={(e) => setSelectedContract(e.target.value)}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
          >
            {contracts.map((c) => {
              const i = investors.find((x) => x.userId === c.userId);
              const name = i?.fullName ?? i?.email ?? c.userId.slice(0, 8);
              return (
                <option key={c.id} value={c.id}>
                  {name} — {c.businessUnit}
                  {c.branch ? ` · ${c.branch}` : ""}
                </option>
              );
            })}
          </select>
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setBulkOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg border border-border text-sm font-semibold hover:bg-muted"
          >
            <Layers size={14} /> Input massal
          </button>
          {contract && (
            <button
              type="button"
              onClick={() => setEditing("new")}
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg bg-primary text-primary-foreground text-sm font-semibold"
            >
              <Plus size={14} /> Tambah payout
            </button>
          )}
        </div>
      </div>

      {contract && (
        <p className="text-xs text-muted-foreground">
          {investorName} · {contract.businessUnit}
          {contract.branch ? ` · Cabang ${contract.branch}` : ""} · Bagi hasil{" "}
          {contract.bagiHasilPct}% / bulan · Total investasi{" "}
          {formatRp(contract.totalInvestIdr)}
        </p>
      )}

      <div className="rounded-2xl border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <th className="px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                Periode laba
              </th>
              <th className="px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground text-right">
                Jumlah
              </th>
              <th className="px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                Tanggal transfer
              </th>
              <th className="px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                Referensi
              </th>
              <th className="px-3 py-2 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {payouts.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  Belum ada payout.
                </td>
              </tr>
            ) : (
              payouts.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">
                    {MONTH_NAMES[p.periodMonth - 1]} {p.periodYear}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">
                    {formatRp(p.amountIdr)}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {p.paidAt
                      ? new Date(p.paidAt).toLocaleDateString("id-ID", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                    {p.ref ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => setEditing(p)}
                      className="text-muted-foreground hover:text-foreground p-1"
                      aria-label="Edit"
                    >
                      <Edit2 size={14} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editing && contract && (
        <PayoutForm
          payout={editing === "new" ? null : editing}
          contract={contract}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            listPayoutsForContract(selectedContract).then(setPayouts);
            router.refresh();
          }}
        />
      )}

      {bulkOpen && (
        <BulkPayoutForm
          contracts={contracts}
          investors={investors}
          onClose={() => setBulkOpen(false)}
          onSaved={() => {
            setBulkOpen(false);
            if (selectedContract)
              listPayoutsForContract(selectedContract).then(setPayouts);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

const YEOBO_BU_P = "Yeobo Space";
const BRANCH_RANK_P: Record<string, number> = {
  Tlogosari: 0,
  Tembalang: 1,
  Jebres: 2,
};

/**
 * Bulk payout input — one period, many investors at once. Shared
 * year/month/transfer-date/ref; per-contract amount. Rows left blank are
 * skipped. Contracts grouped by BU (Yeobo per branch) for fast scanning.
 */
function BulkPayoutForm({
  contracts,
  investors,
  onClose,
  onSaved,
}: {
  contracts: InvestorContract[];
  investors: Investor[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const now = new Date();
  const [periodYear, setPeriodYear] = useState(now.getFullYear());
  const [periodMonth, setPeriodMonth] = useState(now.getMonth() + 1);
  const [paidAt, setPaidAt] = useState("");
  const [ref, setRef] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const nameOf = (c: InvestorContract) => {
    const i = investors.find((x) => x.userId === c.userId);
    return i?.fullName ?? i?.email ?? c.userId.slice(0, 8);
  };
  const groupLabel = (c: InvestorContract) =>
    c.businessUnit === YEOBO_BU_P
      ? `${YEOBO_BU_P} — ${c.branch || "(tanpa cabang)"}`
      : c.businessUnit;

  const ordered = useMemo(() => {
    return [...contracts].sort((a, b) => {
      const ra = a.businessUnit === YEOBO_BU_P ? 0 : 1;
      const rb = b.businessUnit === YEOBO_BU_P ? 0 : 1;
      return (
        ra - rb ||
        a.businessUnit.localeCompare(b.businessUnit) ||
        (BRANCH_RANK_P[a.branch ?? ""] ?? 99) -
          (BRANCH_RANK_P[b.branch ?? ""] ?? 99) ||
        (a.branch ?? "").localeCompare(b.branch ?? "") ||
        nameOf(a).localeCompare(nameOf(b))
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contracts, investors]);

  const total = ordered.reduce((s, c) => s + (Number(amounts[c.id]) || 0), 0);
  const filled = ordered.filter((c) => Number(amounts[c.id]) > 0).length;

  function submit() {
    startTransition(async () => {
      const res = await bulkUpsertPayouts({
        periodYear,
        periodMonth,
        paidAt: paidAt ? new Date(paidAt).toISOString() : null,
        ref: ref || null,
        rows: ordered.map((c) => ({
          contractId: c.id,
          amountIdr: Number(amounts[c.id]) || 0,
        })),
      });
      if (!res.ok) {
        toast.error(res.error ?? "Gagal");
        return;
      }
      toast.success(`${res.data?.count ?? 0} payout disimpan`);
      onSaved();
    });
  }

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const modal = (
    <div
      className="fixed inset-0 z-50 bg-foreground/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-card border border-border p-5 space-y-3 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold">Input payout massal</h3>
        <p className="text-xs text-muted-foreground -mt-1">
          Isi nominal bagi hasil untuk banyak investor sekaligus pada satu
          periode. Yang dikosongkan dilewati.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <label className="text-xs">
            <span className="text-muted-foreground">Tahun</span>
            <input
              type="number"
              value={periodYear}
              onChange={(e) => setPeriodYear(Number(e.target.value))}
              className="block mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm tabular-nums"
            />
          </label>
          <label className="text-xs">
            <span className="text-muted-foreground">Bulan</span>
            <select
              value={periodMonth}
              onChange={(e) => setPeriodMonth(Number(e.target.value))}
              className="block mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm"
            >
              {MONTH_NAMES.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            <span className="text-muted-foreground">Tgl transfer (semua)</span>
            <input
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              className="block mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm"
            />
          </label>
          <label className="text-xs">
            <span className="text-muted-foreground">Ref (semua)</span>
            <input
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder="opsional"
              className="block mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm font-mono"
            />
          </label>
        </div>

        {ordered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Belum ada kontrak.
          </p>
        ) : (
          <div className="rounded-xl border border-border max-h-[48vh] overflow-y-auto">
            <table className="w-full text-sm">
              <tbody>
                {ordered.map((c, idx) => {
                  const lbl = groupLabel(c);
                  const showHeader =
                    idx === 0 || groupLabel(ordered[idx - 1]) !== lbl;
                  return (
                    <Fragment key={c.id}>
                      {showHeader && (
                        <tr className="bg-muted/50">
                          <td
                            colSpan={2}
                            className="px-3 py-1 text-xs font-semibold text-foreground"
                          >
                            {lbl}
                          </td>
                        </tr>
                      )}
                      <tr className="border-t border-border/60">
                        <td className="px-3 py-1.5">{nameOf(c)}</td>
                        <td className="px-3 py-1.5 text-right">
                          <span className="text-muted-foreground text-xs mr-1">
                            Rp
                          </span>
                          <input
                            type="number"
                            value={amounts[c.id] ?? ""}
                            onChange={(e) =>
                              setAmounts((p) => ({
                                ...p,
                                [c.id]: e.target.value,
                              }))
                            }
                            placeholder="0"
                            className="w-40 rounded-lg border border-border bg-background px-2 py-1 text-right text-sm tabular-nums"
                          />
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-xs text-muted-foreground">
            {filled} investor · total{" "}
            <span className="font-semibold text-foreground tabular-nums">
              {formatRp(total)}
            </span>
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="h-9 px-3 rounded-lg border border-border text-sm font-semibold"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={pending || filled === 0}
              className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50"
            >
              {pending && <Loader2 size={14} className="animate-spin" />}
              Simpan semua ({filled})
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(modal, document.body);
}

function PayoutForm({
  payout,
  contract,
  onClose,
  onSaved,
}: {
  payout: InvestorPayout | null;
  contract: InvestorContract;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = !payout;
  const now = new Date();
  const [periodYear, setPeriodYear] = useState(
    payout?.periodYear ?? now.getFullYear()
  );
  const [periodMonth, setPeriodMonth] = useState(
    payout?.periodMonth ?? now.getMonth() + 1
  );
  const [amount, setAmount] = useState(String(payout?.amountIdr ?? ""));
  const [paidAt, setPaidAt] = useState(
    payout?.paidAt ? payout.paidAt.slice(0, 10) : ""
  );
  const [ref, setRef] = useState(payout?.ref ?? "");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const res = await upsertPayout({
        id: payout?.id,
        contractId: contract.id,
        periodYear,
        periodMonth,
        amountIdr: Number(amount),
        paidAt: paidAt ? new Date(paidAt).toISOString() : null,
        ref: ref || null,
      });
      if (!res.ok) {
        toast.error(res.error ?? "Gagal");
        return;
      }
      toast.success(isNew ? "Payout dicatat" : "Payout diperbarui");
      onSaved();
    });
  }
  function remove() {
    if (!payout) return;
    if (!confirm("Hapus payout ini?")) return;
    startTransition(async () => {
      const res = await deletePayout(payout.id);
      if (!res.ok) {
        toast.error(res.error ?? "Gagal");
        return;
      }
      toast.success("Payout dihapus");
      onSaved();
    });
  }

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const modal = (
    <div
      className="fixed inset-0 z-50 bg-foreground/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-card border border-border p-5 space-y-3 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold">
          {isNew ? "Tambah payout" : "Edit payout"}
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs">
            <span className="text-muted-foreground">Tahun</span>
            <input
              type="number"
              value={periodYear}
              onChange={(e) => setPeriodYear(Number(e.target.value))}
              className="block mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm tabular-nums"
            />
          </label>
          <label className="text-xs">
            <span className="text-muted-foreground">Bulan</span>
            <select
              value={periodMonth}
              onChange={(e) => setPeriodMonth(Number(e.target.value))}
              className="block mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm"
            >
              {MONTH_NAMES.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs col-span-2">
            <span className="text-muted-foreground">Jumlah (Rp)</span>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="block mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm tabular-nums"
            />
          </label>
          <label className="text-xs">
            <span className="text-muted-foreground">Tanggal transfer</span>
            <input
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              className="block mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm"
            />
          </label>
          <label className="text-xs">
            <span className="text-muted-foreground">Referensi</span>
            <input
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              className="block mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm font-mono"
            />
          </label>
        </div>
        <div className="flex items-center justify-between pt-2">
          {!isNew && (
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="inline-flex items-center gap-1 text-destructive text-sm font-semibold"
            >
              <Trash2 size={14} /> Hapus
            </button>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="h-9 px-3 rounded-lg border border-border text-sm font-semibold"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={pending}
              className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-2"
            >
              {pending && <Loader2 size={14} className="animate-spin" />}
              Simpan
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(modal, document.body);
}
