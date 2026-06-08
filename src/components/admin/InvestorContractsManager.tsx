"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Edit2, Layers, Loader2, Plus, Trash2 } from "lucide-react";
import {
  upsertInvestorContract,
  bulkCreateInvestorContracts,
  deleteInvestorContract,
  type InvestorContract,
} from "@/lib/actions/investor.actions";
import { getAutoSplitBranches } from "@/lib/cashflow/branch-split";
import { formatRp } from "@/lib/cashflow/format";

const YEOBO_BU = "Yeobo Space";
const YEOBO_BRANCH_RANK: Record<string, number> = {
  Tlogosari: 0,
  Tembalang: 1,
  Jebres: 2,
};

/** Group contracts by business unit; Yeobo Space split further per branch. */
function buildContractGroups(contracts: InvestorContract[]) {
  const buNames = [...new Set(contracts.map((c) => c.businessUnit))].sort((a, b) =>
    a === YEOBO_BU ? -1 : b === YEOBO_BU ? 1 : a.localeCompare(b)
  );
  const groups: { key: string; label: string; rows: InvestorContract[] }[] = [];
  for (const bu of buNames) {
    const buRows = contracts.filter((c) => c.businessUnit === bu);
    if (bu === YEOBO_BU) {
      const branches = [...new Set(buRows.map((c) => c.branch ?? ""))].sort(
        (a, b) =>
          (YEOBO_BRANCH_RANK[a] ?? 99) - (YEOBO_BRANCH_RANK[b] ?? 99) ||
          a.localeCompare(b)
      );
      for (const br of branches) {
        groups.push({
          key: `${bu}|${br}`,
          label: `${bu} — ${br || "(tanpa cabang)"}`,
          rows: buRows.filter((c) => (c.branch ?? "") === br),
        });
      }
    } else {
      groups.push({ key: bu, label: bu, rows: buRows });
    }
  }
  return groups;
}

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
  // `contract` = prefill source (null for blank). `isNew` = create vs edit.
  // Duplicate = prefill from an existing contract but isNew=true.
  const [form, setForm] = useState<{
    contract: InvestorContract | null;
    isNew: boolean;
  } | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);

  const investorNameById = new Map(
    investors.map((i) => [i.userId, i.fullName ?? i.email ?? "—"])
  );
  const groups = useMemo(() => buildContractGroups(contracts), [contracts]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Kontrak investor per (investor × unit bisnis). Bagi hasil
          dihitung dari net profit bulanan.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setBatchOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg border border-border text-sm font-semibold hover:bg-muted"
          >
            <Layers size={14} /> Batch tambah
          </button>
          <button
            type="button"
            onClick={() => setForm({ contract: null, isNew: true })}
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg bg-primary text-primary-foreground text-sm font-semibold"
          >
            <Plus size={14} /> Tambah kontrak
          </button>
        </div>
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
              <th className="px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground text-right">
                Bagi hasil
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
              groups.map((g) => (
                <Fragment key={g.key}>
                  <tr className="bg-muted/60 border-t border-border">
                    <td colSpan={10} className="px-3 py-1.5">
                      <span className="text-xs font-semibold text-foreground">
                        {g.label}
                      </span>
                      <span className="text-[11px] font-normal text-muted-foreground">
                        {" "}
                        · {g.rows.length} kontrak ·{" "}
                        {formatRp(
                          g.rows.reduce((s, c) => s + c.totalInvestIdr, 0)
                        )}
                      </span>
                    </td>
                  </tr>
                  {g.rows.map((c) => (
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
                    {c.bagiHasilPct}%
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
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setForm({ contract: c, isNew: false })}
                      className="text-muted-foreground hover:text-foreground p-1"
                      aria-label="Edit"
                      title="Edit"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm({ contract: c, isNew: true })}
                      className="text-muted-foreground hover:text-foreground p-1"
                      aria-label="Duplikat"
                      title="Duplikat kontrak"
                    >
                      <Copy size={14} />
                    </button>
                  </td>
                </tr>
                  ))}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {form && (
        <ContractForm
          contract={form.contract}
          isNew={form.isNew}
          investors={investors}
          businessUnits={businessUnits}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            router.refresh();
          }}
        />
      )}

      {batchOpen && (
        <BatchContractForm
          investors={investors}
          businessUnits={businessUnits}
          contracts={contracts}
          onClose={() => setBatchOpen(false)}
          onSaved={() => {
            setBatchOpen(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

interface BatchRow {
  id: number;
  userId: string;
  businessUnit: string;
  branch: string;
  bagiHasil: string;
  durasi: string;
  permanent: boolean;
  startDate: string;
  invest: string;
  bep: string;
  ref: string;
}

/**
 * Batch add contracts: each row is a FULLY independent contract — unit
 * bisnis, cabang, bagi hasil %, durasi, start, investasi, BEP target and
 * ref are all editable per row. Adding a new row prefills the term fields
 * from the previous one (fast entry when terms repeat). Investors already
 * contracted for a row's BU+branch, or already picked in another row with
 * the same BU+branch, are filtered out of that row's dropdown.
 */
function BatchContractForm({
  investors,
  businessUnits,
  contracts,
  onClose,
  onSaved,
}: {
  investors: Investor[];
  businessUnits: string[];
  contracts: InvestorContract[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const idRef = useRef(0);
  const yeoboBranches = getAutoSplitBranches(YEOBO_BU) ?? [];
  const mkRow = (prefill?: Partial<BatchRow>): BatchRow => ({
    id: ++idRef.current,
    userId: "",
    businessUnit: prefill?.businessUnit ?? businessUnits[0] ?? "",
    branch: prefill?.branch ?? "",
    bagiHasil: prefill?.bagiHasil ?? "25",
    durasi: prefill?.durasi ?? "36",
    permanent: prefill?.permanent ?? false,
    startDate: prefill?.startDate ?? "",
    invest: "",
    bep: "",
    ref: "",
  });
  const [rows, setRows] = useState<BatchRow[]>(() => [mkRow()]);
  const [pending, startTransition] = useTransition();

  const setRow = (id: number, patch: Partial<BatchRow>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const validRows = rows.filter((r) => r.userId && Number(r.invest) > 0);
  const totalInvest = validRows.reduce((s, r) => s + Number(r.invest), 0);

  const addRow = () =>
    setRows((rs) => {
      const last = rs[rs.length - 1];
      return [
        ...rs,
        mkRow(
          last && {
            businessUnit: last.businessUnit,
            branch: last.branch,
            bagiHasil: last.bagiHasil,
            durasi: last.durasi,
            permanent: last.permanent,
            startDate: last.startDate,
          }
        ),
      ];
    });

  function submit() {
    // Client-side checks mirror the server so the admin gets immediate,
    // row-specific feedback before the round-trip.
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.userId || !(Number(r.invest) > 0)) continue;
      const label = `Kontrak ${i + 1}`;
      if (r.businessUnit === YEOBO_BU && !r.branch) {
        toast.error(`${label}: pilih cabang Yeobo`);
        return;
      }
      if (!r.startDate) {
        toast.error(`${label}: isi start date`);
        return;
      }
    }
    if (validRows.length === 0) {
      toast.error("Isi minimal satu kontrak (investor + investasi)");
      return;
    }
    startTransition(async () => {
      const res = await bulkCreateInvestorContracts({
        rows: validRows.map((r) => ({
          userId: r.userId,
          businessUnit: r.businessUnit,
          branch: r.businessUnit === YEOBO_BU ? r.branch : null,
          bagiHasilPct: Number(r.bagiHasil),
          durasiBulan: r.permanent ? null : Number(r.durasi),
          startDate: r.startDate,
          totalInvestIdr: Number(r.invest),
          bepTargetIdr: Number(r.bep) > 0 ? Number(r.bep) : Number(r.invest),
          contractRef: r.ref || null,
        })),
      });
      if (!res.ok) {
        toast.error(res.error ?? "Gagal");
        return;
      }
      const { count, skipped } = res.data ?? { count: 0, skipped: 0 };
      toast.success(
        `${count} kontrak dibuat${skipped ? `, ${skipped} dilewati (sudah ada)` : ""}`
      );
      onSaved();
    });
  }

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const fieldCls =
    "block mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm";

  const modal = (
    <div
      className="fixed inset-0 z-50 bg-foreground/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-2xl bg-card border border-border p-5 space-y-3 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold">Batch tambah kontrak</h3>
        <p className="text-xs text-muted-foreground -mt-1">
          Tiap kontrak bisa beda — unit bisnis, cabang, bagi hasil, durasi,
          start, investasi, semuanya per baris. Baris baru mewarisi term dari
          baris sebelumnya supaya cepat kalau termnya sama.
        </p>

        <div className="space-y-3">
          {rows.map((r, idx) => {
            const isYeobo = r.businessUnit === YEOBO_BU;
            // Investors already contracted for this row's BU+branch, or
            // picked in another row with the SAME BU+branch.
            const sameScope = (cBu: string, cBranch: string) =>
              cBu === r.businessUnit &&
              cBranch === (isYeobo ? r.branch : "");
            const taken = new Set<string>([
              ...contracts
                .filter((c) => sameScope(c.businessUnit, c.branch ?? ""))
                .map((c) => c.userId),
              ...rows
                .filter(
                  (x) =>
                    x.id !== r.id &&
                    x.userId &&
                    sameScope(x.businessUnit, x.businessUnit === YEOBO_BU ? x.branch : "")
                )
                .map((x) => x.userId),
            ]);
            const opts = investors.filter(
              (i) => i.userId === r.userId || !taken.has(i.userId)
            );
            return (
              <div
                key={r.id}
                className="rounded-xl border border-border p-3 space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Kontrak {idx + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setRows((rs) =>
                        rs.length > 1 ? rs.filter((x) => x.id !== r.id) : rs
                      )
                    }
                    disabled={rows.length === 1}
                    className="text-muted-foreground hover:text-destructive p-1 disabled:opacity-30"
                    aria-label="Hapus kontrak"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Investor + unit bisnis + cabang */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <label className="text-xs">
                    <span className="text-muted-foreground">Investor</span>
                    <select
                      value={r.userId}
                      onChange={(e) => setRow(r.id, { userId: e.target.value })}
                      className={fieldCls}
                    >
                      <option value="">— pilih —</option>
                      {opts.map((i) => (
                        <option key={i.userId} value={i.userId}>
                          {i.fullName ?? i.email ?? i.userId.slice(0, 8)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs">
                    <span className="text-muted-foreground">Unit bisnis</span>
                    <select
                      value={r.businessUnit}
                      onChange={(e) =>
                        setRow(r.id, {
                          businessUnit: e.target.value,
                          branch:
                            e.target.value === YEOBO_BU ? r.branch : "",
                        })
                      }
                      className={fieldCls}
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
                        value={r.branch}
                        onChange={(e) => setRow(r.id, { branch: e.target.value })}
                        className={fieldCls}
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
                </div>

                {/* Bagi hasil + durasi + start */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <label className="text-xs">
                    <span className="text-muted-foreground">Bagi hasil (%)</span>
                    <input
                      type="number"
                      step="0.01"
                      value={r.bagiHasil}
                      onChange={(e) => setRow(r.id, { bagiHasil: e.target.value })}
                      className={`${fieldCls} tabular-nums`}
                    />
                  </label>
                  <label className="text-xs">
                    <span className="text-muted-foreground flex items-center justify-between gap-2">
                      <span>Durasi (bln)</span>
                      <span className="inline-flex items-center gap-1 normal-case">
                        <input
                          type="checkbox"
                          checked={r.permanent}
                          onChange={(e) =>
                            setRow(r.id, { permanent: e.target.checked })
                          }
                          className="size-3 accent-primary"
                        />
                        <span className="text-[10.5px]">Permanen</span>
                      </span>
                    </span>
                    <input
                      type="number"
                      value={r.permanent ? "" : r.durasi}
                      onChange={(e) => setRow(r.id, { durasi: e.target.value })}
                      disabled={r.permanent}
                      placeholder={r.permanent ? "∞" : ""}
                      className={`${fieldCls} tabular-nums disabled:opacity-50`}
                    />
                  </label>
                  <label className="text-xs">
                    <span className="text-muted-foreground">Start date</span>
                    <input
                      type="date"
                      value={r.startDate}
                      onChange={(e) => setRow(r.id, { startDate: e.target.value })}
                      className={fieldCls}
                    />
                  </label>
                </div>

                {/* Investasi + BEP target + ref */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <label className="text-xs">
                    <span className="text-muted-foreground">Investasi (Rp)</span>
                    <input
                      type="number"
                      value={r.invest}
                      onChange={(e) => setRow(r.id, { invest: e.target.value })}
                      placeholder="0"
                      className={`${fieldCls} tabular-nums`}
                    />
                  </label>
                  <label className="text-xs">
                    <span className="text-muted-foreground">BEP target</span>
                    <input
                      type="number"
                      value={r.bep}
                      onChange={(e) => setRow(r.id, { bep: e.target.value })}
                      placeholder={r.invest || "= investasi"}
                      className={`${fieldCls} tabular-nums`}
                    />
                  </label>
                  <label className="text-xs">
                    <span className="text-muted-foreground">Ref</span>
                    <input
                      value={r.ref}
                      onChange={(e) => setRow(r.id, { ref: e.target.value })}
                      placeholder="opsional"
                      className={`${fieldCls} font-mono`}
                    />
                  </label>
                </div>
              </div>
            );
          })}
          <button
            type="button"
            onClick={addRow}
            className="w-full px-3 py-2 text-xs font-semibold text-primary hover:bg-muted/40 rounded-lg border border-dashed border-border"
          >
            + Tambah kontrak
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-xs text-muted-foreground">
            {validRows.length} kontrak · total investasi{" "}
            <span className="font-semibold text-foreground tabular-nums">
              {formatRp(totalInvest)}
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
              disabled={pending || validRows.length === 0}
              className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50"
            >
              {pending && <Loader2 size={14} className="animate-spin" />}
              Simpan semua ({validRows.length})
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(modal, document.body);
}

function ContractForm({
  contract,
  isNew,
  investors,
  businessUnits,
  onClose,
  onSaved,
}: {
  /** Prefill source. For "duplicate" this is an existing contract but
   *  isNew=true → saved as a brand-new contract (no id). */
  contract: InvestorContract | null;
  isNew: boolean;
  investors: Investor[];
  businessUnits: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isDuplicate = isNew && !!contract;
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
  const [bagiHasil, setBagiHasil] = useState(
    String(contract?.bagiHasilPct ?? "25")
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
        id: isNew ? undefined : contract?.id,
        userId,
        businessUnit,
        branch: isYeobo ? branch : null,
        totalInvestIdr: Number(totalInvest),
        bagiHasilPct: Number(bagiHasil),
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
          {isDuplicate
            ? "Duplikat kontrak"
            : isNew
              ? "Tambah kontrak"
              : "Edit kontrak"}
        </h3>
        {isDuplicate && (
          <p className="text-xs text-muted-foreground -mt-1">
            Disalin dari kontrak {investors.find((i) => i.userId === contract?.userId)?.fullName ?? "—"}. Ubah investor/cabang lalu simpan sebagai kontrak baru.
          </p>
        )}
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
              onChange={(e) => {
                setBusinessUnit(e.target.value);
                // Reset cabang saat ganti BU (cabang hanya relevan utk
                // Yeobo Space). Biarkan admin pilih ulang.
                if (e.target.value !== YEOBO_BU) setBranch("");
              }}
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
                className="block mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm"
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
            <span className="text-muted-foreground">Bagi hasil (%)</span>
            <input
              type="number"
              step="0.01"
              value={bagiHasil}
              onChange={(e) => setBagiHasil(e.target.value)}
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
