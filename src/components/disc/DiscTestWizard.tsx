"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Brain, Check, Loader2, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
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
      toast.success("Tes selesai! Ini hasil kepribadianmu 🎉");
      router.refresh();
    });
  }

  if (!started) {
    return (
      <div className="space-y-5">
      <div className="rounded-xl border-2 border-warning bg-warning/15 px-4 py-3 text-sm">
        <p className="font-semibold">Kamu diminta mengambil tes ini oleh admin.</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Slip gaji kamu terkunci sampai tes selesai. Hasilnya langsung muncul
          setelah submit — cuma butuh ±10 menit.
        </p>
      </div>
      <div className="rounded-2xl border-2 border-foreground bg-card p-6 shadow-hard-sm space-y-4">
        <div className="flex items-center gap-3">
          <span className="grid place-items-center size-12 rounded-full border-2 border-foreground bg-warning/40">
            <Brain size={22} />
          </span>
          <div>
            <h2 className="font-display text-lg font-bold">Tes Kepribadian DISC</h2>
            <p className="text-xs text-muted-foreground">±10 menit · 24 kelompok kata</p>
          </div>
        </div>
        <div className="text-sm space-y-2 leading-relaxed">
          <p>
            Kamu akan melihat <strong>24 kelompok kata</strong>. Di tiap kelompok, pilih satu
            baris yang <strong>paling mirip</strong> dengan dirimu dan satu baris yang{" "}
            <strong>paling tidak mirip</strong> dengan dirimu.
          </p>
          <ul className="list-disc pl-5 space-y-1 text-[13px] text-muted-foreground">
            <li>Ini bukan ujian — tidak ada jawaban benar atau salah.</li>
            <li>Fokus pada dirimu di tempat kerja ATAU di rumah, jangan dicampur.</li>
            <li>Jujur pada diri sendiri dan ikuti insting — jangan terlalu dianalisis.</li>
            <li>Usahakan selesai dalam satu waktu tanpa terputus.</li>
          </ul>
        </div>
        <Button size="lg" className="w-full sm:w-auto" onClick={() => setStarted(true)}>
          Mulai Tes →
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
        <div className="h-2 rounded-full bg-muted overflow-hidden border border-border">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${(completed / DISC_QUESTIONS.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Kartu soal */}
      <div className="rounded-2xl border-2 border-foreground bg-card p-4 sm:p-5 shadow-hard-sm space-y-3">
        <p className="text-center text-xs text-muted-foreground">
          Pilih satu kata yang{" "}
          <span className="font-semibold text-success">paling mirip</span> dan satu
          yang{" "}
          <span className="font-semibold text-destructive">paling tidak mirip</span>{" "}
          dengan dirimu di lingkungan kerja.
        </p>
        <div className="flex items-center justify-between px-1 text-[11px] font-bold">
          <span className="text-success">Paling mirip</span>
          <span className="text-muted-foreground">Kata</span>
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
                  "flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 transition",
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
                    "flex size-9 shrink-0 items-center justify-center rounded-lg border-2 transition",
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
                    "flex size-9 shrink-0 items-center justify-center rounded-lg border-2 transition",
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
              "Selesai & Lihat Hasil ✨"
            )}
          </Button>
        )}
      </div>
      {!stepDone && (
        <p className="text-[11px] text-muted-foreground text-center">
          Pilih satu <strong>Paling mirip</strong> dan satu <strong>Paling tidak mirip</strong> —
          baris berbeda — untuk lanjut.
        </p>
      )}
    </div>
  );
}
