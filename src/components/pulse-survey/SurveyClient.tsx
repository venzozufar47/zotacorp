"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { submitMonthlyPulse, submitQuarterlyPulse } from "@/lib/actions/pulse-survey.actions";
import { MONTHLY_QUESTIONS, QUARTERLY_QUESTIONS } from "@/lib/pulse-survey/constants";

function RatingRow({
  question,
  value,
  onChange,
}: {
  question: string;
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm">{question}</p>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={
              "flex-1 h-10 rounded-lg border-2 text-sm font-semibold transition " +
              (value === n
                ? "border-foreground bg-primary text-primary-foreground"
                : "border-border bg-card hover:border-primary/50")
            }
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SurveyClient({
  showMonthly,
  showQuarterly,
}: {
  showMonthly: boolean;
  showQuarterly: boolean;
}) {
  const router = useRouter();
  const [monthlyAnswers, setMonthlyAnswers] = useState<(number | null)[]>([null, null, null]);
  const [quarterlyAnswers, setQuarterlyAnswers] = useState<(number | null)[]>(
    QUARTERLY_QUESTIONS.map(() => null)
  );
  const [branch, setBranch] = useState<string>("");
  const [savingMonthly, setSavingMonthly] = useState(false);
  const [savingQuarterly, setSavingQuarterly] = useState(false);
  const [doneMonthly, setDoneMonthly] = useState(false);
  const [doneQuarterly, setDoneQuarterly] = useState(false);

  async function submitMonthly() {
    if (monthlyAnswers.some((a) => a === null)) {
      toast.error("Jawab semua pertanyaan dulu");
      return;
    }
    setSavingMonthly(true);
    try {
      const res = await submitMonthlyPulse({
        answers: monthlyAnswers as [number, number, number],
        branch: (branch as "Pare" | "Semarang") || null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Terima kasih — jawabanmu anonim");
      setDoneMonthly(true);
      router.refresh();
    } finally {
      setSavingMonthly(false);
    }
  }

  async function submitQuarterly() {
    if (quarterlyAnswers.some((a) => a === null)) {
      toast.error("Jawab semua pertanyaan dulu");
      return;
    }
    setSavingQuarterly(true);
    try {
      const res = await submitQuarterlyPulse({
        answers: quarterlyAnswers as number[],
        branch: (branch as "Pare" | "Semarang") || null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Terima kasih — jawabanmu anonim");
      setDoneQuarterly(true);
      router.refresh();
    } finally {
      setSavingQuarterly(false);
    }
  }

  if (!showMonthly && !showQuarterly) {
    return (
      <Card>
        <CardContent className="pt-5 text-sm text-muted-foreground">
          Tidak ada survei yang perlu diisi saat ini. Terima kasih sudah mengisi sebelumnya.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <Label>Cabang (opsional, membantu agregat per cabang)</Label>
        <Select value={branch} onValueChange={(v) => setBranch(v ?? "")}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Tidak terikat cabang" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Pare">Pare</SelectItem>
            <SelectItem value="Semarang">Semarang</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {showMonthly && !doneMonthly && (
        <Card>
          <CardHeader>
            <CardTitle>Survei bulanan (anonim)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              1 = sangat tidak setuju, 5 = sangat setuju. Jawaban ini tidak tersimpan dengan namamu.
            </p>
            {MONTHLY_QUESTIONS.map((q, i) => (
              <RatingRow
                key={q}
                question={q}
                value={monthlyAnswers[i]}
                onChange={(v) =>
                  setMonthlyAnswers((a) => a.map((x, idx) => (idx === i ? v : x)))
                }
              />
            ))}
            <Button onClick={submitMonthly} loading={savingMonthly} className="w-full">
              Kirim
            </Button>
          </CardContent>
        </Card>
      )}

      {showQuarterly && !doneQuarterly && (
        <Card>
          <CardHeader>
            <CardTitle>Survei kuartal (anonim)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Tujuh pertanyaan tambahan sebagai pembanding, sekali per kuartal.
            </p>
            {QUARTERLY_QUESTIONS.map((q, i) => (
              <RatingRow
                key={q.text}
                question={q.text}
                value={quarterlyAnswers[i]}
                onChange={(v) =>
                  setQuarterlyAnswers((a) => a.map((x, idx) => (idx === i ? v : x)))
                }
              />
            ))}
            <Button onClick={submitQuarterly} loading={savingQuarterly} className="w-full">
              Kirim
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
