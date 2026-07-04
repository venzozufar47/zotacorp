"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type {
  DividendRecipient,
  DividendBranchConfig,
} from "@/lib/actions/yeobo-dividend.actions";
import {
  upsertDividendRecipient,
  deleteDividendRecipient,
  upsertDividendBranchConfig,
  linkDividendRecipient,
  createPlaceholderInvestor,
  ensurePlaceholderClaimToken,
} from "@/lib/actions/yeobo-dividend.actions";
import type {
  InvestorSummary,
  InvestorContract,
} from "@/lib/actions/investor.actions";

const BRANCHES = ["Tlogosari", "Tembalang", "Jebres"] as const;

export function YeoboDividendStructureManager({
  recipientsByBranch,
  configByBranch,
  investors,
  contracts,
}: {
  recipientsByBranch: Record<string, DividendRecipient[]>;
  configByBranch: Record<string, DividendBranchConfig>;
  investors: InvestorSummary[];
  contracts: InvestorContract[];
}) {
  const router = useRouter();
  const [branch, setBranch] = useState<string>("Tlogosari");
  const [busy, setBusy] = useState(false);
  const [placeholderOpen, setPlaceholderOpen] = useState(false);

  const recipients = recipientsByBranch[branch] ?? [];
  const config = configByBranch[branch];

  const totalInv = config?.totalInvestmentIdr ?? null;
  // Σ pool investor — pakai nominal investasi (presisi) bila ada.
  const investorPctSum = recipients
    .filter((r) => r.kind === "investor")
    .reduce(
      (s, r) =>
        s +
        (r.investIdr != null && totalInv
          ? (r.investIdr / totalInv) * 100
          : r.poolPct ?? 0),
      0
    );
  const mgmtBefore = config?.mgmtPctBeforeBep ?? 35;
  const mgmtAfter = config?.mgmtPctAfterBep ?? 50;
  // Management = sisa, jadi % efektifnya menyesuaikan kalau pool ≠ 100%.
  const effMgmtBefore = 100 - ((100 - mgmtBefore) * investorPctSum) / 100;
  const effMgmtAfter = 100 - ((100 - mgmtAfter) * investorPctSum) / 100;
  const overSubscribed = Math.abs(investorPctSum - 100) > 0.01;

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error ?? "Gagal");
      return false;
    }
    router.refresh();
    return true;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Branch selector */}
        <div className="inline-flex items-center gap-1 rounded-lg border border-input bg-background p-0.5">
          {BRANCHES.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBranch(b)}
              className={
                "h-8 px-3 rounded-md text-xs font-semibold transition " +
                (branch === b
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted")
              }
            >
              {b}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setPlaceholderOpen(true)}
          className="h-8 rounded-md border border-primary bg-primary/5 px-3 text-xs font-semibold text-primary hover:bg-primary/10"
        >
          + Placeholder investor
        </button>
      </div>

      {placeholderOpen && (
        <PlaceholderModal
          defaultBranch={branch}
          onClose={() => setPlaceholderOpen(false)}
          onDone={() => router.refresh()}
        />
      )}

      <ConfigCard
        key={branch}
        branch={branch}
        config={config}
        busy={busy}
        onSave={(input) => run(() => upsertDividendBranchConfig(input))}
      />

      {/* Recipients */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">
            Penerima bagi hasil — {branch}
          </h3>
          <div className="text-right">
            <div
              className={
                "text-xs font-semibold " +
                (overSubscribed ? "text-amber-600" : "text-emerald-600")
              }
            >
              Σ pool investor: {investorPctSum.toFixed(2)}%
              {overSubscribed ? "" : " ✓"}
            </div>
            {overSubscribed && (
              <div className="text-[11px] text-muted-foreground">
                Management efektif {effMgmtBefore.toFixed(1)}% (sblm BEP) /{" "}
                {effMgmtAfter.toFixed(1)}% (ssdh) — selisihnya ditanggung
                management
              </div>
            )}
          </div>
        </div>
        <div className="divide-y divide-border/60">
          {recipients.map((r) => (
            <RecipientRow
              key={r.id}
              recipient={r}
              busy={busy}
              investors={investors}
              contracts={contracts}
              branch={branch}
              totalInvestment={config?.totalInvestmentIdr ?? null}
              onSave={(input) => run(() => upsertDividendRecipient(input))}
              onDelete={() =>
                run(() => deleteDividendRecipient(r.id))
              }
              onLink={(userId, contractId) =>
                run(() =>
                  linkDividendRecipient({ recipientId: r.id, userId, contractId })
                )
              }
            />
          ))}
          {recipients.length === 0 && (
            <p className="px-4 py-4 text-xs text-muted-foreground italic">
              Belum ada penerima. Tambah di bawah.
            </p>
          )}
        </div>
        <AddRecipient
          branch={branch}
          busy={busy}
          nextSort={recipients.length}
          onAdd={(input) => run(() => upsertDividendRecipient(input))}
        />
      </div>

      <p className="text-[11px] text-muted-foreground leading-snug">
        Penerima boleh dibuat tanpa akun dulu. Hubungkan ke investor terdaftar +
        kontrak cabang kapan saja — dividen bulan-bulan sebelumnya otomatis
        di-backfill ke dashboard investor.
      </p>
    </div>
  );
}

