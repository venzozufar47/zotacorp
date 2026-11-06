"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, ChevronDown, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { postHuddle, type HuddleView, type MinutesBranch } from "@/lib/actions/team-minutes.actions";
import { cn } from "@/lib/utils";
import { briefingDateLabel, briefingTimeLabel } from "@/lib/team/briefing-labels";

const BRANCHES: MinutesBranch[] = ["Pare", "Semarang"];

/** Isi satu briefing: target selalu tampil, bagian opsional hanya bila terisi. */
export function BriefingBody({ b }: { b: HuddleView }) {
  return (
    <dl className="space-y-1.5 text-sm">
      <div>
        <dt className="text-xs font-semibold text-muted-foreground">Target dan fokus</dt>
        <dd className="whitespace-pre-wrap">{b.targetToday}</dd>
      </div>
      {b.yesterdayBlocker && (
        <div>
          <dt className="text-xs font-semibold text-muted-foreground">Kendala kemarin</dt>
          <dd className="whitespace-pre-wrap">{b.yesterdayBlocker}</dd>
        </div>
      )}
      {b.whoHoldsWhat && (
        <div>
          <dt className="text-xs font-semibold text-muted-foreground">Tanya jawab / pembagian tugas</dt>
          <dd className="whitespace-pre-wrap">{b.whoHoldsWhat}</dd>
        </div>
      )}
    </dl>
  );
}

/** Satu baris riwayat: tanggal di judul, isi muncul saat diketuk. */
function HistoryItem({ b, showBranch }: { b: HuddleView; showBranch?: boolean }) {
  return (
    <details className="group border-b border-border last:border-b-0">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 py-2 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">
            {briefingDateLabel(b.huddleDate)}
            {showBranch && <span className="font-normal text-muted-foreground"> · {b.branch}</span>}
          </span>
          <span className="block truncate text-xs text-muted-foreground">{b.targetToday}</span>
        </span>
        <ChevronDown
          size={16}
          className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="space-y-2 px-4 pb-3">
        <BriefingBody b={b} />
        <p className="text-xs text-muted-foreground">
          {b.postedByName ?? "—"} · {briefingTimeLabel(b.createdAt)}
        </p>
      </div>
    </details>
  );
}

function History({ items, showBranch }: { items: HuddleView[]; showBranch?: boolean }) {
  if (items.length === 0) return null;
  return (
    <details className="group rounded-xl border border-border bg-card">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-4 py-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        Riwayat sebelumnya
        <ChevronDown
          size={16}
          className="text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="border-t border-border">
        {items.map((b) => (
          <HistoryItem key={b.id} b={b} showBranch={showBranch} />
        ))}
      </div>
    </details>
  );
}

/** Briefing kilat versi baca-saja untuk anggota tim (tanpa formulir catat). */
export function MemberBriefingView({
  briefings,
  todayYmd,
}: {
  briefings: HuddleView[];
  todayYmd: string;
}) {
  const today = briefings.filter((b) => b.huddleDate === todayYmd);
  const history = briefings.filter((b) => b.huddleDate !== todayYmd).slice(0, 14);
  const multi = new Set(briefings.map((b) => b.branch)).size > 1;

  return (
    <div className="space-y-3">
      {today.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          Briefing hari ini belum dicatat.
        </p>
      ) : (
        today.map((b) => (
          <article key={b.id} className="space-y-2 rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">
                {briefingDateLabel(b.huddleDate)}
                {multi && <span className="font-normal text-muted-foreground"> · {b.branch}</span>}
              </span>
              <span>
                {b.postedByName ?? "—"} · {briefingTimeLabel(b.createdAt)}
              </span>
            </div>
            <BriefingBody b={b} />
          </article>
        ))
      )}
      <History items={history} showBranch={multi} />
    </div>
  );
}

