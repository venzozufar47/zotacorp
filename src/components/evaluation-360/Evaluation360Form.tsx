"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  EVALUATION_360_METRICS,
  EVALUATION_360_MAX_TOTAL,
  validateMetricScores,
  computeTotal,
  type Evaluation360MetricKey,
  type Evaluation360MetricScores,
} from "@/lib/evaluation-360/rubric";
import { submitEvaluation360 } from "@/lib/actions/evaluation-360.actions";
import { cn } from "@/lib/utils";

/**
 * Form evaluasi satu peer — 5 blok skor+alasan (bukan wizard multi-step
 * seperti DISC, cukup satu halaman scroll). Draft autosave ke
 * localStorage (debounced, karena ada text field), key per (round,
 * subject) supaya tidak hilang saat refresh/pindah tab.
 */

function draftKey(roundId: string, subjectId: string) {
  return `evaluation-360-draft-${roundId}-${subjectId}`;
}

function emptyScores(): Evaluation360MetricScores {
  return EVALUATION_360_METRICS.reduce((acc, m) => {
    acc[m.key] = { score: 0, reason: "" };
    return acc;
  }, {} as Evaluation360MetricScores);
}

export function Evaluation360Form({
  roundId,
  subjectId,
  roundTitle,
  roundStatus,
  subjectName,
  existing,
}: {
  roundId: string;
  subjectId: string;
  roundTitle: string;
  roundStatus: "active" | "closed";
  subjectName: string;
  existing: { scores: Evaluation360MetricScores; notes: string } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [scores, setScores] = useState<Evaluation360MetricScores>(
    existing?.scores ?? emptyScores()
  );
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const loadedDraft = useRef(false);

  useEffect(() => {
    if (loadedDraft.current) return;
    loadedDraft.current = true;
    if (existing) return; // hasil tersimpan di server menang atas draft lokal
    try {
      const raw = window.localStorage.getItem(draftKey(roundId, subjectId));
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.scores) setScores(parsed.scores);
      if (typeof parsed?.notes === "string") setNotes(parsed.notes);
    } catch {
      // draft rusak/tidak ada — abaikan.
    }
  }, [roundId, subjectId, existing]);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        window.localStorage.setItem(
          draftKey(roundId, subjectId),
          JSON.stringify({ scores, notes })
        );
      } catch {
        // storage penuh/di-disable — draft hanya bertahan di state.
      }
    }, 400);
    return () => clearTimeout(t);
  }, [roundId, subjectId, scores, notes]);

  function setMetric(key: Evaluation360MetricKey, patch: Partial<{ score: number; reason: string }>) {
    setScores((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  const closed = roundStatus === "closed";
  const total = computeTotal(scores);

  function submit() {
    const invalid = validateMetricScores(scores);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    startTransition(async () => {
      const res = await submitEvaluation360({ roundId, subjectId, scores, notes });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      try {
        window.localStorage.removeItem(draftKey(roundId, subjectId));
      } catch {
        // abaikan
      }
      toast.success(`Evaluasi untuk ${subjectName} tersimpan.`);
      router.push("/evaluasi");
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={() => router.push("/evaluasi")}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={15} /> Kembali
      </button>

      <div>
        <h1 className="font-display text-2xl font-bold">
          Evaluasi untuk {subjectName}
          <span className="text-primary">.</span>
        </h1>
        <p className="text-sm text-muted-foreground">{roundTitle}</p>
      </div>

      {closed && (
        <div className="rounded-xl border-2 border-destructive bg-destructive/10 px-4 py-3 text-sm">
          Round ini sudah ditutup — evaluasi tidak bisa diisi/diubah lagi.
        </div>
      )}

      <p className="text-xs text-muted-foreground leading-relaxed">
        Beri skor <strong>1–10</strong> untuk tiap metrik. Wajib isi{" "}
        <strong>alasan & contoh kasus konkret</strong> — bukan kesan umum,
        tulis kejadian nyata. Jujur dan objektif; ini untuk perbaikan, bukan
        untuk menjatuhkan.
      </p>

      <div className="space-y-4">
        {EVALUATION_360_METRICS.map((metric) => (
          <div
            key={metric.key}
            className="rounded-2xl border-2 border-foreground bg-card p-4 shadow-hard-sm space-y-3"
          >
            <div>
              <h2 className="font-display text-base font-bold">{metric.title}</h2>
              <p className="text-xs text-muted-foreground mt-1">{metric.definition}</p>
              <ul className="text-[11.5px] text-muted-foreground mt-1.5 list-disc pl-4 space-y-0.5">
                {metric.indicators.map((ind) => (
                  <li key={ind}>{ind}</li>
                ))}
              </ul>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-muted-foreground">Skor</span>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
                  const active = scores[metric.key].score === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      disabled={closed}
                      onClick={() => setMetric(metric.key, { score: n })}
                      className={cn(
                        "size-8 rounded-lg text-xs font-bold border-2 transition disabled:opacity-50",
                        active
                          ? "bg-primary text-primary-foreground border-foreground"
                          : "bg-background text-muted-foreground border-border hover:border-foreground"
                      )}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-muted-foreground">
                Alasan & contoh kasus
              </span>
              <Textarea
                value={scores[metric.key].reason}
                disabled={closed}
                onChange={(e) => setMetric(metric.key, { reason: e.target.value })}
                placeholder="Tulis kejadian nyata, kapan, dan apa yang terjadi…"
                rows={3}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 space-y-1.5">
        <span className="text-xs font-semibold text-muted-foreground">
          Catatan tambahan (opsional)
        </span>
        <Textarea
          value={notes}
          disabled={closed}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
        />
      </div>

      {/* Statis (bukan sticky) — di mobile, BottomNav yang fixed di bawah
          viewport bisa menutupi elemen sticky bottom-*, jadi tombol submit
          cukup ditempatkan di akhir alur konten seperti navigasi
          DiscTestWizard. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-foreground bg-card p-4 shadow-hard-sm">
        <span className="text-sm font-semibold">
          Total: {total} / {EVALUATION_360_MAX_TOTAL}
        </span>
        <Button
          type="button"
          onClick={submit}
          disabled={pending || closed}
          size="lg"
          className="w-full sm:w-auto"
        >
          {pending ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Menyimpan…
            </>
          ) : (
            <>
              <Check size={16} /> Simpan evaluasi
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
