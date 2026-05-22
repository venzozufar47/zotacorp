"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Send, Trash2, X } from "lucide-react";
import {
  listMetricComments,
  postMetricComment,
  deleteMetricComment,
  type MetricComment,
} from "@/lib/actions/investor-comments.actions";

interface Props {
  businessUnit: string;
  metricId: string;
  metricLabel: string;
  open: boolean;
  onClose: () => void;
  currentUserId: string;
  isAdmin?: boolean;
}

/**
 * Slide-in sheet untuk thread komentar per (BU, metric). Investor +
 * admin share view. Reply input di-bawah; admin bisa delete row.
 */
export function MetricCommentSheet({
  businessUnit,
  metricId,
  metricLabel,
  open,
  onClose,
  currentUserId,
  isAdmin = false,
}: Props) {
  const [comments, setComments] = useState<MetricComment[]>([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    listMetricComments({ businessUnit, metricId })
      .then((rows) => {
        if (cancelled) return;
        setComments(rows);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, businessUnit, metricId]);

  if (!open) return null;

  function handleSend() {
    if (!body.trim()) return;
    startTransition(async () => {
      const res = await postMetricComment({
        businessUnit,
        metricId,
        body,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setComments((prev) => [...prev, res.data!]);
      setBody("");
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const res = await deleteMetricComment(id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setComments((prev) => prev.filter((c) => c.id !== id));
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-foreground/30"
      onClick={onClose}
    >
      <aside
        className="w-full max-w-md h-full bg-card border-l border-border flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 p-5 border-b border-border">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.16em] font-semibold text-muted-foreground">
              Diskusi metric
            </p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">
              {metricLabel}
            </h2>
            <p className="mt-1 text-[11.5px] text-muted-foreground">
              {businessUnit} · thread di-share antar investor BU ini
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="size-8 inline-flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Memuat komentar…
            </p>
          ) : comments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Belum ada komentar. Mulai diskusi tentang metric ini.
            </p>
          ) : (
            comments.map((c) => (
              <div
                key={c.id}
                className={`rounded-xl p-3 ${
                  c.authorRole === "admin"
                    ? "bg-accent border border-primary/25"
                    : "bg-muted/40 border border-border"
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-semibold text-foreground">
                    {c.authorName ?? "—"}
                    <span
                      className={`ml-1.5 text-[10px] uppercase tracking-wider font-bold ${
                        c.authorRole === "admin"
                          ? "text-primary"
                          : "text-muted-foreground"
                      }`}
                    >
                      {c.authorRole === "admin" ? "Admin" : "Investor"}
                    </span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(c.createdAt).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {(c.authorId === currentUserId || isAdmin) && (
                      <button
                        type="button"
                        onClick={() => handleDelete(c.id)}
                        className="size-5 inline-flex items-center justify-center rounded text-muted-foreground hover:text-destructive"
                        aria-label="Hapus komentar"
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                  {c.body}
                </p>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-border p-3 flex items-end gap-2 bg-card">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={`Tulis tentang ${metricLabel.toLowerCase()}…`}
            rows={2}
            className="flex-1 rounded-lg border border-border bg-background p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={pending || !body.trim()}
            className="h-10 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {pending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Send size={14} />
            )}
            Kirim
          </button>
        </div>
      </aside>
    </div>
  );
}
