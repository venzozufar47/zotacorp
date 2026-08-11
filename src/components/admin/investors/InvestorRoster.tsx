"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Copy,
  Layers,
  Loader2,
  Mail,
  Pencil,
  Plus,
  Search,
  UserPlus,
} from "lucide-react";
import { EmployeeAvatar } from "@/components/shared/EmployeeAvatar";
import {
  inviteInvestor,
  type InvestorSummary,
  type InvestorContract,
} from "@/lib/actions/investor.actions";
import type { InvestorPayout } from "@/lib/actions/investor-payouts.actions";
import { setUserResignStatus } from "@/lib/actions/profile-status.actions";
import { formatRp, formatRpCompact } from "@/lib/cashflow/format";
import { MONTH_NAMES, formatDateID } from "@/lib/utils/date-formats";
import { InvestorEditPanel } from "../InvestorEditPanel";
import { BatchContractForm, ContractForm } from "./ContractFormModal";
import { BulkPayoutForm, PayoutForm } from "./PayoutFormModal";

/**
 * Tab "Daftar Investor" — master-detail yang menggantikan tab Akun +
 * Kontrak + Payouts.
 *
 * Ketiga tab lama menjawab pertanyaan yang sama ("bagaimana kondisi investor
 * ini") lewat tiga halaman berbeda: nama di satu tab, kontraknya di tab lain
 * yang berisi SEMUA kontrak semua orang, riwayat payoutnya di tab ketiga di
 * balik dropdown kontrak. Menjawab satu pertanyaan butuh tiga kali pindah tab
 * dan mengingat namanya di sepanjang jalan. Di sini satu klik pada barisnya
 * memunculkan seluruh jawabannya di panel kanan.
 *
 * Nominal tetap hanya boleh ditulis lewat kontrak (SSOT) — form kontraknya
 * yang lama dipakai apa adanya, cuma dipanggil dari tempat yang lebih dekat.
 */

const YEOBO_BU = "Yeobo Space";
const BRANCH_RANK: Record<string, number> = {
  Tlogosari: 0,
  Tembalang: 1,
  Jebres: 2,
};

/** Progres BEP per kontrak, dihitung server-side oleh konsol dividen. Dipakai
 *  APA ADANYA — jangan hitung ulang di sini, dua rumus untuk satu metrik
 *  adalah bug yang sedang dibereskan oleh SSOT. */
export interface RosterBep {
  /** Kumulatif "modal terbalik" s/d periode acuan (basis hybrid konsol). */
  cumulative: number;
  target: number;
}

interface Props {
  investors: InvestorSummary[];
  contracts: InvestorContract[];
  businessUnits: string[];
  payoutsByContract: Record<string, InvestorPayout[]>;
  bepByContract: Record<string, RosterBep>;
  /** Periode acuan angka BEP & kolom payout terakhir (bulan buku terakhir). */
  period: { year: number; month: number };
}

const scopeLabel = (c: InvestorContract) =>
  c.branch ? `${c.businessUnit} · ${c.branch}` : c.businessUnit;
/** Label pendek untuk pill penempatan — cabang sudah cukup menjelaskan. */
const shortScope = (c: InvestorContract) => c.branch ?? c.businessUnit;

function rankContract(a: InvestorContract, b: InvestorContract) {
  const ra = a.businessUnit === YEOBO_BU ? 0 : 1;
  const rb = b.businessUnit === YEOBO_BU ? 0 : 1;
  return (
    ra - rb ||
    a.businessUnit.localeCompare(b.businessUnit) ||
    (BRANCH_RANK[a.branch ?? ""] ?? 99) - (BRANCH_RANK[b.branch ?? ""] ?? 99)
  );
}

