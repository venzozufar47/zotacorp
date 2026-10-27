"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronLeft, ChevronRight, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  deleteWeeklyReport,
  saveWeeklyReport,
  type SocialAccountView,
  type SocialReportPage,
  type WeeklyReportView,
} from "@/lib/actions/social-report.actions";

const PLATFORM_LABEL = { instagram: "Instagram", tiktok: "TikTok" } as const;
const nf = new Intl.NumberFormat("id-ID");

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const dm = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS_SHORT[Number(iso.slice(5, 7)) - 1]}`;
/** "19 Okt – 25 Okt 2026" */
export function weekLabel(weekStart: string): string {
  const end = addDays(weekStart, 6);
  return `${dm(weekStart)} – ${dm(end)} ${end.slice(0, 4)}`;
}

type Draft = Record<"views" | "viewers" | "interactions" | "followers" | "follows" | "unfollows" | "posts" | "reels" | "stories", string>;
const FIELDS = ["views", "viewers", "interactions", "followers", "follows", "unfollows", "posts", "reels", "stories"] as const;

function draftOf(r: WeeklyReportView | undefined): Draft {
  const d = {} as Draft;
  for (const k of FIELDS) d[k] = r ? String(r[k]) : "";
  return d;
}

/**
 * Form laporan mingguan per akun. Dipakai halaman owner (/admin/social) dan halaman pengisi (/sosmed): tiap Senin
 * mengisi laporan untuk minggu lalu. `basePath` = tempat navigasi minggu (?week=).
 */
export function SocialReportForm({ page, basePath }: { page: SocialReportPage; basePath: string }) {
  const router = useRouter();
  const canNext = page.weekStart < page.latestWeekStart;
  const go = (week: string) => router.push(`${basePath}?week=${week}`);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => go(addDays(page.weekStart, -7))} aria-label="Minggu sebelumnya">
          <ChevronLeft size={15} />
        </Button>
        <div className="min-w-[200px] rounded-xl border-2 border-foreground bg-card px-3 py-1.5 text-center">
          <div className="font-display text-[14px] font-bold leading-tight">{weekLabel(page.weekStart)}</div>
          <div className="text-[10.5px] text-muted-foreground">
            {page.weekStart === page.latestWeekStart ? "Minggu lalu — jatuh tempo Senin" : "Minggu sebelumnya"}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => go(addDays(page.weekStart, 7))} disabled={!canNext} aria-label="Minggu berikutnya">
          <ChevronRight size={15} />
        </Button>
        {canNext && (
          <Button variant="ghost" size="sm" onClick={() => go(page.latestWeekStart)}>
            Ke minggu lalu
          </Button>
        )}
      </div>

      <p className="text-[12.5px] text-muted-foreground">
        Isi tiap Senin untuk minggu yang baru selesai, dari menu Insights masing-masing akun (rentang Senin–Minggu). Followers diisi angka pada akhir minggu.
      </p>

      {page.brands.map((brand) => (
        <section key={brand.id} className="space-y-3">
          <h3 className="font-display text-[15px] font-bold">{brand.label}</h3>
          <div className="grid gap-3 lg:grid-cols-2">
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
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft((d) => ({ ...d, [k]: e.target.value.replace(/[^\d]/g, "") }));

  const n = (k: keyof Draft) => (draft[k] === "" ? null : Number(draft[k]));
  const net = n("follows") != null && n("unfollows") != null ? (n("follows") as number) - (n("unfollows") as number) : null;
  const complete = FIELDS.every((k) => draft[k] !== "");

  function save() {
    if (!complete) return void toast.error("Isi semua angka (tulis 0 bila memang nol)");
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
      toast.success(`${PLATFORM_LABEL[account.platform]} @${account.handle} tersimpan`);
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
    <div className={cn("rounded-2xl border-2 bg-card p-3.5", existing ? "border-success/50" : "border-foreground")}>
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-display text-[14px] font-bold">{PLATFORM_LABEL[account.platform]}</div>
          <div className="truncate text-[11.5px] text-muted-foreground">@{account.handle}</div>
        </div>
        {existing ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-success/40 bg-success/15 px-2 py-0.5 text-[10.5px] font-bold text-success">
            <Check size={11} /> Terisi{existing.enteredByName ? ` · ${existing.enteredByName}` : ""}
          </span>
        ) : (
          <span className="rounded-full border border-warning/40 bg-warning/15 px-2 py-0.5 text-[10.5px] font-bold text-warning">Belum diisi</span>
        )}
      </div>

      <Group title="Performance">
        <Num label="Views" value={draft.views} onChange={set("views")} />
        <Num label="Viewers" value={draft.viewers} onChange={set("viewers")} />
        <Num label="Interaksi" hint="like + komentar + share + simpan" value={draft.interactions} onChange={set("interactions")} />
      </Group>
      <Group title="Audience">
        <Num
          label="Followers (akhir minggu)"
          hint={lastFollowers ? `minggu ${dm(lastFollowers.weekStart)}: ${nf.format(lastFollowers.followers)}` : undefined}
          value={draft.followers}
          onChange={set("followers")}
        />
        <Num label="Follows" value={draft.follows} onChange={set("follows")} />
        <Num label="Unfollows" value={draft.unfollows} onChange={set("unfollows")} />
        <div className="flex flex-col justify-end text-[12px]">
          <span className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Net follows</span>
          <span className={cn("h-9 content-center font-display text-[15px] font-bold tabular-nums", net == null ? "text-muted-foreground" : net >= 0 ? "text-success" : "text-destructive")}>
            {net == null ? "—" : `${net > 0 ? "+" : ""}${nf.format(net)}`}
          </span>
        </div>
      </Group>
      <Group title="Routine">
        <Num label="Post" value={draft.posts} onChange={set("posts")} />
        <Num label="Reels" value={draft.reels} onChange={set("reels")} />
        <Num label="Stories" value={draft.stories} onChange={set("stories")} />
      </Group>

      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        maxLength={500}
        placeholder="Catatan (opsional)"
        className="mt-1 h-9 w-full rounded-lg border-2 border-border bg-background px-2.5 text-[13px]"
      />
      <div className="mt-2.5 flex items-center gap-2">
        <Button size="sm" onClick={save} disabled={pending || !complete}>
          {pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} {existing ? "Perbarui" : "Simpan"}
        </Button>
        {isAdmin && existing && (
          <Button variant="ghost" size="sm" onClick={remove} disabled={pending}>
            <Trash2 size={14} /> Hapus
          </Button>
        )}
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-2.5">
      <div className="mb-1 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">{title}</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{children}</div>
    </div>
  );
}

function Num({ label, hint, value, onChange }: { label: string; hint?: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <label className="block">
      <span className="block text-[11.5px] font-semibold leading-tight">{label}</span>
      <input
        inputMode="numeric"
        value={value}
        onChange={onChange}
        placeholder="0"
        className="mt-0.5 h-9 w-full rounded-lg border-2 border-border bg-background px-2.5 text-[14px] tabular-nums"
      />
      {hint && <span className="mt-0.5 block text-[10px] leading-tight text-muted-foreground">{hint}</span>}
    </label>
  );
}

/** Kisi kelengkapan: minggu terakhir × akun, ✓ = sudah ada laporan. Klik sel untuk melompat ke minggu itu. */
export function SocialCompletenessGrid({ page, basePath, weeks = 8 }: { page: SocialReportPage; basePath: string; weeks?: number }) {
  const router = useRouter();
  const accounts = page.brands.flatMap((b) => b.accounts.map((a) => ({ ...a, brand: b.label })));
  const done = new Set(page.history.map((h) => `${h.accountId}|${h.weekStart}`));
  const list = Array.from({ length: weeks }, (_, i) => addDays(page.latestWeekStart, -7 * i));
  return (
    <div className="overflow-x-auto rounded-2xl border-2 border-foreground bg-card">
      <table className="w-full min-w-[640px] text-[12px]">
        <thead>
          <tr className="border-b border-border text-left text-[10.5px] uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 font-semibold">Minggu</th>
            {accounts.map((a) => (
              <th key={a.id} className="px-2 py-2 text-center font-semibold" title={`${a.brand} · @${a.handle}`}>
                <div className="truncate">{a.brand}</div>
                <div className="font-normal normal-case">{PLATFORM_LABEL[a.platform]}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {list.map((w) => (
            <tr key={w} className="border-b border-border/60 last:border-0">
              <td className="px-3 py-1.5 font-medium whitespace-nowrap">{weekLabel(w)}</td>
              {accounts.map((a) => {
                const ok = done.has(`${a.id}|${w}`);
                return (
                  <td key={a.id} className="px-2 py-1 text-center">
                    <button
                      type="button"
                      onClick={() => router.push(`${basePath}?week=${w}`)}
                      className={cn("size-7 rounded-lg text-[12px] font-bold", ok ? "bg-success/15 text-success" : "bg-warning/15 text-warning")}
                      aria-label={`${a.brand} ${PLATFORM_LABEL[a.platform]} ${weekLabel(w)}: ${ok ? "terisi" : "belum"}`}
                    >
                      {ok ? "✓" : "–"}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
