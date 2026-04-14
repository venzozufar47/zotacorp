"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LockKeyhole } from "lucide-react";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

interface PasswordConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: "check-in" | "check-out";
  onConfirm: () => Promise<void>;
}

export function PasswordConfirmModal({
  open,
  onOpenChange,
  action,
  onConfirm,
}: PasswordConfirmModalProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { t } = useTranslation();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();

    // Get current user's email for re-auth
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) {
      setError(t.passwordConfirm.sessionExpired);
      setLoading(false);
      return;
    }

    // Re-authenticate to verify identity
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password,
    });

    if (authError) {
      setError(t.passwordConfirm.wrongPassword);
      setLoading(false);
      return;
    }

    // Password verified — execute the attendance action
    await onConfirm();

    setPassword("");
    setError(null);
    onOpenChange(false);
    setLoading(false);
  }

  function handleOpenChange(open: boolean) {
    if (!loading) {
      setPassword("");
      setError(null);
      onOpenChange(open);
    }
  }

  const isCheckIn = action === "check-in";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: "var(--accent)" }}
            >
              <LockKeyhole
                size={18}
                style={{ color: "var(--primary)" }}
              />
            </div>
            <DialogTitle className="text-lg">
              {isCheckIn ? t.passwordConfirm.confirmCheckIn : t.passwordConfirm.confirmCheckOut}
            </DialogTitle>
          </div>
          <DialogDescription>
            {t.passwordConfirm.description.replace(
              "{action}",
              isCheckIn ? t.passwordConfirm.actionCheckIn : t.passwordConfirm.actionCheckOut
            )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">{t.passwordConfirm.passwordLabel}</Label>
            <Input
              id="confirm-password"
              type="password"
              placeholder={t.passwordConfirm.passwordPlaceholder}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive bg-destructive/8 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => handleOpenChange(false)}
              disabled={loading}
            >
              {t.passwordConfirm.cancel}
            </Button>
            <Button
              type="submit"
              className="flex-1"
              style={{ background: "var(--primary)" }}
              disabled={loading || !password}
            >
              {loading
                ? t.passwordConfirm.verifying
                : isCheckIn
                ? t.passwordConfirm.submitCheckIn
                : t.passwordConfirm.submitCheckOut}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
