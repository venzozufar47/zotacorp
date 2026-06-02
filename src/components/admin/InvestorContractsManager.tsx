"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Edit2, Loader2, Plus, Trash2 } from "lucide-react";
import {
  upsertInvestorContract,
  deleteInvestorContract,
  type InvestorContract,
} from "@/lib/actions/investor.actions";
import { getAutoSplitBranches } from "@/lib/cashflow/branch-split";
import { formatRp } from "@/lib/cashflow/format";

const YEOBO_BU = "Yeobo Space";

interface Investor {
  userId: string;
  fullName: string | null;
  email: string | null;
  businessUnits: string[];
}

export function InvestorContractsManager({
  contracts,
  investors,
  businessUnits,
}: {
  contracts: InvestorContract[];
  investors: Investor[];
  businessUnits: string[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<InvestorContract | "new" | null>(null);

  const investorNameById = new Map(
    investors.map((i) => [i.userId, i.fullName ?? i.email ?? "—"])
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Kontrak investor per (investor × unit bisnis). Bagi hasil
          dihitung dari net profit bulanan.
        </p>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg bg-primary text-primary-foreground text-sm font-semibold"
        >
          <Plus size={14} /> Tambah kontrak
        </button>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <th className="px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                Investor
              </th>
              <th className="px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                BU
              </th>
              <th className="px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                Cabang
              </th>
              <th className="px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground text-right">
                Investasi
              </th>
              <th className="px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground text-right" title="Sebelum BEP → Setelah BEP">
                Bagi hasil (pre→post BEP)
              </th>
              <th className="px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground text-right">
                Durasi
              </th>
              <th className="px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                Start
              </th>
              <th className="px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground text-right">
                BEP target
              </th>
              <th className="px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                Ref / Rekening
              </th>
              <th className="px-3 py-2 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {contracts.length === 0 ? (
              <tr>
                <td
                  colSpan={10}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  Belum ada kontrak.
                </td>
              </tr>
            ) : (
              contracts.map((c) => (
                <tr key={c.id} className="border-t border-border align-top">
                  <td className="px-3 py-2 font-medium">
                    {investorNameById.get(c.userId) ?? c.userId.slice(0, 8)}
                  </td>
                  <td className="px-3 py-2">{c.businessUnit}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {c.branch ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatRp(c.totalInvestIdr)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <span title="Sebelum BEP → Setelah BEP">
                      {c.bagiHasilPctBeforeBep}%
                      <span className="text-muted-foreground"> → </span>
                      {c.bagiHasilPctAfterBep}%
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {c.durasiBulan === null ? "Permanen" : `${c.durasiBulan} bln`}
                  </td>
                  <td className="px-3 py-2">{c.startDate}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatRp(c.bepTargetIdr)}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    <div>{c.contractRef ?? "—"}</div>
                    <div>
                      {c.payoutBankName || c.payoutRekeningNumber
                        ? `${c.payoutBankName ?? "—"} • ${c.payoutRekeningNumber ?? "—"}`
                        : c.payoutRekeningLabel ?? "—"}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => setEditing(c)}
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

      {editing && (
        <ContractForm
          contract={editing === "new" ? null : editing}
          investors={investors}
          businessUnits={businessUnits}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function ContractForm({
  contract,
  investors,
  businessUnits,
  onClose,
  onSaved,
}: {
  contract: InvestorContract | null;
  investors: Investor[];
  businessUnits: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = !contract;
  const [userId, setUserId] = useState(contract?.userId ?? investors[0]?.userId ?? "");
  const [businessUnit, setBusinessUnit] = useState(
    contract?.businessUnit ?? businessUnits[0] ?? ""
  );
  const [branch, setBranch] = useState(contract?.branch ?? "");
  const isYeobo = businessUnit === YEOBO_BU;
  const yeoboBranches = getAutoSplitBranches(YEOBO_BU) ?? [];
  const [totalInvest, setTotalInvest] = useState(
    String(contract?.totalInvestIdr ?? "")
  );
  const [bagiHasilBefore, setBagiHasilBefore] = useState(
    String(contract?.bagiHasilPctBeforeBep ?? contract?.bagiHasilPct ?? "25")
  );
  const [bagiHasilAfter, setBagiHasilAfter] = useState(
    String(contract?.bagiHasilPctAfterBep ?? contract?.bagiHasilPct ?? "25")
  );
  const [isPermanent, setIsPermanent] = useState(
    contract ? contract.durasiBulan === null : false
  );
  const [durasiBulan, setDurasiBulan] = useState(
    String(contract?.durasiBulan ?? "36")
  );
  const [startDate, setStartDate] = useState(contract?.startDate ?? "");
  const [bepTarget, setBepTarget] = useState(
    String(contract?.bepTargetIdr ?? "")
  );
  const [bankName, setBankName] = useState(contract?.payoutBankName ?? "");
  const [rekNumber, setRekNumber] = useState(
    contract?.payoutRekeningNumber ?? ""
  );
  const [ref, setRef] = useState(contract?.contractRef ?? "");
  const [pending, startTransition] = useTransition();

  function submit() {
    if (isYeobo && !branch) {
      toast.error("Pilih cabang untuk kontrak Yeobo Space");
      return;
    }
    startTransition(async () => {
      const res = await upsertInvestorContract({
        id: contract?.id,
        userId,
        businessUnit,
        branch: isYeobo ? branch : null,
        totalInvestIdr: Number(totalInvest),
        bagiHasilPctBeforeBep: Number(bagiHasilBefore),
        bagiHasilPctAfterBep: Number(bagiHasilAfter),
        durasiBulan: isPermanent ? null : Number(durasiBulan),
        startDate,
        bepTargetIdr: Number(bepTarget),
        payoutBankName: bankName.trim() || null,
        payoutRekeningNumber: rekNumber.trim() || null,
        payoutRekeningLabel:
          bankName.trim() && rekNumber.trim()
            ? `${bankName.trim()} • ${rekNumber.trim()}`
            : null,
        contractRef: ref || null,
      });
      if (!res.ok) {
        toast.error(res.error ?? "Gagal");
        return;
      }
      toast.success(isNew ? "Kontrak dibuat" : "Kontrak diperbarui");
      onSaved();
    });
  }

  function remove() {
    if (!contract) return;
    if (!confirm("Hapus kontrak ini? Tindakan tidak bisa di-undo.")) return;
    startTransition(async () => {
      const res = await deleteInvestorContract(contract.id);
      if (!res.ok) {
        toast.error(res.error ?? "Gagal");
        return;
      }
      toast.success("Kontrak dihapus");
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
        className="w-full max-w-lg rounded-2xl bg-card border border-border p-5 space-y-3 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-foreground">
          {isNew ? "Tambah kontrak" : "Edit kontrak"}
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs col-span-2">
            <span className="text-muted-foreground">Investor</span>
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              disabled={!isNew}
              className="block mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm disabled:opacity-60"
            >
              {investors.map((i) => (
                <option key={i.userId} value={i.userId}>
                  {i.fullName ?? i.email ?? i.userId.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            <span className="text-muted-foreground">Unit bisnis</span>
            <select
              value={businessUnit}
              onChange={(e) => setBusinessUnit(e.target.value)}
              disabled={!isNew}
              className="block mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm disabled:opacity-60"
            >
              {businessUnits.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
          {isYeobo && (
            <label className="text-xs">
              <span className="text-muted-foreground">Cabang</span>
              <select
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                disabled={!isNew}
                className="block mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm disabled:opacity-60"
              >
                <option value="">— pilih cabang —</option>
                {yeoboBranches.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="text-xs">
            <span className="text-muted-foreground">Start date</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="block mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm"
            />
          </label>
          <label className="text-xs">
            <span className="text-muted-foreground">Total investasi (Rp)</span>
            <input
              type="number"
              value={totalInvest}
              onChange={(e) => setTotalInvest(e.target.value)}
              className="block mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm tabular-nums"
            />
          </label>
          <label className="text-xs">
            <span className="text-muted-foreground">Bagi hasil sebelum BEP (%)</span>
            <input
              type="number"
              step="0.01"
              value={bagiHasilBefore}
              onChange={(e) => setBagiHasilBefore(e.target.value)}
              className="block mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm tabular-nums"
            />
          </label>
          <label className="text-xs">
            <span className="text-muted-foreground">Bagi hasil setelah BEP (%)</span>
            <input
              type="number"
              step="0.01"
              value={bagiHasilAfter}
              onChange={(e) => setBagiHasilAfter(e.target.value)}
              className="block mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm tabular-nums"
            />
          </label>
          <label className="text-xs">
            <span className="text-muted-foreground flex items-center justify-between gap-2">
              <span>Durasi (bulan)</span>
              <span className="inline-flex items-center gap-1 normal-case">
                <input
                  type="checkbox"
                  checked={isPermanent}
                  onChange={(e) => setIsPermanent(e.target.checked)}
                  className="size-3 accent-primary"
                />
                <span className="text-[10.5px]">Permanen</span>
              </span>
            </span>
            <input
              type="number"
              value={isPermanent ? "" : durasiBulan}
              onChange={(e) => setDurasiBulan(e.target.value)}
              disabled={isPermanent}
              placeholder={isPermanent ? "∞ tak hingga" : ""}
              className="block mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm tabular-nums disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </label>
          <label className="text-xs">
            <span className="text-muted-foreground">BEP target (Rp)</span>
            <input
              type="number"
              value={bepTarget}
              onChange={(e) => setBepTarget(e.target.value)}
              className="block mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm tabular-nums"
            />
          </label>
          <label className="text-xs">
            <span className="text-muted-foreground">Nama bank</span>
            <input
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="BCA"
              className="block mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm"
            />
          </label>
          <label className="text-xs">
            <span className="text-muted-foreground">Nomor rekening</span>
            <input
              value={rekNumber}
              onChange={(e) => setRekNumber(e.target.value)}
              placeholder="1234567890"
              inputMode="numeric"
              className="block mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm font-mono tabular-nums"
            />
          </label>
          <label className="text-xs col-span-2">
            <span className="text-muted-foreground">Contract ref</span>
            <input
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder="ZTA-INV-2025-014"
              className="block mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm font-mono"
            />
          </label>
        </div>
        <div className="flex items-center justify-between gap-2 pt-2">
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
