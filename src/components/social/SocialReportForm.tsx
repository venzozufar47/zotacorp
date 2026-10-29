"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  deleteWeeklyReport,
  saveWeeklyReport,
  type SocialAccountView,
  type SocialReportPage,
  type WeeklyReportView,
} from "@/lib/actions/social-report.actions";
import { addDays, dm, weekLabel } from "@/lib/social/week-label";

const PLATFORM_LABEL = { instagram: "Instagram", tiktok: "TikTok" } as const;
const PLATFORM_SHORT = { instagram: "IG", tiktok: "TT" } as const;
const nf = new Intl.NumberFormat("id-ID");

type Draft = Record<"views" | "viewers" | "interactions" | "followers" | "follows" | "unfollows" | "posts" | "reels" | "stories", string>;
const FIELDS = ["views", "viewers", "interactions", "followers", "follows", "unfollows", "posts", "reels", "stories"] as const;

function draftOf(r: WeeklyReportView | undefined): Draft {
  const d = {} as Draft;
  for (const k of FIELDS) d[k] = r ? String(r[k]) : "";
  return d;
}

const draftKey = (accountId: string, weekStart: string) => `social-draft:${accountId}:${weekStart}`;

/**
 * Form laporan mingguan per akun. Dipakai halaman owner (/admin/social) dan halaman pengisi (/sosmed): tiap Senin
 * mengisi laporan untuk minggu lalu. `basePath` = tempat navigasi minggu (?week=). Dirancang untuk HP: kartu akun bisa
 * dilipat (yang belum diisi terbuka), input 16px agar iOS tidak memperbesar layar, tombol Next pada keyboard angka, dan
 * isian sementara disimpan di perangkat supaya tidak hilang saat berpindah ke aplikasi Instagram/TikTok.
 */
