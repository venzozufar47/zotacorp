"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Lock, Loader2, Save, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  closeRound,
  saveSubjectNotes,
  type RoundDetailDTO,
} from "@/lib/actions/evaluation-360.actions";
import { EVALUATION_360_METRICS } from "@/lib/evaluation-360/rubric";
import { cn } from "@/lib/utils";

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

function SubjectRekap({ roundId, subjectName, subjectId, detail }: {
  roundId: string;
  subjectId: string;
  subjectName: string;
  detail: RoundDetailDTO;
}) {
  const router = useRouter();
  const responses = detail.responsesBySubject[subjectId] ?? [];
  const notes = detail.notesBySubject[subjectId];
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [kesimpulan, setKesimpulan] = useState(notes?.kesimpulan ?? "");
  const [targetPerbaikan, setTargetPerbaikan] = useState(notes?.targetPerbaikan ?? "");
  const [caraPengecekan, setCaraPengecekan] = useState(notes?.caraPengecekan ?? "");
  const [targetDate, setTargetDate] = useState(notes?.targetCompletionDate ?? "");

  function toggle(raterId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(raterId)) next.delete(raterId);
      else next.add(raterId);
      return next;
    });
  }

  function saveNotes() {
    startTransition(async () => {
      const res = await saveSubjectNotes({
        roundId,
        subjectId,
        kesimpulan,
        targetPerbaikan,
        caraPengecekan,
        targetCompletionDate: targetDate,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Lembar ringkasan disimpan.");
      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border-2 border-foreground bg-card shadow-hard-sm overflow-hidden">
      <div className="px-4 py-3 border-b-2 border-foreground bg-muted/40">
        <h3 className="font-display text-base font-bold">{subjectName}</h3>
        <p className="text-xs text-muted-foreground">
          {responses.length} evaluator sudah menilai
        </p>
      </div>

      {responses.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted-foreground italic">
          Belum ada evaluasi masuk untuk orang ini.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 font-semibold">Evaluator</th>
                {EVALUATION_360_METRICS.map((m) => (
                  <th key={m.key} className="px-2 py-2 font-semibold text-center" title={m.title}>
                    {m.title.split(" ")[0]}
                  </th>
                ))}
                <th className="px-2 py-2 font-semibold text-center">Total</th>
                <th className="px-2 py-2 font-semibold text-right">Detail</th>
              </tr>
            </thead>
            <tbody>
              {responses.map((r) => (
                <Fragment key={r.raterId}>
                  <tr className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2 font-medium">{r.raterName}</td>
                    {EVALUATION_360_METRICS.map((m) => (
                      <td key={m.key} className="px-2 py-2 text-center">
                        {r.metricScores[m.key]?.score ?? "—"}
                      </td>
                    ))}
                    <td className="px-2 py-2 text-center font-bold">{r.totalScore}</td>
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => toggle(r.raterId)}
                        aria-label={
                          expanded.has(r.raterId)
                            ? `Sembunyikan detail evaluasi dari ${r.raterName}`
                            : `Lihat detail evaluasi dari ${r.raterName}`
                        }
                        aria-expanded={expanded.has(r.raterId)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {expanded.has(r.raterId) ? (
                          <ChevronUp size={16} />
                        ) : (
                          <ChevronDown size={16} />
                        )}
                      </button>
                    </td>
                  </tr>
                  {expanded.has(r.raterId) && (
                    <tr className="border-b border-border/60 bg-muted/10">
                      <td colSpan={EVALUATION_360_METRICS.length + 3} className="px-3 py-3">
                        <div className="space-y-2.5">
                          <div>
                            <p className="text-xs font-semibold flex items-center gap-1">
                              <Sparkles size={12} className="text-warning" /> Apresiasi
                            </p>
                            <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                              {r.apresiasi || "—"}
                            </p>
                          </div>
                          {EVALUATION_360_METRICS.map((m) => (
                            <div key={m.key}>
                              <p className="text-xs font-semibold">
                                {m.title}: {r.metricScores[m.key]?.score ?? "—"}/10
                              </p>
                              <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                                {r.metricScores[m.key]?.reason || "—"}
                              </p>
                            </div>
                          ))}
                          <div>
                            <p className="text-xs font-semibold">Catatan tambahan</p>
                            <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                              {r.notes || "—"}
                            </p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              <tr className="bg-muted/30">
                <td className="px-3 py-2 font-bold">Rata-rata</td>
                {EVALUATION_360_METRICS.map((m) => (
                  <td key={m.key} className="px-2 py-2 text-center font-bold">
                    {average(responses.map((r) => r.metricScores[m.key]?.score ?? 0))}
                  </td>
                ))}
                <td className="px-2 py-2 text-center font-bold">
                  {average(responses.map((r) => r.totalScore))}
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="px-4 py-3 border-t border-border space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Lembar ringkasan (diisi admin/owner)
        </p>
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">
            Kesimpulan hasil diskusi
          </label>
          <Textarea
            value={kesimpulan}
            onChange={(e) => setKesimpulan(e.target.value)}
            rows={2}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">
            Target perbaikan (4 minggu)
          </label>
          <Textarea
            value={targetPerbaikan}
            onChange={(e) => setTargetPerbaikan(e.target.value)}
            rows={2}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">
              Cara pengecekan progres
            </label>
            <Textarea
              value={caraPengecekan}
              onChange={(e) => setCaraPengecekan(e.target.value)}
              rows={2}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">
              Target selesai
            </label>
            <Input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
          </div>
        </div>
        <Button type="button" size="sm" onClick={saveNotes} disabled={pending} className="gap-1.5">
          {pending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Simpan ringkasan
        </Button>
      </div>
    </section>
  );
}

export function Evaluation360RoundDetail({ detail }: { detail: RoundDetailDTO }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function doClose() {
    if (!confirm("Tutup round ini? Karyawan tidak bisa lagi submit/edit evaluasi.")) return;
    startTransition(async () => {
      const res = await closeRound(detail.round.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Round ditutup.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2 text-xs">
          {detail.participants.map((p) => (
            <span
              key={p.userId}
              className="rounded-full border-2 border-foreground bg-card px-2.5 py-1 font-semibold"
            >
              {p.nickname || p.fullName}
              <span className="text-muted-foreground">
                {" "}
                · isi {p.submittedCount}/{detail.participants.length - 1} · diterima{" "}
                {p.receivedCount}
              </span>
            </span>
          ))}
        </div>
        {detail.round.status === "active" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={doClose}
            disabled={pending}
            className="gap-1.5"
          >
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
            Tutup round
          </Button>
        ) : (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-muted px-2.5 py-1 text-xs font-bold"
            )}
          >
            <Lock size={12} /> Ditutup
          </span>
        )}
      </div>

      <div className="space-y-4">
        {detail.participants.map((p) => (
          <SubjectRekap
            key={p.userId}
            roundId={detail.round.id}
            subjectId={p.userId}
            subjectName={p.nickname || p.fullName}
            detail={detail}
          />
        ))}
      </div>
    </div>
  );
}
