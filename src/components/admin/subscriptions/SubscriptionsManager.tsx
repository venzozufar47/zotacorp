"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Archive,
  ArchiveRestore,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Split,
  Trash2,
  User,
  X,
} from "lucide-react";
import {
  deleteSubscription,
  renewSubscription,
  saveSubscription,
  setSubscriptionActive,
} from "@/lib/actions/subscriptions.actions";
import {
  CYCLE_LABEL,
  formatIdr as formatRp,
  monthlyEquivalent,
  renewalStatus,
  type BillingCycle,
  type Subscription,
  type SubscriptionAllocation,
} from "@/lib/subscriptions/types";
import {
  PERSONAL_BU,
  REGISTRY_BUSINESS_UNITS,
  branchesFor,
  buLabel,
  compareBu,
  isPersonalBu,
} from "@/lib/admin-registry/taxonomy";
import {
  BuBranchSelect,
  Field,
  RupiahInput,
  Shell,
  inputCls,
  primaryBtn,
  smallBtn,
} from "@/components/admin/registry/RegistryUi";

const CYCLE_SUFFIX: Record<BillingCycle, string> = {
  monthly: "/bln",
  quarterly: "/3 bln",
  yearly: "/thn",
};

function fmtDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

interface Row {
  sub: Subscription;
  alloc: SubscriptionAllocation;
}

