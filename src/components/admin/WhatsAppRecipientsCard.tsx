"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, Plus, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addWhatsAppRecipient,
  deleteWhatsAppRecipient,
  updateWhatsAppRecipient,
} from "@/lib/actions/whatsapp-recipients.actions";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

interface Recipient {
  id: string;
  label: string;
  phone_e164: string;
}

interface Props {
  initialRecipients: Recipient[];
}

/**
 * Admin-editable recipient list for Fonnte WhatsApp attendance alerts.
 * Phone is stored as E.164 without the leading `+`, but the UI prefixes
 * `+` for readability; the server action normalizes whatever the admin types.
 */
export function WhatsAppRecipientsCard({ initialRecipients }: Props) {
  const router = useRouter();
  const { t } = useTranslation();
  const tw = t.adminWhatsApp;
  const [label, setLabel] = useState("");
  const [phone, setPhone] = useState("");
  const [pending, startTransition] = useTransition();

  function onAdd() {
    if (!phone.trim()) {
      toast.error(tw.emptyPhoneErr);
      return;
    }
    startTransition(async () => {
      const result = await addWhatsAppRecipient({
        label: label.trim(),
        phone: phone.trim(),
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(tw.addedToast);
      setLabel("");
      setPhone("");
      router.refresh();
    });
  }

  function onDelete(r: Recipient) {
    const display = r.label || "+" + r.phone_e164;
    if (!confirm(tw.confirmDelete.replace("{target}", display))) return;
    startTransition(async () => {
      const result = await deleteWhatsAppRecipient(r.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(tw.deletedToast);
      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border-2 border-foreground bg-card shadow-hard p-5 sm:p-6 space-y-5">
      <div className="flex items-start gap-3">
        <div className="size-10 rounded-full border-2 border-foreground flex items-center justify-center flex-shrink-0 bg-quaternary">
          <MessageCircle size={18} strokeWidth={2.5} className="text-foreground" />
        </div>
        <div className="flex-1">
          <h3 className="font-display font-bold text-lg">{tw.title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed font-medium">
            {tw.subtitle}
          </p>
        </div>
      </div>

      {initialRecipients.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">{tw.emptyHint}</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-muted/20 overflow-hidden">
          {initialRecipients.map((r) => (
            <RecipientRow
              key={r.id}
              recipient={r}
              onDelete={() => onDelete(r)}
              disabled={pending}
              onRefresh={() => router.refresh()}
            />
          ))}
        </ul>
      )}

      <div className="grid sm:grid-cols-[1fr_1.5fr_auto] gap-2 pt-1">
        <div className="space-y-1.5">
          <Label htmlFor="wa-label" className="text-xs">
            {tw.labelLabel}
          </Label>
          <Input
            id="wa-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={tw.labelPlaceholder}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wa-phone" className="text-xs">
            {tw.phoneLabel}
          </Label>
          <Input
            id="wa-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={tw.phonePlaceholder}
            inputMode="tel"
          />
        </div>
        <div className="flex items-end">
          <Button onClick={onAdd} disabled={pending} className="w-full sm:w-auto">
            <Plus size={14} className="mr-1.5" />
            {tw.addCta}
          </Button>
        </div>
      </div>
    </section>
  );
}

function RecipientRow({
  recipient,
  onDelete,
  disabled,
  onRefresh,
}: {
  recipient: Recipient;
  onDelete: () => void;
  disabled: boolean;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const tw = t.adminWhatsApp;
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(recipient.label);
  const [phone, setPhone] = useState(`+${recipient.phone_e164}`);
  const [saving, startTransition] = useTransition();

  function onSave() {
    startTransition(async () => {
      const result = await updateWhatsAppRecipient(recipient.id, { label, phone });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(tw.updatedToast);
      setEditing(false);
      onRefresh();
    });
  }

  if (editing) {
    return (
      <li className="px-3 py-2 bg-white">
        <div className="grid sm:grid-cols-[1fr_1.5fr_auto] gap-2">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={tw.labelPlaceholder}
          />
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={tw.phonePlaceholder}
            inputMode="tel"
          />
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditing(false);
                setLabel(recipient.label);
                setPhone(`+${recipient.phone_e164}`);
              }}
              disabled={saving}
            >
              {tw.cancelCta}
            </Button>
            <Button size="sm" onClick={onSave} disabled={saving}>
              {saving ? tw.savingLabel : tw.saveCta}
            </Button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">
          {recipient.label || <span className="text-muted-foreground italic">{tw.noLabel}</span>}
        </div>
        <div className="text-xs text-muted-foreground tabular-nums">
          +{recipient.phone_e164}
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setEditing(true)}
        disabled={disabled || saving}
      >
        {tw.editCta}
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onDelete}
        disabled={disabled || saving}
        className="hover:text-destructive"
        aria-label={tw.ariaDelete}
      >
        <Trash2 size={14} />
      </Button>
    </li>
  );
}
