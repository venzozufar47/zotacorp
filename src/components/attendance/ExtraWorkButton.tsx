"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, ShoppingBag, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  addExtraWorkEntry,
  deleteMyExtraWorkEntry,
  EXTRA_WORK_KINDS,
} from "@/lib/actions/extra-work.actions";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

interface TodayEntry {
  id: string;
  kind: string;
  created_at: string;
}

interface Props {
  todayEntries: TodayEntry[];
}

/**
 * Compact opt-in button that lives under the check-in/out card on the
 * employee dashboard. Only mounted by the parent when
 * `profile.extra_work_enabled` is true, so this component itself doesn't
 * have to know about the feature flag.
 *
 * Pattern is "primary action + collapsible list":
 *  - The button shows today's entry count as a badge.
 *  - Tap → dialog with a kind dropdown ("Belanja" for now) + Submit.
 *  - Existing entries are listed inside the dialog with a per-entry
 *    delete affordance, so a mistaken add can be undone immediately.
 */
export function ExtraWorkButton({ todayEntries }: Props) {
  const router = useRouter();
  const { t } = useTranslation();
  const tx = t.extraWork;
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<string>(EXTRA_WORK_KINDS[0]);
  const [pending, startTransition] = useTransition();

  function onSubmit() {
    startTransition(async () => {
      const result = await addExtraWorkEntry(kind);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(tx.addedToast);
      router.refresh();
    });
  }

  function onDelete(id: string) {
    if (!confirm(tx.deleteConfirm)) return;
    startTransition(async () => {
      const result = await deleteMyExtraWorkEntry(id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(tx.deletedToast);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 h-10 rounded-xl border border-dashed border-foreground/15 text-sm text-muted-foreground hover:text-foreground hover:bg-[#f5f5f7] transition-colors"
      >
        <Plus size={14} />
        {tx.openCta}
        {todayEntries.length > 0 && (
          <span
            className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[11px] font-semibold px-1.5"
            style={{ background: "var(--accent)", color: "var(--primary)" }}
          >
            {todayEntries.length}
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{tx.dialogTitle}</DialogTitle>
            <DialogDescription>{tx.dialogSubtitle}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ew-kind" className="text-xs">
                {tx.kindLabel}
              </Label>
              <Select value={kind} onValueChange={(v) => v && setKind(v)}>
                <SelectTrigger id="ew-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXTRA_WORK_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {tx.kindLabels[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {todayEntries.length > 0 && (
              <div className="space-y-1 pt-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {tx.todayHeading}
                </p>
                <ul className="space-y-1 max-h-40 overflow-y-auto">
                  {todayEntries.map((e) => (
                    <li
                      key={e.id}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/30"
                    >
                      <ShoppingBag size={14} className="text-muted-foreground" />
                      <span className="text-sm flex-1">
                        {tx.kindLabels[e.kind as keyof typeof tx.kindLabels] ?? e.kind}
                      </span>
                      <button
                        type="button"
                        onClick={() => onDelete(e.id)}
                        disabled={pending}
                        className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                        aria-label={tx.deleteAria}
                      >
                        <Trash2 size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              {tx.close}
            </Button>
            <Button onClick={onSubmit} disabled={pending}>
              {pending ? tx.adding : tx.addCta}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
