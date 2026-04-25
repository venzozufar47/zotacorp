"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, RotateCcw, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  updateWaTemplate,
  resetWaTemplate,
} from "@/lib/actions/wa-templates.actions";
import type {
  PlaceholderInfo,
  TemplateKey,
} from "@/lib/whatsapp/templates";
import { interpolate } from "@/lib/whatsapp/templates";

interface TemplateRow {
  key: TemplateKey;
  label: string;
  description: string;
  recipient: string;
  placeholders: PlaceholderInfo[];
  defaultBody: string;
  body: string;
  isCustomized: boolean;
  updatedAt: string | null;
}

interface Props {
  initialTemplates: TemplateRow[];
}

export function WaTemplatesCard({ initialTemplates }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center size-8 rounded-full border-2 border-foreground bg-pop-emerald text-primary-foreground">
            <MessageSquare size={16} strokeWidth={2.5} />
          </span>
          Whatsapp templates
        </CardTitle>
        <CardDescription>
          Edit teks pesan WhatsApp yang dikirim otomatis oleh sistem. Semua
          pesan selalu dikirim dalam Bahasa Indonesia. Placeholder seperti{" "}
          <code className="text-[11px] px-1 py-0.5 rounded bg-muted">
            {"{name}"}
          </code>{" "}
          akan otomatis diganti dengan data aktual saat dikirim.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {initialTemplates.map((tpl) => (
          <TemplateEditor key={tpl.key} template={tpl} />
        ))}
      </CardContent>
    </Card>
  );
}

function TemplateEditor({ template }: { template: TemplateRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState(template.body);
  const [pending, startTransition] = useTransition();

  const trimmed = body.trim();
  const changed = trimmed !== template.body.trim();
  const canSave = trimmed.length > 0 && trimmed.length <= 2000 && changed && !pending;

  const sampleVars = useMemo(() => sampleValuesFor(template.key), [template.key]);
  const preview = useMemo(
    () => interpolate(body || template.defaultBody, sampleVars),
    [body, template.defaultBody, sampleVars]
  );

  function handleSave() {
    if (!canSave) return;
    startTransition(async () => {
      const res = await updateWaTemplate(template.key, trimmed);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Template disimpan");
      router.refresh();
    });
  }

  function handleReset() {
    if (pending) return;
    startTransition(async () => {
      const res = await resetWaTemplate(template.key);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setBody(template.defaultBody);
      toast.success("Dikembalikan ke default");
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-accent/30 transition rounded-2xl"
      >
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display font-semibold text-sm text-foreground">
              {template.label}
            </span>
            {template.isCustomized ? (
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                Kustom
              </span>
            ) : (
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                Default
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground leading-snug line-clamp-2">
            {template.description}
          </p>
        </div>
        <ChevronDown
          size={18}
          className={cn(
            "shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div className="border-t border-border p-4 space-y-3">
          <div className="text-xs text-muted-foreground space-y-1">
            <p>
              <span className="font-semibold text-foreground">Dikirim ke:</span>{" "}
              {template.recipient}
            </p>
            {template.placeholders.length > 0 && (
              <div>
                <p className="font-semibold text-foreground mb-1">
                  Placeholder:
                </p>
                <ul className="space-y-0.5 ml-3">
                  {template.placeholders.map((p) => (
                    <li key={p.key}>
                      <code className="text-[11px] px-1 py-0.5 rounded bg-muted text-foreground">
                        {"{" + p.key + "}"}
                      </code>{" "}
                      — {p.description}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">
              Teks pesan
            </label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, 2000))}
              rows={5}
              className="font-mono text-xs leading-relaxed"
              placeholder={template.defaultBody}
            />
            <p className="text-[10px] text-muted-foreground tabular-nums">
              {body.length} / 2000
            </p>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-foreground">Preview</p>
            <div className="rounded-xl border border-border bg-muted/40 p-3 text-xs leading-relaxed whitespace-pre-wrap break-words">
              {preview || (
                <span className="text-muted-foreground italic">(kosong)</span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleReset}
              disabled={pending || !template.isCustomized}
              className="text-xs gap-1.5"
            >
              <RotateCcw size={12} />
              Reset ke default
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={!canSave}
            >
              {pending ? "Menyimpan…" : changed ? "Simpan" : "Tersimpan"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Realistic sample variable values used to render the preview. Kept in
 * sync with the placeholder keys declared in TEMPLATE_DEFAULTS.
 */
function sampleValuesFor(
  key: TemplateKey
): Record<string, string | number> {
  switch (key) {
    case "celebration_birthday_morning":
      return { name: "Arifin" };
    case "celebration_anniversary_morning":
      return { name: "Arifin", years: 3 };
    case "celebration_greeting_notification":
      return {
        celebrantName: "Arifin",
        authorName: "Venzo",
        eventKind: "ulang tahun",
      };
    case "celebration_birthday_broadcast":
      return {
        recipientName: "Boles",
        celebrantNames: "Arifin",
        count: 1,
      };
    case "streak_milestone":
      return { name: "Arifin", days: 10 };
    case "attendance_check_in_alert":
      return {
        fullName: "Muhammad Abdul Arifin",
        time: "09:02",
        location: "Kantor Pusat",
        note: "",
        mapsUrl: "",
      };
    case "attendance_check_out_alert":
      return {
        fullName: "Muhammad Abdul Arifin",
        time: "18:01",
        location: "Kantor Pusat",
        note: "",
        mapsUrl: "",
      };
  }
}