function BriefingForm({ branch, today }: { branch: MinutesBranch; today: HuddleView | null }) {
  const router = useRouter();
  const [target, setTarget] = useState(today?.targetToday ?? "");
  const [blocker, setBlocker] = useState(today?.yesterdayBlocker ?? "");
  const [holds, setHolds] = useState(today?.whoHoldsWhat ?? "");
  const [saving, setSaving] = useState(false);
  // Dihitung sekali: bila dihitung tiap render, bagian ini menutup sendiri saat isinya dikosongkan.
  const [startOpen] = useState(() => Boolean(today?.yesterdayBlocker || today?.whoHoldsWhat));

  async function submit() {
    if (!target.trim()) {
      toast.error("Isi target hari ini dulu");
      return;
    }
    setSaving(true);
    try {
      const res = await postHuddle({
        branch,
        targetToday: target,
        yesterdayBlocker: blocker || null,
        whoHoldsWhat: holds || null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(today ? "Briefing kilat diperbarui" : "Briefing kilat tercatat");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="bk-target">Target dan fokus hari ini</Label>
        <Textarea
          id="bk-target"
          rows={2}
          placeholder="Mis. 40 pesanan cake siap sebelum jam 15.00"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        />
      </div>

      <details className="group" open={startOpen}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-muted-foreground [&::-webkit-details-marker]:hidden">
          <ChevronDown size={16} className="transition-transform group-open:rotate-180" aria-hidden />
          Kendala dan pembagian tugas
          <span className="font-normal">(opsional)</span>
        </summary>
        <div className="space-y-3 pt-1">
          <div className="space-y-1.5">
            <Label htmlFor="bk-blocker">Kendala kemarin</Label>
            <Input
              id="bk-blocker"
              value={blocker}
              onChange={(e) => setBlocker(e.target.value)}
              placeholder="Kualitas, penjualan, pelayanan, operasional, keselamatan, atau budaya tim"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bk-holds">Tanya jawab atau pembagian tugas</Label>
            <Input id="bk-holds" value={holds} onChange={(e) => setHolds(e.target.value)} />
          </div>
        </div>
      </details>

      <Button onClick={submit} loading={saving} size="lg" className="w-full">
        {today ? "Perbarui" : "Catat briefing"}
      </Button>
    </div>
  );
}

/**
 * Notulensi Briefing Kilat harian untuk kepala tim. Satu briefing per cabang per
 * hari: mencatat lagi di hari yang sama memperbarui yang ada. Cabang ditentukan
 * otomatis dari penugasan kepala (`branches`); pilihan cabang hanya muncul bila ia
 * bertugas di lebih dari satu cabang, atau bila cabangnya tidak terdeteksi
 * (`branches` kosong → semua cabang ditawarkan).
 */
export function TeamBriefingPanel({
  briefings,
  todayYmd,
  branches,
}: {
  briefings: HuddleView[];
  todayYmd: string;
  branches: MinutesBranch[];
}) {
  const detected = branches.length > 0;
  const available = detected ? branches : BRANCHES;
  const [branch, setBranch] = useState<MinutesBranch>(available[0]);
  const forBranch = briefings.filter((b) => b.branch === branch);
  const today = forBranch.find((b) => b.huddleDate === todayYmd) ?? null;
  const history = forBranch.filter((b) => b.huddleDate !== todayYmd).slice(0, 14);

  return (
    <div className="space-y-3">
      {available.length > 1 ? (
        <div className="space-y-1.5">
          {!detected && (
            <p className="text-xs text-muted-foreground">
              Cabangmu belum terdeteksi dari lokasi kerja. Pilih cabang yang kamu briefing.
            </p>
          )}
          <div role="radiogroup" aria-label="Cabang" className="flex gap-2">
            {available.map((b) => (
              <button
                key={b}
                type="button"
                role="radio"
                aria-checked={b === branch}
                onClick={() => setBranch(b)}
                className={cn(
                  "h-11 rounded-full border px-5 text-sm font-semibold transition-colors",
                  b === branch
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                )}
              >
                {b}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs font-semibold text-muted-foreground">Cabang {available[0]}</p>
      )}

      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          {today ? (
            <CheckCircle2 size={18} className="shrink-0 text-success" aria-hidden />
          ) : (
            <Circle size={18} className="shrink-0 text-muted-foreground" aria-hidden />
          )}
          <p className="text-sm text-muted-foreground">
            {today
              ? `Dicatat ${today.postedByName ?? "—"} pukul ${briefingTimeLabel(today.createdAt)}. Bisa diperbarui.`
              : "Belum dicatat hari ini."}
          </p>
        </div>
        <BriefingForm key={`${branch}-${today?.id ?? "baru"}`} branch={branch} today={today} />
      </section>

      <History items={history} />
    </div>
  );
}