export function SubscriptionsManager({
  subscriptions,
  today,
}: {
  subscriptions: Subscription[];
  today: string;
}) {
  const [formFor, setFormFor] = useState<Subscription | "new" | null>(null);
  const [buFilter, setBuFilter] = useState<string>("all");
  const [showArchived, setShowArchived] = useState(false);

  const archivedCount = subscriptions.filter((s) => !s.isActive).length;

  const rows: Row[] = useMemo(
    () =>
      subscriptions
        .filter((s) => showArchived || s.isActive)
        .flatMap((sub) => sub.allocations.map((alloc) => ({ sub, alloc }))),
    [subscriptions, showArchived]
  );

  const buCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.alloc.businessUnit, (m.get(r.alloc.businessUnit) ?? 0) + 1);
    return m;
  }, [rows]);

  const filtered = useMemo(
    () => (buFilter === "all" ? rows : rows.filter((r) => r.alloc.businessUnit === buFilter)),
    [rows, buFilter]
  );

  const groups = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of filtered) {
      const arr = m.get(r.alloc.businessUnit) ?? [];
      arr.push(r);
      m.set(r.alloc.businessUnit, arr);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => {
        // Yang paling mendesak naik: tanggal terdekat dulu, tanpa tanggal di bawah.
        const da = a.sub.nextRenewalDate ?? "9999-12-31";
        const db = b.sub.nextRenewalDate ?? "9999-12-31";
        return da.localeCompare(db) || a.sub.name.localeCompare(b.sub.name);
      });
    }
    return [...m.entries()].sort((a, b) => compareBu(a[0], b[0]));
  }, [filtered]);

  // Ringkasan hanya untuk yang AKTIF dan dalam cakupan filter. Biaya pribadi
  // owner dipisah dari total bisnis supaya tidak menggelembungkan biaya unit.
  const active = filtered.filter((r) => r.sub.isActive);
  const monthlyOf = (rs: Row[]) =>
    rs.reduce(
      (s, r) => s + monthlyEquivalent(r.alloc.amountIdr, r.sub.billingCycle),
      0
    );
  const personalRows = active.filter((r) => isPersonalBu(r.alloc.businessUnit));
  const businessRows = active.filter((r) => !isPersonalBu(r.alloc.businessUnit));
  const personalOnly = buFilter === PERSONAL_BU;
  const monthlyTotal = monthlyOf(personalOnly ? personalRows : businessRows);
  const personalMonthly = monthlyOf(personalRows);
  const dueRows = active.filter((r) => {
    const st = renewalStatus(r.sub.nextRenewalDate, today).status;
    return st === "overdue" || st === "today" || st === "soon";
  });
  const dueAmount = dueRows.reduce((s, r) => s + r.alloc.amountIdr, 0);
  const dueSubs = new Set(dueRows.map((r) => r.sub.id)).size;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Stat
          label={personalOnly ? "Pribadi per bulan" : "Per bulan"}
          value={formatRp(monthlyTotal)}
          hint={
            !personalOnly && personalMonthly > 0
              ? `+ ${formatRp(personalMonthly)} pribadi (tidak dihitung)`
              : undefined
          }
        />
        <Stat label="Per tahun (estimasi)" value={formatRp(monthlyTotal * 12)} />
        <Stat
          label="Perlu diperpanjang (≤ 7 hari)"
          value={dueSubs > 0 ? `${dueSubs} langganan` : "Tidak ada"}
          hint={dueSubs > 0 ? formatRp(dueAmount) : undefined}
          warn={dueSubs > 0}
        />
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Chip active={buFilter === "all"} onClick={() => setBuFilter("all")}>
            Semua
          </Chip>
          {[...buCounts.keys()].sort(compareBu).map((bu) => (
            <Chip key={bu} active={buFilter === bu} onClick={() => setBuFilter(bu)}>
              {buLabel(bu)} <span className="opacity-60">{buCounts.get(bu)}</span>
            </Chip>
          ))}
        </div>
        <button type="button" onClick={() => setFormFor("new")} className={primaryBtn}>
          <Plus size={14} /> Tambah subscription
        </button>
      </div>

      {groups.length === 0 ? (
        <p className="rounded-2xl border-2 border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          {subscriptions.length === 0
            ? "Belum ada subscription. Tambahkan yang pertama dengan tombol di atas."
            : "Tidak ada subscription di filter ini."}
        </p>
      ) : (
        groups.map(([bu, list]) => {
          const subtotal = list
            .filter((r) => r.sub.isActive)
            .reduce(
              (s, r) => s + monthlyEquivalent(r.alloc.amountIdr, r.sub.billingCycle),
              0
            );
          return (
            <section key={bu} className="space-y-2">
              <h2 className="flex items-baseline justify-between gap-2 font-display font-bold text-sm">
                <span className="inline-flex items-center gap-1.5">
                  {isPersonalBu(bu) && <User size={13} aria-hidden />}
                  {buLabel(bu)}{" "}
                  <span className="font-normal text-muted-foreground">({list.length})</span>
                </span>
                <span className="text-xs font-medium text-muted-foreground tabular-nums">
                  {formatRp(subtotal)}/bln
                </span>
              </h2>
              <ul className="space-y-2">
                {list.map((r) => (
                  <SubRow
                    key={`${r.sub.id}:${r.alloc.id}`}
                    row={r}
                    today={today}
                    onEdit={() => setFormFor(r.sub)}
                  />
                ))}
              </ul>
            </section>
          );
        })
      )}

      {archivedCount > 0 && (
        <button
          type="button"
          onClick={() => setShowArchived((v) => !v)}
          className="text-xs text-muted-foreground underline underline-offset-2"
        >
          {showArchived ? "Sembunyikan arsip" : `Tampilkan ${archivedCount} arsip`}
        </button>
      )}

      {formFor && (
        <SubscriptionFormDialog
          sub={formFor === "new" ? null : formFor}
          onClose={() => setFormFor(null)}
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  warn,
}: {
  label: string;
  value: string;
  hint?: string;
  warn?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border-2 p-3 ${
        warn ? "border-warning bg-warning/20" : "border-border bg-card"
      }`}
    >
      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
        {label}
      </p>
      <p className="font-display font-extrabold text-lg tabular-nums leading-tight mt-0.5">
        {value}
      </p>
      {hint && <p className="text-[11px] text-muted-foreground tabular-nums">{hint}</p>}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 h-8 text-xs font-semibold transition ${
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-card hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

// ─── Baris ──────────────────────────────────────────────────────────────
function SubRow({
  row,
  today,
  onEdit,
}: {
  row: Row;
  today: string;
  onEdit: () => void;
}) {
  const { sub, alloc } = row;
  const router = useRouter();
  const [pending, start] = useTransition();
  const r = renewalStatus(sub.nextRenewalDate, today);
  const split = sub.allocations.length > 1;
  const pct = sub.amountIdr > 0 ? Math.round((alloc.amountIdr / sub.amountIdr) * 100) : 100;

  const tone =
    r.status === "overdue"
      ? "bg-destructive/15 text-destructive border-destructive/40"
      : r.status === "today" || r.status === "soon"
        ? "bg-warning/20 text-foreground border-warning"
        : r.status === "unset"
          ? "bg-muted text-muted-foreground border-border"
          : "bg-success/15 text-success border-success/30";

  const renewalText =
    r.status === "unset"
      ? "Tanggal belum diatur"
      : r.status === "overdue"
        ? `Terlewat ${-(r.days ?? 0)} hari · ${fmtDate(sub.nextRenewalDate!)}`
        : r.status === "today"
          ? "Jatuh tempo hari ini"
          : r.status === "soon"
            ? `${r.days} hari lagi · ${fmtDate(sub.nextRenewalDate!)}`
            : fmtDate(sub.nextRenewalDate!);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    start(async () => {
      const res = await fn();
      if (!res.ok) return void toast.error(res.error ?? "Gagal");
      toast.success(okMsg);
      router.refresh();
    });
  }

  return (
    <li
      className={`rounded-xl border-2 bg-card p-3 space-y-2 ${
        sub.isActive ? "border-foreground" : "border-border opacity-60"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-foreground">{sub.name}</span>
            {alloc.branch && (
              <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold">
                {alloc.branch}
              </span>
            )}
            {split && (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-border bg-accent px-2 py-0.5 text-[10px] font-semibold"
                title={`Total ${formatRp(sub.amountIdr)} dibagi ke ${sub.allocations.length} unit`}
              >
                <Split size={10} /> Dibagi · {pct}%
              </span>
            )}
            {!sub.isActive && (
              <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                Arsip
              </span>
            )}
          </div>
          <span
            className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tone}`}
          >
            {renewalText}
          </span>
          {sub.notes && (
            <p className="text-[11px] text-muted-foreground break-words">{sub.notes}</p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="font-display font-bold tabular-nums">
            {formatRp(alloc.amountIdr)}
            <span className="text-[11px] font-medium text-muted-foreground">
              {CYCLE_SUFFIX[sub.billingCycle]}
            </span>
          </p>
          {split && (
            <p className="text-[10px] text-muted-foreground tabular-nums">
              dari {formatRp(sub.amountIdr)}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {sub.isActive && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const res = await renewSubscription(sub.id);
                return res.ok ? { ok: true } : { ok: false, error: res.error };
              }, "Diperpanjang — tanggal berikutnya sudah dimajukan")
            }
            className="inline-flex items-center gap-1 rounded-lg bg-primary text-primary-foreground px-2.5 h-8 text-xs font-semibold hover:opacity-90 disabled:opacity-50"
            title="Tandai sudah dibayar/diperpanjang: tanggal pembaruan maju satu siklus"
          >
            <RefreshCw size={13} /> Perpanjang
          </button>
        )}
        <button type="button" onClick={onEdit} className={smallBtn}>
          <Pencil size={13} /> Ubah
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(
              () => setSubscriptionActive(sub.id, !sub.isActive),
              sub.isActive ? "Diarsipkan" : "Diaktifkan"
            )
          }
          className={smallBtn}
        >
          {sub.isActive ? (
            <>
              <Archive size={13} /> Arsip
            </>
          ) : (
            <>
              <ArchiveRestore size={13} /> Aktifkan
            </>
          )}
        </button>
      </div>
    </li>
  );
}

// ─── Form tambah / ubah ─────────────────────────────────────────────────
interface SplitRow {
  key: number;
  bu: string;
  branch: string | null;
  amount: number | null;
}

let rowKey = 0;
const newRow = (bu = "Haengbocake", branch: string | null = null, amount: number | null = null): SplitRow => ({
  key: ++rowKey,
  bu,
  branch,
  amount,
});

function SubscriptionFormDialog({
  sub,
  onClose,
}: {
  sub: Subscription | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const initialSplit = (sub?.allocations.length ?? 0) > 1;
  const first = sub?.allocations[0];

  const [name, setName] = useState(sub?.name ?? "");
  const [amount, setAmount] = useState<number | null>(sub ? sub.amountIdr : null);
  const [cycle, setCycle] = useState<BillingCycle>(sub?.billingCycle ?? "monthly");
  const [next, setNext] = useState(sub?.nextRenewalDate ?? "");
  const [notes, setNotes] = useState(sub?.notes ?? "");

  const [split, setSplit] = useState(initialSplit);
  const [bu, setBu] = useState(first?.businessUnit ?? "Haengbocake");
  const [branch, setBranch] = useState<string | null>(first?.branch ?? null);
  const [rows, setRows] = useState<SplitRow[]>(
    initialSplit
      ? sub!.allocations.map((a) => newRow(a.businessUnit, a.branch, a.amountIdr))
      : []
  );

  const total = amount ?? 0;
  const assigned = rows.reduce((s, r) => s + (r.amount ?? 0), 0);
  const remaining = total - assigned;

  function toggleSplit(on: boolean) {
    if (on === split) return;
    if (on) {
      // Mulai dari alokasi tunggal yang sudah dipilih + satu baris kosong.
      setRows([newRow(bu, branch, total || null), newRow(nextFreeBu(bu), null, null)]);
    } else {
      const r = rows[0];
      if (r) {
        setBu(r.bu);
        setBranch(r.branch);
      }
    }
    setSplit(on);
  }

  function nextFreeBu(exclude: string): string {
    return REGISTRY_BUSINESS_UNITS.find((b) => b !== exclude) ?? PERSONAL_BU;
  }

  function patchRow(key: number, p: Partial<SplitRow>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  }

  function splitEvenly() {
    if (rows.length === 0 || total <= 0) return;
    const base = Math.floor(total / rows.length);
    const extra = total - base * rows.length;
    setRows((rs) => rs.map((r, i) => ({ ...r, amount: base + (i === 0 ? extra : 0) })));
  }

  function validate(): string | null {
    if (!name.trim()) return "Nama subscription wajib diisi.";
    if (!total || total <= 0) return "Isi nominal subscription.";
    if (split) {
      if (rows.length < 2) return "Pembagian butuh minimal dua unit.";
      if (rows.some((r) => !r.amount || r.amount <= 0))
        return "Isi nominal untuk setiap unit.";
      if (remaining !== 0)
        return remaining > 0
          ? `Masih ada sisa ${formatRp(remaining)} yang belum dibagi.`
          : `Pembagian melebihi nominal sebesar ${formatRp(-remaining)}.`;
      const keys = rows.map((r) => `${r.bu}|${r.branch ?? ""}`);
      if (new Set(keys).size !== keys.length) return "Ada unit + cabang yang dobel.";
    }
    return null;
  }

  function submit() {
    const err = validate();
    if (err) return void toast.error(err);
    start(async () => {
      const res = await saveSubscription({
        id: sub?.id ?? null,
        name,
        amountIdr: total,
        billingCycle: cycle,
        nextRenewalDate: next || null,
        notes: notes.trim() || null,
        allocations: split
          ? rows.map((r) => ({
              businessUnit: r.bu,
              branch: r.branch,
              amountIdr: r.amount ?? 0,
            }))
          : [{ businessUnit: bu, branch, amountIdr: total }],
      });
      if (!res.ok) return void toast.error(res.error);
      toast.success(sub ? "Subscription diperbarui" : "Subscription ditambahkan");
      onClose();
      router.refresh();
    });
  }

  function remove() {
    if (!sub) return;
    if (!confirm(`Hapus "${sub.name}" permanen? Riwayat pembagiannya ikut hilang.`)) return;
    start(async () => {
      const res = await deleteSubscription(sub.id);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Subscription dihapus");
      onClose();
      router.refresh();
    });
  }

  return (
    <Shell title={sub ? "Ubah subscription" : "Tambah subscription"} onClose={onClose} wide>
      <Field label="Nama">
        <input
          className={inputCls}
          placeholder="mis. Canva Pro, Vercel, Domain"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus={!sub}
        />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Nominal (Rp)">
          <RupiahInput value={amount} onChange={setAmount} placeholder="150.000" />
        </Field>
        <Field label="Ditagih">
          <select
            className={inputCls}
            value={cycle}
            onChange={(e) => setCycle(e.target.value as BillingCycle)}
          >
            {(Object.keys(CYCLE_LABEL) as BillingCycle[]).map((c) => (
              <option key={c} value={c}>
                {CYCLE_LABEL[c]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Tanggal pembaruan berikutnya" hint="Dipakai untuk pengingat jatuh tempo. Bisa dikosongkan dulu.">
        <input
          type="date"
          className={inputCls}
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
      </Field>

      <div className="rounded-xl border-2 border-border p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold">Dibebankan ke</span>
          <div className="inline-flex rounded-lg border border-border p-0.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => toggleSplit(false)}
              className={`rounded-md px-2.5 py-1 ${!split ? "bg-foreground text-background" : ""}`}
            >
              Satu unit
            </button>
            <button
              type="button"
              onClick={() => toggleSplit(true)}
              className={`rounded-md px-2.5 py-1 ${split ? "bg-foreground text-background" : ""}`}
            >
              Dibagi
            </button>
          </div>
        </div>

        {!split ? (
          <BuBranchSelect
            bu={bu}
            branch={branch}
            onChange={(b, br) => {
              setBu(b);
              setBranch(br);
            }}
          />
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.key} className="space-y-1.5 rounded-lg bg-muted/40 p-2">
                <div className="flex items-start gap-1.5">
                  <div className="flex-1 min-w-0">
                    <BuBranchSelect
                      bu={r.bu}
                      branch={r.branch}
                      onChange={(b, br) => patchRow(r.key, { bu: b, branch: br })}
                    />
                  </div>
                  {rows.length > 2 && (
                    <button
                      type="button"
                      aria-label="Hapus baris"
                      onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                      className="size-9 shrink-0 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <RupiahInput
                    className={inputCls + " !mt-0"}
                    value={r.amount}
                    onChange={(n) => patchRow(r.key, { amount: n })}
                    placeholder="Nominal porsi"
                  />
                  <span className="w-12 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                    {total > 0 && r.amount ? `${Math.round((r.amount / total) * 100)}%` : "—"}
                  </span>
                </div>
              </div>
            ))}

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setRows((rs) => [...rs, newRow(nextFreeBu(rs[rs.length - 1]?.bu ?? ""), null, null)])}
                  className={smallBtn}
                >
                  <Plus size={13} /> Unit
                </button>
                <button type="button" onClick={splitEvenly} className={smallBtn} disabled={total <= 0}>
                  Bagi rata
                </button>
              </div>
              <p
                className={`text-xs font-semibold tabular-nums ${
                  remaining === 0 && total > 0 ? "text-success" : "text-destructive"
                }`}
              >
                {total <= 0
                  ? "Isi nominal dulu"
                  : remaining === 0
                    ? "Pas — semua terbagi"
                    : remaining > 0
                      ? `Sisa ${formatRp(remaining)}`
                      : `Lebih ${formatRp(-remaining)}`}
              </p>
            </div>
          </div>
        )}
        {!split && branchesFor(bu).length === 0 && (
          <p className="text-[11px] text-muted-foreground">
            Unit ini tidak punya cabang, jadi langsung dicatat di level unit.
          </p>
        )}
      </div>

      <Field label="Catatan (opsional)">
        <textarea
          className={inputCls}
          rows={2}
          placeholder="mis. dibayar pakai kartu kredit BCA"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>

      <div className="flex items-center gap-2 pt-1">
        {sub && (
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            aria-label="Hapus subscription"
            className="h-11 w-11 shrink-0 inline-flex items-center justify-center rounded-xl border-2 border-destructive/40 text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            <Trash2 size={16} />
          </button>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2"
        >
          {pending && <Loader2 size={14} className="animate-spin" />}
          Simpan
        </button>
      </div>
    </Shell>
  );
}
