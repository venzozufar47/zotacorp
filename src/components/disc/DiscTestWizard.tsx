"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Brain, Check, Loader2, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/account/Disclosure";
import { DISC_QUESTIONS } from "@/lib/disc/data/questions";
import { submitDiscTest } from "@/lib/actions/disc.actions";
import type { DiscAnswer } from "@/lib/disc/scoring";
import { cn } from "@/lib/utils";

/**
 * Wizard Tes Kepribadian DISC — 24 kelompok kata. Tiap kelompok pilih
 * SATU "Paling menggambarkan" dan SATU "Kurang menggambarkan" (beda
 * baris). Draft tersimpan di localStorage agar tidak hilang saat
 * refresh. Mobile-first.
 */

const DRAFT_KEY = "disc-test-draft-v1";

type Draft = Partial<DiscAnswer>[];

function loadDraft(): Draft {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function DiscTestWizard() {
  const router = useRouter();
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState(0); // index kelompok 0..23
  const [draft, setDraft] = useState<Draft>([]);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const d = loadDraft();
    setDraft(d);
    if (d.some((a) => a && (a.most !== undefined || a.least !== undefined))) {
      setStarted(true);
      // Lanjut ke kelompok pertama yang belum lengkap.
      const idx = DISC_QUESTIONS.findIndex((_, i) => {
        const a = d[i];
        return !a || a.most === undefined || a.least === undefined;
      });
      setStep(idx === -1 ? DISC_QUESTIONS.length - 1 : idx);
    }
  }, []);

  function saveDraft(next: Draft) {
    setDraft(next);
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
    } catch {
      // storage penuh/di-disable — draft hanya bertahan di state.
    }
  }

  const completed = useMemo(
    () =>
      DISC_QUESTIONS.filter((_, i) => {
        const a = draft[i];
        return a && a.most !== undefined && a.least !== undefined && a.most !== a.least;
      }).length,
    [draft]
  );
  const allDone = completed === DISC_QUESTIONS.length;

  function setChoice(kind: "most" | "least", lineIdx: number) {
    const next = [...draft];
    const cur = { ...(next[step] ?? {}) };
    if (cur[kind] === lineIdx) {
      delete cur[kind]; // tap ulang = batal pilih
    } else {
      cur[kind] = lineIdx;
      // Kalau bentrok dengan pilihan satunya, kosongkan yang satunya.
      const other = kind === "most" ? "least" : "most";
      if (cur[other] === lineIdx) delete cur[other];
    }
    next[step] = cur;
    saveDraft(next);
  }

  function submit() {
    if (!allDone) return;
    const answers = draft.map((a) => ({ most: a!.most!, least: a!.least! }));
    startTransition(async () => {
      const res = await submitDiscTest(answers);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      try {
        window.localStorage.removeItem(DRAFT_KEY);
      } catch {
        // abaikan
      }
      toast.success("Tes selesai. Hasilmu sudah muncul.");
      router.refresh();
    });
  }

  if (!started) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-warning/15 text-warning">
              <Brain size={20} aria-hidden />
            </span>
            <div>
              <h2 className="font-display text-base font-semibold">Tes Kepribadian DISC</h2>
              <p className="text-xs text-muted-foreground">±10 menit · 24 kelompok kata</p>
            </div>
          </div>
          <p className="text-sm leading-relaxed">
            Di tiap kelompok, pilih satu kata yang <strong>paling mirip</strong>{" "}
            dengan dirimu dan satu yang <strong>paling tidak mirip</strong>.
            Admin meminta kamu mengambil tes ini, dan slip gajimu terkunci
            sampai tes selesai.
          </p>
          <Disclosure title="Petunjuk pengisian">
            <ul className="list-disc space-y-1 pl-5 text-[13px] text-muted-foreground">
              <li>Tidak ada jawaban benar atau salah.</li>
              <li>Fokus pada dirimu di tempat kerja atau di rumah, jangan dicampur.</li>
              <li>Ikuti insting, jangan terlalu dianalisis.</li>
              <li>Selesaikan dalam satu waktu tanpa terputus.</li>
            </ul>
          </Disclosure>
          <Button size="lg" className="min-h-12 w-full" onClick={() => setStarted(true)}>
            Mulai tes <ArrowRight size={16} />
          </Button>
        </div>
      </div>
    );
  }

  const box = DISC_QUESTIONS[step];
  const cur = draft[step] ?? {};
  const stepDone = cur.most !== undefined && cur.least !== undefined;

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div>
        <div className="flex items-center justify-between text-[11px] font-semibold mb-1">
          <span>
            Kelompok {step + 1} dari {DISC_QUESTIONS.length}
          </span>
          <span className="text-muted-foreground">{completed}/24 terisi</span>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={DISC_QUESTIONS.length}
          aria-valuenow={completed}
          className="h-1.5 rounded-full bg-muted overflow-hidden"
        >
          <div
            className="h-full bg-primary transition-[width] duration-200 motion-reduce:transition-none"
            style={{ width: `${(completed / DISC_QUESTIONS.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Kartu soal */}
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between px-1 text-[11px] font-semibold">
          <span className="text-success">Paling mirip</span>
          <span className="text-destructive">Paling tidak mirip</span>
        </div>
        <div className="space-y-2">
          {box.lines.map((line, li) => {
            const isMost = cur.most === li;
            const isLeast = cur.least === li;
            return (
              <div
                key={li}
                className={cn(
                  "flex items-center gap-3 rounded-xl border px-3 py-2 transition-colors motion-reduce:transition-none",
                  isMost
                    ? "border-success bg-success/10"
                    : isLeast
                      ? "border-destructive bg-destructive/10"
                      : "border-border bg-background"
                )}
              >
                <button
                  type="button"
                  onClick={() => setChoice("most", li)}
                  aria-label={`Paling mirip: ${line.id}`}
                  aria-pressed={isMost}
                  className={cn(
                    "flex size-11 shrink-0 items-center justify-center rounded-lg border transition-colors motion-reduce:transition-none",
                    isMost
                      ? "border-success bg-success text-white"
                      : "border-border bg-card text-muted-foreground hover:border-success hover:text-success"
                  )}
                >
                  <Check size={16} />
                </button>
                <span className="flex-1 text-center text-sm sm:text-base font-semibold leading-snug">
                  {line.id}
                </span>
                <button
                  type="button"
                  onClick={() => setChoice("least", li)}
                  aria-label={`Paling tidak mirip: ${line.id}`}
                  aria-pressed={isLeast}
                  className={cn(
                    "flex size-11 shrink-0 items-center justify-center rounded-lg border transition-colors motion-reduce:transition-none",
                    isLeast
                      ? "border-destructive bg-destructive text-white"
                      : "border-border bg-card text-muted-foreground hover:border-destructive hover:text-destructive"
                  )}
                >
                  <Minus size={16} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Navigasi */}
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0 || pending}
        >
          <ArrowLeft size={16} /> Sebelumnya
        </Button>
        {step < DISC_QUESTIONS.length - 1 ? (
          <Button
            type="button"
            onClick={() => setStep((s) => Math.min(DISC_QUESTIONS.length - 1, s + 1))}
            disabled={!stepDone || pending}
          >
            Berikutnya <ArrowRight size={16} />
          </Button>
        ) : (
          <Button type="button" onClick={submit} disabled={!allDone || pending}>
            {pending ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Menghitung…
              </>
            ) : (
              "Selesai dan lihat hasil"
            )}
          </Button>
        )}
      </div>
      {!stepDone && (
        <p className="text-xs text-muted-foreground text-center">
          Pilih satu kata paling mirip dan satu paling tidak mirip, di baris
          berbeda, untuk lanjut.
        </p>
      )}
    </div>
  );
}
