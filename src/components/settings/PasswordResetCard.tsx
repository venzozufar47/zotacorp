"use client";

import { useState } from "react";
import { KeyRound, Mail, CheckCircle2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { toast } from "sonner";

/**
 * Password-reset card for /settings.
 *
 * The button triggers a POST to /api/auth/request-password-reset, which
 * authenticates the current session, mints a Supabase recovery link, and
 * sends it via Resend. We show a persistent "sent to j***e@zotacorp.com"
 * confirmation below the button so the user knows where to look instead of
 * a transient toast that disappears before they open their inbox.
 */
export function PasswordResetCard() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function handleSend() {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/request-password-reset", {
        method: "POST",
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        email?: string;
        error?: string;
      };

      if (!res.ok || !body.ok) {
        toast.error(body.error || t.passwordReset.errGeneric);
        return;
      }

      setSentTo(body.email ?? null);
      toast.success(t.passwordReset.toastSuccess);
    } catch {
      toast.error(t.passwordReset.errGeneric);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound size={18} />
          {t.passwordReset.title}
        </CardTitle>
        <CardDescription>{t.passwordReset.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button
          type="button"
          onClick={handleSend}
          disabled={loading}
          className="w-full sm:w-auto"
          style={{ background: "var(--primary)" }}
        >
          <Mail size={16} className="mr-2" />
          {loading ? t.passwordReset.sending : t.passwordReset.send}
        </Button>

        {sentTo && (
          <div
            className="flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5 text-sm text-foreground"
            role="status"
            aria-live="polite"
          >
            <CheckCircle2
              size={16}
              className="mt-0.5 shrink-0"
              style={{ color: "var(--primary)" }}
            />
            <div className="leading-relaxed">
              <div>
                {t.passwordReset.sentTo}{" "}
                <span className="font-semibold">{sentTo}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {t.passwordReset.checkInbox}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
