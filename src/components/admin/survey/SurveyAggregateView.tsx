import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PulseAggregate } from "@/lib/actions/pulse-survey.actions";

export function SurveyAggregateView({ title, aggregate }: { title: string; aggregate: PulseAggregate }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {title} — {aggregate.period}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">{aggregate.respondentCount} responden</p>
        {!aggregate.enoughRespondents ? (
          <p className="text-sm text-muted-foreground">
            Belum ditampilkan — minimal 4 responden untuk menjaga anonimitas (SOP 3.12).
          </p>
        ) : (
          <>
            {aggregate.anyLow && (
              <div className="flex items-start gap-2 rounded-xl border-2 border-warning/60 bg-warning/10 px-3 py-2.5 text-sm">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" />
                <div>
                  <p className="font-semibold">Rata-rata di bawah 3,5 — bukan sanksi</p>
                  <p className="text-xs text-muted-foreground">
                    Dengar penyebabnya, lalu buat rencana perbaikan dalam 14 hari.{" "}
                    <Link href="/notulen" className="underline font-semibold">
                      Catat di notulen
                    </Link>
                  </p>
                </div>
              </div>
            )}
            <div className="space-y-2">
              {aggregate.averages.map((a) => (
                <div key={a.label} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex-1 min-w-0">{a.label}</span>
                  <span
                    className={`font-display font-extrabold tabular-nums ${
                      a.low ? "text-destructive" : "text-success"
                    }`}
                  >
                    {a.average.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