export function SocialReportForm({ page, basePath }: { page: SocialReportPage; basePath: string }) {
  const router = useRouter();
  const canNext = page.weekStart < page.latestWeekStart;
  const go = (week: string) => router.push(`${basePath}?week=${week}`);
  const accounts = page.brands.flatMap((b) => b.accounts);
  const filled = accounts.filter((a) => page.thisWeek[a.id]).length;

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex items-stretch gap-2">
          <Button variant="outline" className="h-11 w-11 shrink-0 px-0" onClick={() => go(addDays(page.weekStart, -7))} aria-label="Minggu sebelumnya">
            <ChevronLeft size={18} />
          </Button>
          <div className="min-w-0 flex-1 rounded-xl border-2 border-foreground bg-card px-3 py-1.5 text-center">
            <div className="truncate font-display text-[14px] font-bold leading-tight">{weekLabel(page.weekStart)}</div>
            <div className="text-[10.5px] text-muted-foreground">
              {page.weekStart === page.latestWeekStart ? "Minggu lalu — jatuh tempo Senin" : "Minggu sebelumnya"}
            </div>
          </div>
          <Button variant="outline" className="h-11 w-11 shrink-0 px-0" onClick={() => go(addDays(page.weekStart, 7))} disabled={!canNext} aria-label="Minggu berikutnya">
            <ChevronRight size={18} />
          </Button>
        </div>
        {canNext && (
          <button type="button" onClick={() => go(page.latestWeekStart)} className="text-[12.5px] font-semibold text-primary hover:underline">
            Ke minggu lalu →
          </button>
        )}
        <div>
          <div className="mb-1 flex items-center justify-between text-[11.5px] text-muted-foreground">
            <span>
              {filled} dari {accounts.length} akun terisi
            </span>
            {filled === accounts.length && accounts.length > 0 && <span className="font-semibold text-success">Lengkap ✓</span>}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={filled} aria-valuemin={0} aria-valuemax={accounts.length}>
            <div className="h-full rounded-full bg-success transition-all" style={{ width: `${accounts.length ? (filled / accounts.length) * 100 : 0}%` }} />
          </div>
        </div>
      </div>

      <p className="text-[12.5px] text-muted-foreground">
        Isi tiap Senin untuk minggu yang baru selesai, dari menu Insights masing-masing akun (rentang Senin–Minggu). Followers diisi angka pada akhir minggu. Isian
        yang belum disimpan tersimpan sementara di perangkat ini.
      </p>

      {page.brands.map((brand) => (
        <section key={brand.id} className="space-y-3">
          <h3 className="font-display text-[15px] font-bold">{brand.label}</h3>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 [&>*]:min-w-0">
            {brand.accounts.map((acct) => (
              <AccountReportCard
                key={`${acct.id}-${page.weekStart}`}
                account={acct}
                weekStart={page.weekStart}
                existing={page.thisWeek[acct.id]}
                lastFollowers={page.lastFollowers[acct.id]}
                isAdmin={page.isAdmin}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function AccountReportCard({
  account,
  weekStart,
  existing,
  lastFollowers,
  isAdmin,
}: {
  account: SocialAccountView;
  weekStart: string;
  existing: WeeklyReportView | undefined;
  lastFollowers: { followers: number; weekStart: string } | undefined;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<Draft>(() => draftOf(existing));
  const [notes, setNotes] = useState(existing?.notes ?? "");
  // Akun yang belum diisi terbuka; yang sudah terisi dilipat (ringkasannya tetap terlihat).
  const [open, setOpen] = useState(!existing);
  const boxRef = useRef<HTMLDivElement>(null);
  const restoredRef = useRef(false);

  // Pulihkan isian sementara (mis. setelah pindah ke aplikasi Instagram lalu kembali). Hanya untuk akun yang belum
  // terisi; tersimpan terpisah per akun & minggu. localStorage bisa tidak tersedia → semua dibungkus try/catch.
  useEffect(() => {
    if (existing || restoredRef.current) return;
    restoredRef.current = true;
    try {
      const raw = localStorage.getItem(draftKey(account.id, weekStart));
      if (!raw) return;
      const saved = JSON.parse(raw) as { draft?: Partial<Draft>; notes?: string };
      if (saved.draft) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- pemulihan sekali saat mount (sumber data hanya ada di browser)
        setDraft((d) => ({ ...d, ...Object.fromEntries(FIELDS.filter((k) => /^\d{0,9}$/.test(saved.draft?.[k] ?? "")).map((k) => [k, saved.draft?.[k] ?? ""])) }));
        setOpen(true);
      }
      if (typeof saved.notes === "string") setNotes(saved.notes.slice(0, 500));
    } catch {
      /* penyimpanan tak tersedia: lanjut tanpa pemulihan */
    }
  }, [account.id, weekStart, existing]);

  useEffect(() => {
    if (existing || !restoredRef.current) return;
    try {
      const empty = FIELDS.every((k) => draft[k] === "") && !notes;
      if (empty) localStorage.removeItem(draftKey(account.id, weekStart));
      else localStorage.setItem(draftKey(account.id, weekStart), JSON.stringify({ draft, notes }));
    } catch {
      /* abaikan */
    }
  }, [draft, notes, existing, account.id, weekStart]);

  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft((d) => ({ ...d, [k]: e.target.value.replace(/[^\d]/g, "").slice(0, 9) }));

  /** Enter / tombol "Next" pada keyboard angka → pindah ke isian berikutnya di kartu ini. */
  function nextOnEnter(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const all = Array.from(boxRef.current?.querySelectorAll<HTMLInputElement>("input[data-fld]") ?? []);
    const i = all.indexOf(e.currentTarget);
    (all[i + 1] ?? e.currentTarget).focus();
  }

  const n = (k: keyof Draft) => (draft[k] === "" ? null : Number(draft[k]));
  const net = n("follows") != null && n("unfollows") != null ? (n("follows") as number) - (n("unfollows") as number) : null;
  const complete = FIELDS.every((k) => draft[k] !== "");
  const viewersTooHigh = n("views") != null && n("viewers") != null && (n("viewers") as number) > (n("views") as number);

  function save() {
    if (!complete) return void toast.error("Isi semua angka (tulis 0 bila memang nol)");
    if (viewersTooHigh) return void toast.error("Viewers tidak boleh lebih besar dari views — cek kembali angkanya.");
    start(async () => {
      const r = await saveWeeklyReport({
        accountId: account.id,
        weekStart,
        views: Number(draft.views),
        viewers: Number(draft.viewers),
        interactions: Number(draft.interactions),
        followers: Number(draft.followers),
        follows: Number(draft.follows),
        unfollows: Number(draft.unfollows),
        posts: Number(draft.posts),
        reels: Number(draft.reels),
        stories: Number(draft.stories),
        notes: notes || null,
      });
      if (!r.ok) return void toast.error(r.error);
      try {
        localStorage.removeItem(draftKey(account.id, weekStart));
      } catch {
        /* abaikan */
      }
      toast.success(`${PLATFORM_LABEL[account.platform]} @${account.handle} tersimpan`);
      setOpen(false);
      router.refresh();
    });
  }

  function remove() {
    if (!existing || !window.confirm("Hapus laporan akun ini untuk minggu tersebut?")) return;
    start(async () => {
      const r = await deleteWeeklyReport(existing.id);
      if (!r.ok) return void toast.error(r.error);
      toast.success("Laporan dihapus");
      router.refresh();
    });
  }

  return (
    <div ref={boxRef} className={cn("rounded-2xl border-2 bg-card", existing ? "border-success/50" : "border-foreground")}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-14 w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[14px] font-bold">{PLATFORM_LABEL[account.platform]}</span>
          <span className="block truncate text-[11.5px] text-muted-foreground">
            @{account.handle}
            {existing && !open ? ` · ${nf.format(existing.views)} views · ${nf.format(existing.followers)} followers` : ""}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {existing ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-success/40 bg-success/15 px-2 py-0.5 text-[10.5px] font-bold text-success">
              <Check size={11} /> Terisi{existing.enteredByName ? <span className="hidden sm:inline"> · {existing.enteredByName}</span> : null}
            </span>
          ) : (
            <span className="rounded-full border border-warning/40 bg-warning/15 px-2 py-0.5 text-[10.5px] font-bold text-warning">Belum diisi</span>
          )}
          <ChevronDown size={16} className={cn("text-muted-foreground transition-transform", open && "rotate-180")} />
        </span>
      </button>

      {open && (
        <div className="border-t border-border/60 px-3.5 pb-3.5 pt-3">
          <Group title="Performance">
            <Num label="Views" value={draft.views} onChange={set("views")} onKeyDown={nextOnEnter} />
            <Num label="Viewers" value={draft.viewers} onChange={set("viewers")} onKeyDown={nextOnEnter} invalid={viewersTooHigh} />
            <Num label="Interaksi" hint="like + komentar + share + simpan" value={draft.interactions} onChange={set("interactions")} onKeyDown={nextOnEnter} wide />
            {viewersTooHigh && <p className="col-span-2 text-[11px] text-destructive sm:col-span-3">Viewers lebih besar dari views — mungkin tertukar.</p>}
          </Group>
          <Group title="Audience">
            <Num
              label="Followers (akhir minggu)"
              hint={lastFollowers ? `minggu ${dm(lastFollowers.weekStart)}: ${nf.format(lastFollowers.followers)}` : undefined}
              value={draft.followers}
              onChange={set("followers")}
              onKeyDown={nextOnEnter}
              wide
            />
            <Num label="Follows" value={draft.follows} onChange={set("follows")} onKeyDown={nextOnEnter} />
            <Num label="Unfollows" value={draft.unfollows} onChange={set("unfollows")} onKeyDown={nextOnEnter} />
            <div className="col-span-2 flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 sm:col-span-1 sm:flex-col sm:items-start sm:justify-center">
              <span className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Net follows</span>
              <span className={cn("font-display text-[16px] font-bold tabular-nums", net == null ? "text-muted-foreground" : net >= 0 ? "text-success" : "text-destructive")}>
                {net == null ? "—" : `${net > 0 ? "+" : ""}${nf.format(net)}`}
              </span>
            </div>
          </Group>
          <Group title="Routine">
            <Num label="Post" value={draft.posts} onChange={set("posts")} onKeyDown={nextOnEnter} />
            <Num label="Reels" value={draft.reels} onChange={set("reels")} onKeyDown={nextOnEnter} />
            <Num label="Stories" value={draft.stories} onChange={set("stories")} onKeyDown={nextOnEnter} />
          </Group>

          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={500}
            enterKeyHint="done"
            placeholder="Catatan (opsional)"
            className="mt-1 h-11 w-full rounded-lg border-2 border-border bg-background px-3 text-base md:h-9 md:text-[13px]"
          />
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button size="lg" className="h-11 w-full sm:w-auto" onClick={save} disabled={pending || !complete || viewersTooHigh}>
              {pending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} {existing ? "Perbarui" : "Simpan"}
            </Button>
            {!complete && <span className="text-[11.5px] text-muted-foreground">Semua angka wajib diisi (0 bila nol).</span>}
            {isAdmin && existing && (
              <Button variant="ghost" className="h-11 sm:h-9" onClick={remove} disabled={pending}>
                <Trash2 size={14} /> Hapus
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">{title}</div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">{children}</div>
    </div>
  );
}

function Num({
  label,
  hint,
  value,
  onChange,
  onKeyDown,
  wide = false,
  invalid = false,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  /** Penuh selebar kartu di HP (label panjang). */
  wide?: boolean;
  invalid?: boolean;
}) {
  return (
    <label className={cn("block", wide && "col-span-2 sm:col-span-1")}>
      <span className="block text-[12px] font-semibold leading-tight">{label}</span>
      <input
        data-fld
        inputMode="numeric"
        pattern="[0-9]*"
        enterKeyHint="next"
        autoComplete="off"
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder="0"
        aria-invalid={invalid || undefined}
        // 16px di HP: di bawah itu iOS Safari memperbesar layar tiap kali input difokuskan.
        className={cn(
          "mt-0.5 h-11 w-full rounded-lg border-2 bg-background px-3 text-base tabular-nums md:h-9 md:text-[14px]",
          invalid ? "border-destructive" : "border-border"
        )}
      />
      {hint && <span className="mt-0.5 block text-[10.5px] leading-tight text-muted-foreground">{hint}</span>}
    </label>
  );
}

/** Berapa minggu ke belakang yang bisa diisi/dilengkapi (±6 bulan). */
export const REPORT_WEEKS_BACK = 26;
/** Senin pertama yang masuk daftar: minggu sebelum ini tidak diisi/ditampilkan (batas bawah tambahan di atas 26 minggu). */
export const REPORT_FIRST_WEEK = "2026-08-03";

/**
 * Ruang kerja laporan mingguan: daftar minggu di sisi kiri, form minggu terpilih di kanan (di HP: daftar di atas, form
 * di bawah). Minggu yang BELUM lengkap ada di kotak yang bisa digulir; yang sudah lengkap diarsipkan (terlipat) supaya
 * halaman tidak memanjang. Tiap baris menunjukkan titik status per akun dan jumlah akun yang sudah terisi.
 */
export function SocialReportWorkspace({ page, basePath, weeks = REPORT_WEEKS_BACK }: { page: SocialReportPage; basePath: string; weeks?: number }) {
  const router = useRouter();
  const accounts = page.brands.flatMap((b) => b.accounts.map((a) => ({ ...a, brand: b.label })));
  const total = accounts.length;
  const done = new Set(page.history.map((h) => `${h.accountId}|${h.weekStart}`));
  const rows = Array.from({ length: weeks }, (_, i) => {
    const week = addDays(page.latestWeekStart, -7 * i);
    const flags = accounts.map((a) => done.has(`${a.id}|${week}`));
    return { week, flags, count: flags.filter(Boolean).length };
  }).filter((r) => r.week >= REPORT_FIRST_WEEK);
  const totalWeeks = rows.length;
  const pending = rows.filter((r) => r.count < total);
  const archived = rows.filter((r) => r.count >= total);
  const go = (week: string) => router.push(`${basePath}?week=${week}`);
  // Minggu kosong berikutnya: yang lebih lama dari minggu terpilih, atau yang terbaru bila sudah di ujung.
  const nextPending = pending.find((r) => r.week < page.weekStart) ?? pending.find((r) => r.week !== page.weekStart);

  const rowProps = (r: (typeof rows)[number]) => ({
    row: r,
    total,
    selected: r.week === page.weekStart,
    labels: accounts.map((a) => `${a.brand} ${PLATFORM_SHORT[a.platform]}`),
    onPick: () => go(r.week),
  });

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:items-start">
      <aside className="space-y-3 lg:sticky lg:top-4">
        <div>
          <div className="mb-1 flex items-center justify-between text-[11.5px] text-muted-foreground">
            <span>
              {archived.length} dari {totalWeeks} minggu lengkap
            </span>
            {pending.length === 0 && <span className="font-semibold text-success">Semua lengkap ✓</span>}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={archived.length} aria-valuemin={0} aria-valuemax={totalWeeks}>
            <div className="h-full rounded-full bg-success transition-all" style={{ width: `${totalWeeks ? (archived.length / totalWeeks) * 100 : 0}%` }} />
          </div>
        </div>

        <section className="space-y-1.5">
          <h3 className="font-display text-[13px] font-bold">Perlu diisi ({pending.length} minggu)</h3>
          {pending.length === 0 ? (
            <p className="rounded-2xl border-2 border-dashed border-border px-3 py-4 text-center text-[12.5px] text-muted-foreground">
              Semua minggu ({totalWeeks} terakhir) sudah lengkap.
            </p>
          ) : (
            <div className="max-h-72 overflow-y-auto overscroll-contain rounded-2xl border-2 border-foreground bg-card">
              <ul className="divide-y divide-border/60">
                {pending.map((r) => (
                  <li key={r.week}>
                    <WeekRow {...rowProps(r)} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {archived.length > 0 && (
          <details className="group rounded-2xl border border-border bg-card">
            <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-[12.5px] font-semibold">
              <span>Arsip · {archived.length} minggu lengkap</span>
              <ChevronDown size={15} className="text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="max-h-60 overflow-y-auto overscroll-contain border-t border-border/60">
              <ul className="divide-y divide-border/60">
                {archived.map((r) => (
                  <li key={r.week}>
                    <WeekRow {...rowProps(r)} />
                  </li>
                ))}
              </ul>
            </div>
          </details>
        )}
      </aside>

      <div className="min-w-0 space-y-3">
        {nextPending && (
          <button type="button" onClick={() => go(nextPending.week)} className="text-[12.5px] font-semibold text-primary hover:underline">
            Lanjut ke minggu kosong berikutnya ({dm(nextPending.week)}) →
          </button>
        )}
        <SocialReportForm page={page} basePath={basePath} />
      </div>
    </div>
  );
}

function WeekRow({
  row,
  total,
  selected,
  labels,
  onPick,
}: {
  row: { week: string; flags: boolean[]; count: number };
  total: number;
  selected: boolean;
  labels: string[];
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-current={selected || undefined}
      className={cn("flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] transition", selected ? "bg-primary/10" : "hover:bg-muted/60")}
    >
      <span className={cn("min-w-0 flex-1 truncate", selected ? "font-bold" : "font-medium")}>{weekLabel(row.week).replace(/ \d{4}$/, "")}</span>
      <span className="flex items-center gap-1" aria-hidden>
        {row.flags.map((ok, i) => (
          <span key={i} title={`${labels[i]}: ${ok ? "terisi" : "belum"}`} className={cn("size-2.5 rounded-full", ok ? "bg-success" : "bg-warning")} />
        ))}
      </span>
      <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
        {row.count}/{total}
      </span>
      <span className="sr-only">
        {row.count >= total ? "lengkap" : "belum lengkap"}
      </span>
    </button>
  );
}