function Pill({
  children,
  tone = "muted",
  title,
}: {
  children: React.ReactNode;
  tone?: "muted" | "teal" | "ok" | "warn";
  title?: string;
}) {
  const cls = {
    muted: "border-border bg-muted text-muted-foreground",
    teal: "border-primary/40 bg-primary/10 text-primary",
    ok: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    warn: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  }[tone];
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold whitespace-nowrap ${cls}`}
    >
      {children}
    </span>
  );
}

function BepBar({ value }: { value: number }) {
  const p = Math.max(0, Math.min(1, value));
  return (
    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
      <div
        className={`h-full rounded-full ${p >= 1 ? "bg-emerald-500" : "bg-primary"}`}
        style={{ width: `${Math.max(2, p * 100)}%` }}
      />
    </div>
  );
}

function SrcPill({ source }: { source: InvestorPayout["source"] }) {
  return source === "manual" ? (
    <Pill tone="warn" title="Dicatat / dikoreksi manual per kontrak, di luar konsol Distribusi">
      Manual
    </Pill>
  ) : (
    <Pill tone="teal" title="Dihasilkan konsol Distribusi Bulanan">
      Distribusi
    </Pill>
  );
}

const pctS = (n: number) =>
  `${n.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`;

export function InvestorRoster({
  investors,
  contracts,
  businessUnits,
  payoutsByContract,
  bepByContract,
  period,
}: Props) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("Semua");
  const [selected, setSelected] = useState<string | null>(
    investors[0]?.userId ?? null
  );
  const [inviteOpen, setInviteOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [bulkPayoutOpen, setBulkPayoutOpen] = useState(false);

  const periodLabel = `${MONTH_NAMES[period.month - 1]} ${period.year}`;

  /**
   * Progres per kontrak, dipakai baris daftar DAN kartu kontrak di panel —
   * satu perhitungan, supaya keduanya tidak bisa berbeda.
   *
   * Kontrak NON-Yeobo tidak terwakili di `bepByContract` — konsol dividen
   * hanya memuat kontrak Yeobo Space. Sebelumnya jatuh ke 0, sehingga
   * investor Haengbocake yang sudah tiga kali menerima transfer (Rp 3,4jt)
   * tampil "Modal terbalik Rp 0".
   *
   * Fallback-nya BUKAN rumus baru: konsol sendiri memakai aturan ini untuk
   * kontrak tanpa slot dividen (`realContractThrough` di
   * yeobo-dividend-console.actions.ts) — Σ payout real s/d periode acuan.
   * Yang kurang cuma cakupan datanya, bukan aturannya.
   *
   * `target` dipakai apa adanya dari kontrak. bep_target_idr = 0 TIDAK
   * ditambal jadi "= investasi" di sini: portal investor dan konsol
   * memperlakukan 0 sebagai "tanpa target" dan menyembunyikan barnya, jadi
   * menambalnya cuma di layar ini akan membuat satu halaman menyebut angka
   * yang dibantah dua halaman lain. 0 ditampilkan sebagai "belum diisi" —
   * kalau memang harusnya = investasi, yang perlu dibetulkan datanya.
   */
  const progressByContract = useMemo(() => {
    const targetRank = period.year * 100 + period.month;
    const out = new Map<string, RosterBep>();
    for (const c of contracts) {
      const bep = bepByContract[c.id];
      const cumulative = bep
        ? bep.cumulative
        : (payoutsByContract[c.id] ?? []).reduce(
            (s, p) =>
              s +
              (p.periodYear * 100 + p.periodMonth <= targetRank
                ? p.amountIdr
                : 0),
            0
          );
      out.set(c.id, { cumulative, target: bep?.target ?? c.bepTargetIdr });
    }
    return out;
  }, [contracts, bepByContract, payoutsByContract, period]);

  // Per-investor agregat: kontrak, modal, BEP, payout periode acuan.
  const statsByUser = useMemo(() => {
    const map = new Map<
      string,
      {
        contracts: InvestorContract[];
        invest: number;
        recoup: number;
        target: number;
        periodPayout: number;
      }
    >();
    for (const inv of investors)
      map.set(inv.userId, {
        contracts: [],
        invest: 0,
        recoup: 0,
        target: 0,
        periodPayout: 0,
      });
    for (const c of contracts) {
      const s = map.get(c.userId);
      if (!s) continue; // kontrak milik profil non-investor — tidak dirender
      s.contracts.push(c);
      s.invest += c.totalInvestIdr;
      const prog = progressByContract.get(c.id);
      s.recoup += prog?.cumulative ?? 0;
      s.target += prog?.target ?? 0;
      for (const p of payoutsByContract[c.id] ?? [])
        if (p.periodYear === period.year && p.periodMonth === period.month)
          s.periodPayout += p.amountIdr;
    }
    for (const s of map.values()) s.contracts.sort(rankContract);
    return map;
  }, [investors, contracts, progressByContract, payoutsByContract, period]);

  // Chip filter dibangun dari data, bukan daftar tetap: cabang Yeobo yang
  // benar-benar punya kontrak, lalu unit bisnis non-Yeobo.
  const filters = useMemo(() => {
    const branches = [
      ...new Set(
        contracts
          .filter((c) => c.businessUnit === YEOBO_BU && c.branch)
          .map((c) => c.branch as string)
      ),
    ].sort((a, b) => (BRANCH_RANK[a] ?? 99) - (BRANCH_RANK[b] ?? 99));
    const otherBus = [
      ...new Set(
        contracts
          .filter((c) => c.businessUnit !== YEOBO_BU)
          .map((c) => c.businessUnit)
      ),
    ].sort();
    return ["Semua", ...branches, ...otherBus, "Belum di-assign", "Menunggu aktivasi"];
  }, [contracts]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return investors.filter((inv) => {
      const s = statsByUser.get(inv.userId);
      if (
        needle &&
        !`${inv.fullName ?? ""} ${inv.email ?? ""}`.toLowerCase().includes(needle)
      )
        return false;
      if (filter === "Semua") return true;
      if (filter === "Belum di-assign") return (s?.contracts.length ?? 0) === 0;
      if (filter === "Menunggu aktivasi") return !inv.isActive;
      return (s?.contracts ?? []).some(
        (c) => c.branch === filter || (!c.branch && c.businessUnit === filter)
      );
    });
  }, [investors, statsByUser, q, filter]);

  const active = selected
    ? investors.find((i) => i.userId === selected) ?? null
    : null;

  const inputCls =
    "h-9 w-full rounded-lg border border-border bg-background pl-8 pr-3 text-sm placeholder:text-muted-foreground";

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari nama atau email…"
            className={inputCls}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {filters.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={
                "h-8 px-2.5 rounded-lg border text-xs font-semibold transition " +
                (filter === f
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-muted")
              }
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <button
            type="button"
            onClick={() => setBatchOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg border border-border text-sm font-semibold hover:bg-muted"
          >
            <Layers size={14} /> Batch kontrak
          </button>
          <button
            type="button"
            onClick={() => setBulkPayoutOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg border border-border text-sm font-semibold hover:bg-muted"
          >
            <Plus size={14} /> Payout massal
          </button>
          <button
            type="button"
            onClick={() => setInviteOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg bg-primary text-primary-foreground text-sm font-semibold"
          >
            <UserPlus size={14} /> Undang investor
          </button>
        </div>
      </div>

      {/* Kolom kanan di layar lebar, tumpuk di bawah daftar kalau tidak ada
          ruang. SATU instans panel — versi sebelumnya merender dua (satu
          `hidden xl:block`, satu `xl:hidden`), jadi tiap investor terpilih
          membangun dua salinan panel beserta state modalnya. */}
      <div className="flex flex-col xl:flex-row gap-4 xl:items-start">
        {/* Master list */}
        <div className="flex-1 min-w-0 rounded-2xl border border-border bg-card overflow-hidden">
          <div className="hidden lg:grid grid-cols-[minmax(0,1.6fr)_minmax(0,1.1fr)_minmax(0,0.7fr)_minmax(0,1.2fr)_minmax(0,0.8fr)] gap-3 px-4 py-2 bg-muted/40 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Investor</span>
            <span>Penempatan</span>
            <span className="text-right">Modal</span>
            <span>Progres BEP</span>
            <span className="text-right">{periodLabel}</span>
          </div>
          {list.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              {investors.length === 0
                ? "Belum ada investor. Undang lewat tombol di atas — mereka menerima email untuk membuat password sendiri."
                : "Tidak ada investor yang cocok dengan pencarian/filter ini."}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {list.map((inv) => {
                const s = statsByUser.get(inv.userId)!;
                const progress = s.target > 0 ? s.recoup / s.target : 0;
                const on = inv.userId === selected;
                return (
                  <li key={inv.userId}>
                    <button
                      type="button"
                      onClick={() => setSelected(inv.userId)}
                      className={
                        "w-full text-left px-4 py-2.5 grid grid-cols-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.1fr)_minmax(0,0.7fr)_minmax(0,1.2fr)_minmax(0,0.8fr)] gap-2 lg:gap-3 lg:items-center transition " +
                        (on
                          ? "bg-primary/5 border-l-2 border-primary"
                          : "hover:bg-muted/40 border-l-2 border-transparent")
                      }
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <EmployeeAvatar
                          size="sm"
                          id={inv.userId}
                          full_name={inv.fullName ?? ""}
                          avatar_url={inv.avatarUrl}
                          avatar_seed={inv.avatarSeed}
                        />
                        <div className="min-w-0">
                          <div className="font-semibold text-sm truncate">
                            {inv.fullName || "—"}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {inv.email ?? "—"}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1">
                        {s.contracts.length === 0 ? (
                          <Pill tone="warn">Belum di-assign</Pill>
                        ) : (
                          [
                            ...new Set(s.contracts.map(shortScope)),
                          ].map((x) => <Pill key={x}>{x}</Pill>)
                        )}
                      </div>

                      <div className="text-right text-sm font-semibold tabular-nums">
                        {s.invest ? formatRpCompact(s.invest) : "—"}
                      </div>

                      <div className="min-w-0">
                        {!s.invest ? (
                          <span className="text-[11px] text-muted-foreground">
                            —
                          </span>
                        ) : s.target > 0 ? (
                          <>
                            <BepBar value={progress} />
                            <div className="mt-1 text-[10.5px] text-muted-foreground tabular-nums truncate">
                              {pctS(progress * 100)} ·{" "}
                              {formatRpCompact(s.recoup)} terbalik
                            </div>
                          </>
                        ) : (
                          /* Target BEP belum diisi di kontrak — persen tanpa
                             pembagi adalah 0% yang menyesatkan, jadi yang
                             ditampilkan nominal terbaliknya saja. */
                          <div className="text-[10.5px] text-muted-foreground tabular-nums truncate">
                            {formatRpCompact(s.recoup)} terbalik · target BEP
                            belum diisi
                          </div>
                        )}
                      </div>

                      <div className="flex lg:justify-end">
                        {!inv.isActive ? (
                          <Pill tone="warn">Menunggu aktivasi</Pill>
                        ) : s.periodPayout > 0 ? (
                          <Pill tone="ok">
                            <span className="tabular-nums">
                              {formatRpCompact(s.periodPayout)}
                            </span>
                          </Pill>
                        ) : s.contracts.length === 0 ? (
                          <Pill>—</Pill>
                        ) : (
                          <Pill>Belum</Pill>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {active && (
          <aside className="w-full xl:w-[420px] xl:shrink-0 xl:sticky xl:top-4 xl:self-start">
            <DetailPane
              investor={active}
              stats={statsByUser.get(active.userId)!}
              payoutsByContract={payoutsByContract}
              progressByContract={progressByContract}
              investors={investors}
              contracts={contracts}
              businessUnits={businessUnits}
              periodLabel={periodLabel}
              onRefresh={() => router.refresh()}
            />
          </aside>
        )}
      </div>

      {inviteOpen && <InviteInvestorModal onClose={() => setInviteOpen(false)} />}
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
      {bulkPayoutOpen && (
        <BulkPayoutForm
          contracts={contracts}
          investors={investors}
          onClose={() => setBulkPayoutOpen(false)}
          onSaved={() => {
            setBulkPayoutOpen(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

interface RosterStats {
  contracts: InvestorContract[];
  invest: number;
  recoup: number;
  target: number;
  periodPayout: number;
}

function DetailPane({
  investor,
  stats,
  payoutsByContract,
  progressByContract,
  investors,
  contracts,
  businessUnits,
  periodLabel,
  onRefresh,
}: {
  investor: InvestorSummary;
  stats: RosterStats;
  payoutsByContract: Record<string, InvestorPayout[]>;
  progressByContract: Map<string, RosterBep>;
  investors: InvestorSummary[];
  contracts: InvestorContract[];
  businessUnits: string[];
  periodLabel: string;
  onRefresh: () => void;
}) {
  const [editProfile, setEditProfile] = useState(false);
  const [contractForm, setContractForm] = useState<{
    contract: InvestorContract | null;
    isNew: boolean;
  } | null>(null);
  const [payoutForm, setPayoutForm] = useState<{
    contract: InvestorContract;
    payout: InvestorPayout | null;
  } | null>(null);
  const [toggling, setToggling] = useState(false);
  const router = useRouter();

  // Riwayat payout gabungan semua kontrak, terbaru dulu — satu daftar, karena
  // pertanyaannya "kapan orang ini terakhir menerima uang", bukan "kontrak
  // mana". Kontraknya tetap disebut di tiap baris.
  const payouts = useMemo(() => {
    const rows = stats.contracts.flatMap((c) =>
      (payoutsByContract[c.id] ?? []).map((p) => ({ p, contract: c }))
    );
    return rows.sort(
      (a, b) =>
        b.p.periodYear * 100 +
        b.p.periodMonth -
        (a.p.periodYear * 100 + a.p.periodMonth)
    );
  }, [stats.contracts, payoutsByContract]);

  const lastRank = payouts[0]
    ? payouts[0].p.periodYear * 100 + payouts[0].p.periodMonth
    : null;
  const lastTotal = lastRank
    ? payouts
        .filter((x) => x.p.periodYear * 100 + x.p.periodMonth === lastRank)
        .reduce((s, x) => s + x.p.amountIdr, 0)
    : 0;
  const lastLabel = payouts[0]
    ? `${MONTH_NAMES[payouts[0].p.periodMonth - 1]} ${payouts[0].p.periodYear}`
    : null;
  const progress = stats.target > 0 ? stats.recoup / stats.target : 0;

  async function toggleActive() {
    setToggling(true);
    const res = await setUserResignStatus(investor.userId, investor.isActive);
    setToggling(false);
    if (!res.ok) {
      toast.error(res.error ?? "Gagal mengubah status akun");
      return;
    }
    toast.success(
      investor.isActive
        ? "Akun investor dinonaktifkan"
        : "Akun investor diaktifkan — sekarang bisa login"
    );
    router.refresh();
  }

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Head */}
      <div className="px-4 py-3 border-b border-border space-y-2.5">
        <div className="flex items-start gap-2.5">
          <EmployeeAvatar
            size="default"
            id={investor.userId}
            full_name={investor.fullName ?? ""}
            avatar_url={investor.avatarUrl}
            avatar_seed={investor.avatarSeed}
          />
          <div className="min-w-0 flex-1">
            <h3 className="font-display font-bold text-[15px] leading-tight truncate">
              {investor.fullName || "—"}
            </h3>
            {investor.email && (
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground truncate mt-0.5">
                <Mail size={11} className="shrink-0" />
                <span className="truncate">{investor.email}</span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setEditProfile(true)}
            className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-border px-2 h-8 text-xs font-semibold hover:bg-muted"
          >
            <Pencil size={12} /> Edit
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill tone="teal">Investor</Pill>
          <Pill>{stats.contracts.length} kontrak</Pill>
          {!investor.isActive && <Pill tone="warn">Menunggu aktivasi</Pill>}
          {stats.invest > 0 && progress >= 1 && (
            <Pill tone="ok">Modal terbalik</Pill>
          )}
          <button
            type="button"
            onClick={toggleActive}
            disabled={toggling}
            className={
              "ml-auto inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold disabled:opacity-50 " +
              (investor.isActive
                ? "border-border text-muted-foreground hover:text-destructive hover:border-destructive/50"
                : "border-primary bg-primary text-primary-foreground")
            }
          >
            {toggling && <Loader2 size={11} className="animate-spin" />}
            {investor.isActive ? "Nonaktifkan" : "Aktifkan"}
          </button>
        </div>
      </div>

      {/* Scroll internal hanya saat panel jadi kolom sticky; ditumpuk di bawah
          daftar ia ikut alur halaman, bukan kotak scroll di dalam scroll. */}
      <div className="px-4 py-3 space-y-4 xl:max-h-[calc(100vh-13rem)] xl:overflow-y-auto">
        {/* Ringkasan */}
        <section className="space-y-2">
          <h4 className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
            Ringkasan
          </h4>
          <dl className="rounded-xl border border-border bg-muted/30 px-3 py-2 text-[12.5px]">
            <Row label="Total modal" value={formatRp(stats.invest)} />
            <Row label="Modal terbalik" value={formatRp(stats.recoup)} />
            <Row
              label={`Payout terakhir${lastLabel ? ` (${lastLabel})` : ""}`}
              value={lastLabel ? formatRp(lastTotal) : "—"}
              last
            />
            {stats.invest > 0 && (
              <div className="pt-2">
                {stats.target > 0 ? (
                  <>
                    <BepBar value={progress} />
                    <p className="mt-1 text-[10.5px] text-muted-foreground tabular-nums">
                      {pctS(progress * 100)} dari target BEP{" "}
                      {formatRp(stats.target)}
                    </p>
                  </>
                ) : (
                  <p className="text-[10.5px] text-amber-700 dark:text-amber-400">
                    Target BEP belum diisi di kontrak — progres tidak bisa
                    dihitung. Isi lewat Edit kontrak.
                  </p>
                )}
              </div>
            )}
          </dl>
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            Modal &amp; porsi dibaca dari kontrak (satu-satunya tempat nominal
            disimpan). Modal terbalik = baseline PnL s/d Apr 2026 + transfer
            terverifikasi sejak Mei 2026, per {periodLabel}.
          </p>
        </section>

        {/* Kontrak */}
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
              Kontrak
            </h4>
            <button
              type="button"
              onClick={() => setContractForm({ contract: null, isNew: true })}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
            >
              <Plus size={12} /> Tambah
            </button>
          </div>
          {stats.contracts.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-3 py-3 text-[12px] text-muted-foreground">
              Belum ada kontrak. Buat di sini — tidak perlu pindah halaman.
            </p>
          ) : (
            stats.contracts.map((c) => {
              const bep = progressByContract.get(c.id);
              const target = bep?.target ?? 0;
              const cum = bep?.cumulative ?? 0;
              const prog = target > 0 ? cum / target : 0;
              return (
                <div
                  key={c.id}
                  className="rounded-xl border border-border px-3 py-2.5 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <b className="text-[12.5px] font-semibold">
                      {scopeLabel(c)}
                    </b>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          setContractForm({ contract: c, isNew: false })
                        }
                        className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                        title="Edit kontrak"
                        aria-label="Edit kontrak"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setContractForm({ contract: c, isNew: true })
                        }
                        className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                        title="Duplikat kontrak"
                        aria-label="Duplikat kontrak"
                      >
                        <Copy size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPayoutForm({ contract: c, payout: null })}
                        className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                        title="Catat payout manual"
                        aria-label="Catat payout manual"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  </div>
                  <dl className="text-[11.5px]">
                    <Row label="Investasi" value={formatRp(c.totalInvestIdr)} />
                    <Row label="Bagi hasil" value={`${c.bagiHasilPct}%`} />
                    <Row
                      label="Durasi · mulai"
                      value={`${
                        c.durasiBulan === null ? "Permanen" : `${c.durasiBulan} bln`
                      } · ${formatDateID(c.startDate)}`}
                    />
                    <Row
                      label="Rekening"
                      value={
                        c.payoutBankName || c.payoutRekeningNumber
                          ? `${c.payoutBankName ?? "—"} • ${c.payoutRekeningNumber ?? "—"}`
                          : c.payoutRekeningLabel ?? "—"
                      }
                      mono
                    />
                    <Row label="Ref" value={c.contractRef ?? "—"} mono last />
                  </dl>
                  <div>
                    {target > 0 ? (
                      <>
                        <BepBar value={prog} />
                        <p className="mt-1 text-[10.5px] text-muted-foreground tabular-nums">
                          BEP {pctS(prog * 100)} · {formatRp(cum)} /{" "}
                          {formatRp(target)}
                        </p>
                      </>
                    ) : (
                      <p className="text-[10.5px] text-muted-foreground tabular-nums">
                        {formatRp(cum)} terbalik · target BEP belum diisi
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </section>

        {/* Riwayat payout */}
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
              Riwayat payout
            </h4>
            <span className="text-[11px] text-muted-foreground">
              {payouts.length} catatan
            </span>
          </div>
          {payouts.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">
              Belum ada payout.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {payouts.map(({ p, contract }) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setPayoutForm({ contract, payout: p })}
                    className="w-full text-left px-3 py-2 hover:bg-muted/40"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <b className="text-[12.5px] font-semibold">
                        {MONTH_NAMES[p.periodMonth - 1]} {p.periodYear}
                      </b>
                      <b className="text-[12.5px] font-semibold tabular-nums">
                        {formatRp(p.amountIdr)}
                      </b>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="text-[10.5px] text-muted-foreground truncate">
                        {shortScope(contract)}
                        {p.paidAt ? ` · ${formatDateID(p.paidAt)}` : ""}
                      </span>
                      <SrcPill source={p.source} />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Modals */}
      {editProfile && (
        <ProfileOverlay onClose={() => setEditProfile(false)}>
          <InvestorEditPanel
            investor={investor}
            contracts={contracts}
            onClose={() => setEditProfile(false)}
          />
        </ProfileOverlay>
      )}
      {contractForm && (
        <ContractForm
          contract={contractForm.contract}
          isNew={contractForm.isNew}
          investors={investors}
          businessUnits={businessUnits}
          lockInvestor={
            contractForm.isNew && !contractForm.contract
              ? investor.userId
              : undefined
          }
          onClose={() => setContractForm(null)}
          onSaved={() => {
            setContractForm(null);
            onRefresh();
          }}
        />
      )}
      {payoutForm && (
        <PayoutForm
          payout={payoutForm.payout}
          contract={payoutForm.contract}
          scopeLabel={scopeLabel(payoutForm.contract)}
          onClose={() => setPayoutForm(null)}
          onSaved={() => {
            setPayoutForm(null);
            onRefresh();
          }}
        />
      )}
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  last,
}: {
  label: string;
  value: string;
  mono?: boolean;
  last?: boolean;
}) {
  return (
    <div
      className={
        "flex items-baseline justify-between gap-3 py-1 " +
        (last ? "" : "border-b border-border/50")
      }
    >
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <dd
        className={
          "text-right font-semibold tabular-nums min-w-0 truncate " +
          (mono ? "font-mono text-[11px]" : "")
        }
      >
        {value}
      </dd>
    </div>
  );
}

/** Panel profil dipakai ulang apa adanya; ia butuh shell posisi dari
 *  pemanggil, jadi di sini shell-nya overlay penuh. */
function ProfileOverlay({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);
  if (!mounted) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-foreground/40 flex items-stretch justify-end sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full sm:max-w-lg bg-card sm:rounded-2xl border border-border overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}

/** Invite-by-email modal: admin enters email + name → inviteInvestor →
 *  the invitee gets an email to set their password. */
function InviteInvestorModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [pending, startTransition] = useTransition();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  function submit() {
    if (!email.trim() || !fullName.trim()) {
      toast.error("Email dan nama wajib diisi");
      return;
    }
    startTransition(async () => {
      const res = await inviteInvestor({ email, fullName });
      if (!res.ok) {
        toast.error(res.error ?? "Gagal mengirim undangan");
        return;
      }
      toast.success(`Undangan terkirim ke ${res.data?.email ?? email}`);
      onClose();
      router.refresh();
    });
  }

  const modal = (
    <div
      className="fixed inset-0 z-50 bg-foreground/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-card border border-border p-5 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h3 className="text-lg font-semibold text-foreground">
            Undang investor
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Investor akan menerima email berisi link untuk membuat password
            sendiri. Setelah itu pilih namanya di daftar untuk mengisi kontrak
            &amp; penempatannya.
          </p>
        </div>
        <label className="text-xs block">
          <span className="text-muted-foreground">Nama lengkap</span>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Nama investor"
            className="block mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs block">
          <span className="text-muted-foreground">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="investor@email.com"
            inputMode="email"
            autoComplete="off"
            className="block mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </label>
        <div className="flex items-center justify-end gap-2 pt-1">
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
            className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60"
          >
            {pending && <Loader2 size={14} className="animate-spin" />}
            Kirim undangan
          </button>
        </div>
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(modal, document.body);
}