function ConfigCard({
  branch,
  config,
  busy,
  onSave,
}: {
  branch: string;
  config?: DividendBranchConfig;
  busy: boolean;
  onSave: (input: {
    branch: string;
    mgmtPctBeforeBep: number;
    mgmtPctAfterBep: number;
    totalInvestmentIdr: number | null;
    bepReachedYm: string | null;
  }) => Promise<boolean>;
}) {
  const [before, setBefore] = useState(config?.mgmtPctBeforeBep ?? 35);
  const [after, setAfter] = useState(config?.mgmtPctAfterBep ?? 50);
  const [totalInv, setTotalInv] = useState<string>(
    config?.totalInvestmentIdr != null ? String(config.totalInvestmentIdr) : ""
  );
  const [reachedYm, setReachedYm] = useState(config?.bepReachedYm ?? "");

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <h3 className="text-sm font-semibold text-foreground">
        Rasio pool & BEP — {branch}
      </h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Mgmt % sebelum BEP">
          <input
            type="number"
            value={before}
            onChange={(e) => setBefore(Number(e.target.value))}
            className="num-input"
          />
        </Field>
        <Field label="Mgmt % setelah BEP">
          <input
            type="number"
            value={after}
            onChange={(e) => setAfter(Number(e.target.value))}
            className="num-input"
          />
        </Field>
        <Field label="Total investasi cabang (Rp)">
          <input
            type="number"
            value={totalInv}
            onChange={(e) => setTotalInv(e.target.value)}
            placeholder="mis. 110000000"
            className="num-input"
          />
        </Field>
        <Field label="Override bulan BEP (YYYY-MM)">
          <input
            type="text"
            value={reachedYm}
            onChange={(e) => setReachedYm(e.target.value)}
            placeholder="opsional"
            className="num-input"
          />
        </Field>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Investor pool = 100% − mgmt%. Sebelum BEP investor dapat{" "}
        {100 - before}%, setelah BEP {100 - after}%. BEP (flip serentak)
        tercapai saat akumulasi bagi hasil investor ≥ total investasi.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() =>
          onSave({
            branch,
            mgmtPctBeforeBep: before,
            mgmtPctAfterBep: after,
            totalInvestmentIdr: totalInv.trim() === "" ? null : Number(totalInv),
            bepReachedYm: reachedYm.trim() || null,
          })
        }
        className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
      >
        Simpan rasio & BEP
      </button>
      <style jsx>{`
        :global(.num-input) {
          width: 100%;
          border-radius: 0.375rem;
          border: 1px solid hsl(var(--input));
          background: hsl(var(--background));
          padding: 0.35rem 0.5rem;
          font-size: 0.75rem;
        }
      `}</style>
    </div>
  );
}

