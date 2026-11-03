import { Star } from "lucide-react";
import type { EmployeeFeedbackSummary } from "@/lib/actions/employee-feedback.actions";
import { ASPECT_LABEL } from "@/lib/feedback/constants";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function FeedbackSummary({ summary, landscape = false, sidebarHeader }: { summary: EmployeeFeedbackSummary; landscape?: boolean; sidebarHeader?: ReactNode }) {
  return (
    <section key={summary.branch} className={cn("space-y-4", landscape && "md:grid md:grid-cols-[minmax(15rem,1fr)_minmax(0,2fr)] md:items-start md:gap-6 md:space-y-0")} aria-label={`Feedback ${summary.branch}`}>
      <div className={cn("min-w-0 space-y-4", landscape && "md:sticky md:top-4 md:self-start [@media(max-height:550px)]:static")}>
      {sidebarHeader}
      <Card className="min-w-0 py-0">
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
          <dl className="grid grid-cols-2 gap-3 border-t border-border pt-3">
            <div><dt className="text-xs text-muted-foreground">Ulasan tertulis</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{summary.commentCount}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Usulan produk</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{summary.productWishCount}</dd></div>
          </dl>
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
      </div>

      <div className="min-w-0 space-y-4">
      <div className={cn(landscape && "md:rounded-2xl md:border md:border-border md:bg-card md:p-4")}>
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
              </li>
            ))}
          </ul>
        )}
        {summary.count > 10 && <p className="text-xs text-muted-foreground">Menampilkan 10 ulasan terbaru.</p>}
      </div>
      <section className="rounded-2xl border border-border bg-card p-4" aria-label="Usulan produk baru">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Usulan produk baru</h3>
          <span className="text-xs text-muted-foreground">{summary.productWishCount} usulan · 30 hari</span>
        </div>
        {summary.productWishes.length === 0 ? <p className="text-sm text-muted-foreground">Belum ada usulan produk.</p> : (
          <ul className="divide-y divide-border">
            {summary.productWishes.map((wish) => (
              <li key={wish.text} className="flex items-start justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 break-words leading-relaxed">{wish.text}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      </div>
    </section>
  );
}
