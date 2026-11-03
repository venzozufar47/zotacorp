export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Star } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/cached";
import { getMyCustomerFeedback } from "@/lib/actions/employee-feedback.actions";
import { ASPECT_LABEL } from "@/lib/feedback/constants";
import { Card, CardContent } from "@/components/ui/card";

export default async function EmployeeFeedbackPage() {
  if (!(await getCurrentUser())) redirect("/");
  const result = await getMyCustomerFeedback();
  const summaries = result.ok ? result.data ?? [] : [];

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <header className="flex items-center gap-3">
        <Link href="/dashboard" aria-label="Kembali ke beranda" className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-border hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <ArrowLeft size={20} aria-hidden />
        </Link>
        <div>
          <h1 className="font-display text-lg font-semibold">Feedback pelanggan</h1>
          <p className="text-xs text-muted-foreground">Cabangmu · 30 hari terakhir</p>
        </div>
      </header>

      {!result.ok ? (
        <p role="alert" className="rounded-xl border border-border p-4 text-sm">{result.error}</p>
      ) : summaries.length === 0 ? (
        <p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">Cabang kerjamu belum terhubung. Hubungi admin untuk mengatur penugasan cabang.</p>
      ) : summaries.map((summary) => (
        <section key={summary.branch} className="space-y-4" aria-label={`Feedback ${summary.branch}`}>
          <Card className="py-0">
            <CardContent className="space-y-4 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">{summary.branch}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">{summary.count} ulasan</p>
                </div>
                <div className="flex items-center gap-1.5" aria-label={`Rating ${summary.average?.toFixed(2) ?? "belum tersedia"} dari 5`}>
                  <Star size={20} aria-hidden className="fill-primary text-primary" />
                  <span className="text-2xl font-semibold tabular-nums">{summary.average?.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? "—"}</span>
                  <span className="text-sm text-muted-foreground">/ 5</span>
                </div>
              </div>
              {summary.topAspects.length > 0 ? (
                <div className="border-t border-border pt-3">
                  <h3 className="mb-2 text-xs font-semibold text-muted-foreground">Yang perlu diperhatikan</h3>
                  <ul className="space-y-2 text-sm">
                    {summary.topAspects.map((aspect) => (
                      <li key={aspect.key} className="flex justify-between gap-3">
                        <span>{ASPECT_LABEL[aspect.key] ?? aspect.key}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{aspect.count} pelanggan</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : summary.count > 0 ? <p className="border-t border-border pt-3 text-sm text-muted-foreground">Belum ada aspek perbaikan yang dipilih pelanggan.</p> : null}
            </CardContent>
          </Card>

          <div>
            <h3 className="mb-1 text-sm font-semibold">Ulasan terbaru</h3>
            {summary.recent.length === 0 ? <p className="py-3 text-sm text-muted-foreground">Belum ada feedback dalam 30 hari terakhir.</p> : (
              <ul className="divide-y divide-border">
                {summary.recent.map((row) => (
                  <li key={row.id} className="space-y-2 py-4 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 font-semibold"><Star size={14} aria-hidden className="text-primary" />{row.rating}<span className="font-normal text-muted-foreground">/ 5</span></span>
                      <time dateTime={row.created_at} className="text-xs text-muted-foreground">{new Date(row.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" })}</time>
                    </div>
                    {row.comment && <p className="whitespace-pre-wrap break-words leading-relaxed">{row.comment}</p>}
                    {(row.aspects ?? []).length > 0 && <p className="text-xs leading-relaxed text-muted-foreground">{(row.aspects ?? []).map((key) => ASPECT_LABEL[key] ?? key).join(" · ")}</p>}
                    {row.product_wish && <p className="break-words text-sm leading-relaxed"><span className="text-muted-foreground">Usulan produk: </span>{row.product_wish}</p>}
                  </li>
                ))}
              </ul>
            )}
            {summary.count > 10 && <p className="text-xs text-muted-foreground">Menampilkan 10 ulasan terbaru.</p>}
          </div>
        </section>
      ))}
    </div>
  );
}