function RecipientRow({
  recipient,
  busy,
  investors,
  contracts,
  branch,
  totalInvestment,
  onSave,
  onDelete,
  onLink,
}: {
  recipient: DividendRecipient;
  busy: boolean;
  investors: InvestorSummary[];
  contracts: InvestorContract[];
  branch: string;
  totalInvestment: number | null;
  onSave: (input: {
    id: string;
    branch: string;
    label: string;
    kind: "management" | "investor";
    sortOrder: number;
    poolPct: number | null;
    investIdr: number | null;
  }) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
  onLink: (userId: string | null, contractId: string | null) => Promise<boolean>;
}) {
  const r = recipient;
  const router = useRouter();
  const [label, setLabel] = useState(r.label);
  const [copying, setCopying] = useState(false);

  // Salin claim link pendaftaran untuk slot placeholder (belum tersambung).
  async function copyClaimLink() {
    setCopying(true);
    let token = r.claimToken;
    if (!token) {
      const res = await ensurePlaceholderClaimToken(r.id);
      if (!res.ok || !res.data) {
        setCopying(false);
        toast.error(res.ok ? "Gagal membuat link" : res.error);
        return;
      }
      token = res.data.claimToken;
    }
    const link = `${window.location.origin}/register-investor?claim=${token}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link pendaftaran tersalin — kirim ke investor");
    } catch {
      toast.message(link);
    }
    setCopying(false);
    router.refresh();
  }
  const [pct, setPct] = useState<string>(r.poolPct != null ? String(r.poolPct) : "");
  const [invest, setInvest] = useState<string>(
    r.investIdr != null ? String(r.investIdr) : ""
  );
  // Amount mode (edit investasi Rp; BEP = exact amount; % derived) only
  // when this recipient already has an invest amount. Recipients that use
  // % directly (e.g. Tembalang) stay in % mode even if a total is set.
  const amountMode = totalInvestment != null && r.investIdr != null;
  const derivedPct =
    amountMode && totalInvestment
      ? ((Number(invest) || 0) / totalInvestment) * 100
      : Number(pct) || 0;
  const bepNominal = amountMode
    ? Number(invest) || 0
    : totalInvestment != null
      ? Math.round(((Number(pct) || 0) / 100) * totalInvestment)
      : null;

  // Investors who hold a Yeobo contract for THIS branch → linkable.
  const linkable = useMemo(
    () =>
      investors
        .map((inv) => ({
          inv,
          contract: contracts.find(
            (c) =>
              c.userId === inv.userId &&
              c.businessUnit === "Yeobo Space" &&
              c.branch === branch
          ),
        }))
        .filter((x) => !!x.contract),
    [investors, contracts, branch]
  );

  const linkedName =
    r.userId && investors.find((i) => i.userId === r.userId)?.fullName;

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2 text-xs">
      <span
        className={
          "rounded px-1.5 py-0.5 text-[9px] font-bold uppercase " +
          (r.kind === "management"
            ? "bg-muted text-muted-foreground"
            : "bg-primary/10 text-primary")
        }
      >
        {r.kind === "management" ? "Mgmt" : "Investor"}
      </span>
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        className="w-32 rounded-md border border-input bg-background px-2 py-1"
      />
      {r.kind === "investor" && amountMode && (
        <label className="inline-flex items-center gap-1 text-muted-foreground">
          Rp
          <input
            type="number"
            value={invest}
            onChange={(e) => setInvest(e.target.value)}
            className="w-28 rounded-md border border-input bg-background px-2 py-1 text-right"
            placeholder="investasi"
          />
        </label>
      )}
      {r.kind === "investor" && !amountMode && (
        <label className="inline-flex items-center gap-1 text-muted-foreground">
          <input
            type="number"
            value={pct}
            onChange={(e) => setPct(e.target.value)}
            className="w-16 rounded-md border border-input bg-background px-2 py-1 text-right"
          />
          % pool
        </label>
      )}
      {r.kind === "investor" && bepNominal != null && (
        <span className="text-[10px] text-muted-foreground">
          {amountMode ? `= ${derivedPct.toFixed(2)}% pool · ` : ""}BEP Rp
          {bepNominal.toLocaleString("id-ID")}
        </span>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() =>
          onSave({
            id: r.id,
            branch: r.branch,
            label,
            kind: r.kind,
            sortOrder: r.sortOrder,
            poolPct:
              r.kind === "investor"
                ? Math.round(derivedPct * 1000) / 1000
                : null,
            investIdr:
              r.kind === "investor" && amountMode
                ? Number(invest || 0)
                : null,
          })
        }
        className="rounded-md border border-input px-2 py-1 font-semibold hover:bg-muted"
      >
        Simpan
      </button>

      {/* Linking (investor only) */}
      {r.kind === "investor" && (
        <span className="ml-auto flex items-center gap-1.5">
          {r.contractId ? (
            <>
              <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600">
                ↔ {linkedName || "tersambung"}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => onLink(null, null)}
                className="text-[10px] text-muted-foreground hover:text-destructive underline"
              >
                lepas
              </button>
            </>
          ) : (
            <>
              {r.placeholderName && (
                <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">
                  placeholder
                </span>
              )}
              <button
                type="button"
                disabled={busy || copying}
                onClick={copyClaimLink}
                className="rounded-md border border-primary/50 bg-primary/5 px-1.5 py-1 text-[10px] font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
                title="Salin link pendaftaran untuk investor (auto-connect saat daftar)"
              >
                {copying ? "…" : "🔗 Salin link"}
              </button>
              <select
                disabled={busy}
                defaultValue=""
                onChange={(e) => {
                  const picked = linkable.find(
                    (x) => x.contract!.id === e.target.value
                  );
                  if (picked) onLink(picked.inv.userId, picked.contract!.id);
                }}
                className="rounded-md border border-input bg-background px-2 py-1 text-[11px]"
              >
                <option value="">— hubungkan ke investor —</option>
                {linkable.map((x) => (
                  <option key={x.contract!.id} value={x.contract!.id}>
                    {x.inv.fullName || x.inv.email || x.inv.userId.slice(0, 8)}
                  </option>
                ))}
              </select>
            </>
          )}
        </span>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={onDelete}
        className={
          "text-muted-foreground hover:text-destructive " +
          (r.kind === "investor" ? "" : "ml-auto")
        }
        aria-label="Hapus penerima"
        title="Hapus penerima"
      >
        ×
      </button>
    </div>
  );
}

function AddRecipient({
  branch,
  busy,
  nextSort,
  onAdd,
}: {
  branch: string;
  busy: boolean;
  nextSort: number;
  onAdd: (input: {
    branch: string;
    label: string;
    kind: "management" | "investor";
    sortOrder: number;
    poolPct: number | null;
  }) => Promise<boolean>;
}) {
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<"management" | "investor">("investor");
  const [pct, setPct] = useState("");

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-t border-border bg-muted/20 text-xs">
      <select
        value={kind}
        onChange={(e) => setKind(e.target.value as "management" | "investor")}
        className="rounded-md border border-input bg-background px-2 py-1"
      >
        <option value="investor">Investor</option>
        <option value="management">Management</option>
      </select>
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Nama / label"
        className="w-40 rounded-md border border-input bg-background px-2 py-1"
      />
      {kind === "investor" && (
        <input
          type="number"
          value={pct}
          onChange={(e) => setPct(e.target.value)}
          placeholder="% pool"
          className="w-20 rounded-md border border-input bg-background px-2 py-1 text-right"
        />
      )}
      <button
        type="button"
        disabled={busy || !label.trim()}
        onClick={async () => {
          const ok = await onAdd({
            branch,
            label,
            kind,
            sortOrder: nextSort,
            poolPct: kind === "investor" ? Number(pct || 0) : null,
          });
          if (ok) {
            setLabel("");
            setPct("");
          }
        }}
        className="rounded-md bg-primary px-3 py-1 font-semibold text-primary-foreground disabled:opacity-50"
      >
        + Tambah
      </button>
    </div>
  );
}

function PlaceholderModal({
  defaultBranch,
  onClose,
  onDone,
}: {
  defaultBranch: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [rows, setRows] = useState<Array<{ branch: string; invest: string }>>([
    { branch: defaultBranch, invest: "" },
  ]);
  const [busy, setBusy] = useState(false);
  const [claimLink, setClaimLink] = useState<string | null>(null);

  async function submit() {
    const branches = rows
      .filter((r) => r.branch && Number(r.invest) > 0)
      .map((r) => ({ branch: r.branch, investIdr: Number(r.invest) }));
    if (!name.trim()) return void toast.error("Nama wajib");
    if (branches.length === 0)
      return void toast.error("Isi minimal 1 cabang dengan nominal > 0");
    setBusy(true);
    const res = await createPlaceholderInvestor({
      name: name.trim(),
      contact: contact.trim() || null,
      branches,
    });
    setBusy(false);
    if (!res.ok || !res.data)
      return void toast.error(res.ok ? "Gagal membuat placeholder" : res.error);
    setClaimLink(
      `${window.location.origin}/register-investor?claim=${res.data.claimToken}`
    );
    onDone();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-card p-5 space-y-4 shadow-lg max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h3 className="font-display font-bold text-base">
            Placeholder investor
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Isi slot investor yang belum punya akun. Bagikan link pendaftaran ke
            investor — begitu mereka daftar lewat link itu, slot ini otomatis
            tersambung ke akunnya (tanpa perlu tahu email).
          </p>
        </div>

        {claimLink ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 space-y-1.5">
              <p className="text-xs font-semibold text-emerald-800">
                ✅ Placeholder dibuat. Kirim link ini ke investor:
              </p>
              <p className="break-all text-[11px] font-mono text-emerald-900">
                {claimLink}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(claimLink);
                    toast.success("Link tersalin");
                  } catch {
                    toast.message(claimLink);
                  }
                }}
                className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold"
              >
                Salin link
              </button>
              <button
                type="button"
                onClick={onClose}
                className="h-9 px-3 rounded-lg border border-border text-sm font-medium hover:bg-muted"
              >
                Selesai
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                Nama investor
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nama lengkap calon investor"
                className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                Kontak (opsional — WA/email, catatan)
              </span>
              <input
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="mis. 0812… / email"
                className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm"
              />
            </label>
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground">
                Investasi per cabang
              </span>
              {rows.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    value={row.branch}
                    onChange={(e) =>
                      setRows((rs) =>
                        rs.map((x, j) =>
                          j === i ? { ...x, branch: e.target.value } : x
                        )
                      )
                    }
                    className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  >
                    {BRANCHES.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={row.invest}
                    onChange={(e) =>
                      setRows((rs) =>
                        rs.map((x, j) =>
                          j === i ? { ...x, invest: e.target.value } : x
                        )
                      )
                    }
                    placeholder="Modal (Rp)"
                    className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm text-right"
                  />
                  {rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setRows((rs) => rs.filter((_, j) => j !== i))
                      }
                      className="text-muted-foreground hover:text-destructive px-1"
                      aria-label="Hapus cabang"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setRows((rs) => [...rs, { branch: defaultBranch, invest: "" }])
                }
                className="text-[11px] font-semibold text-primary hover:underline"
              >
                + Tambah cabang
              </button>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="h-9 px-3 rounded-lg border border-border text-sm font-medium hover:bg-muted"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={busy}
                className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
              >
                {busy ? "Membuat…" : "Buat + dapatkan link"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
