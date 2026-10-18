"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { postHuddle, type HuddleView, type MinutesBranch } from "@/lib/actions/team-minutes.actions";
import { cn } from "@/lib/utils";

const BRANCHES: MinutesBranch[] = ["Pare", "Semarang"];

/** "2026-10-19" → "Sen, 19 Okt". Tanggal murni tanpa jam, jadi aman di SSR. */
export function briefingDateLabel(ymd: string): string {
  return new Date(`${ymd}T00:00:00`).toLocaleDateString("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** Jam dicatat, selalu WIB supaya sama di server dan di perangkat mana pun. */
export function briefingTimeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

/** Isi satu briefing — dipakai riwayat leader dan tab superadmin. */
export function BriefingBody({ b }: { b: HuddleView }) {
  return (
    <div className="space-y-1.5 text-sm">
      <p>
        <span className="font-semibold">Target:</span> {b.targetToday}
      </p>
      {b.yesterdayBlocker && (
        <p>
          <span className="font-semibold">Kendala kemarin:</span> {b.yesterdayBlocker}
        </p>
      )}
      {b.whoHoldsWhat && (
        <p>
          <span className="font-semibold">Siapa pegang apa:</span> {b.whoHoldsWhat}
        </p>
      )}
    </div>
  );
}

function BriefingForm({ branch, today }: { branch: MinutesBranch; today: HuddleView | null }) {
  const router = useRouter();
  const [target, setTarget] = useState(today?.targetToday ?? "");
  const [blocker, setBlocker] = useState(today?.yesterdayBlocker ?? "");
  const [holds, setHolds] = useState(today?.whoHoldsWhat ?? "");
  const [saving, setSaving] = useState(false);

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
        <Label htmlFor="bk-target">Target hari ini</Label>
        <Textarea
          id="bk-target"
          rows={2}
          placeholder="Mis. 40 pesanan cake siap sebelum jam 15.00"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="bk-blocker">Kendala kemarin (opsional)</Label>
        <Input id="bk-blocker" value={blocker} onChange={(e) => setBlocker(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="bk-holds">Siapa pegang apa (opsional)</Label>
        <Input id="bk-holds" value={holds} onChange={(e) => setHolds(e.target.value)} />
      </div>
      <Button onClick={submit} loading={saving} size="lg" className="w-full">
        {today ? "Perbarui briefing kilat" : "Catat briefing kilat"}
      </Button>
    </div>
  );
}

/**
 * Notulensi Briefing Kilat harian — bagian dari halaman Tim (kepala tim), bukan
 * halaman sendiri. Satu briefing per cabang per hari: mencatat lagi di hari
 * yang sama memperbarui yang ada. Riwayat memuat briefing cabang terpilih.
 */
export function TeamBriefingPanel({
  briefings,
  todayYmd,
}: {
  briefings: HuddleView[];
  todayYmd: string;
}) {
  const [branch, setBranch] = useState<MinutesBranch>("Pare");
  const forBranch = briefings.filter((b) => b.branch === branch);
  const today = forBranch.find((b) => b.huddleDate === todayYmd) ?? null;
  const history = forBranch.filter((b) => b.huddleDate !== todayYmd).slice(0, 14);

  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="Cabang" className="flex gap-2">
        {BRANCHES.map((b) => (
          <button
            key={b}
            type="button"
            role="radio"
            aria-checked={b === branch}
            onClick={() => setBranch(b)}
            className={cn(
              "rounded-full border-2 px-4 py-1.5 text-sm font-semibold transition",
              b === branch
                ? "border-foreground bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:border-foreground/60"
            )}
          >
            {b}
          </button>
        ))}
      </div>

      <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-start gap-2">
          {today ? (
            <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-success" />
          ) : (
            <Circle size={18} className="mt-0.5 shrink-0 text-muted-foreground" />
          )}
          <div>
            <h3 className="font-display text-sm font-bold">Briefing kilat hari ini — {branch}</h3>
            <p className="text-xs text-muted-foreground">
              {today
                ? `Sudah dicatat ${today.postedByName ?? "—"} pukul ${briefingTimeLabel(today.createdAt)}. Kamu bisa memperbaruinya.`
                : "Belum dicatat hari ini."}
            </p>
          </div>
        </div>
        <BriefingForm key={`${branch}-${today?.id ?? "baru"}`} branch={branch} today={today} />
      </section>

      <section className="space-y-2">
        <h3 className="font-display text-sm font-bold text-muted-foreground">
          Riwayat {branch}
        </h3>
        {history.length === 0 ? (
          <p className="rounded-xl border-2 border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Belum ada briefing kilat sebelumnya.
          </p>
        ) : (
          history.map((b) => (
            <article key={b.id} className="space-y-2 rounded-xl border border-border bg-card p-3">
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{briefingDateLabel(b.huddleDate)}</span>
                <span>
                  {b.postedByName ?? "—"} · {briefingTimeLabel(b.createdAt)}
                </span>
              </div>
              <BriefingBody b={b} />
            </article>
          ))
        )}
      </section>
    </div>
  );
}
