"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

/**
 * Reset-password landing page.
 *
 * Users get here from the Resend email's CTA. Supabase verifies the recovery
 * token on the `/auth/v1/verify` hop and then redirects here with a temporary
 * session attached — at that point `supabase.auth.updateUser({ password })`
 * is enough to rotate the password.
 *
 * We still run a `getSession()` gate on mount so users who arrive without a
 * recovery session (link expired, manual URL visit, etc.) see an explicit
 * "link expired" state rather than a silently-broken form.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    // On recovery links Supabase emits a PASSWORD_RECOVERY event once the
    // hash fragment has been consumed. We listen once and also probe the
    // current session so both "already landed" and "just landed" work.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setAuthorized(true);
        setChecking(false);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setAuthorized(true);
      }
      setChecking(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError(t.resetPassword.errTooShort);
      return;
    }
    if (password !== confirm) {
      setError(t.resetPassword.errMismatch);
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        setLoading(false);
        return;
      }
      setDone(true);
      // Sign out the recovery session so the next login uses the new password
      // on a clean slate, then bounce to /login after a short beat so the
      // success message is visible.
      await supabase.auth.signOut();
      setTimeout(() => router.replace("/login"), 1600);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.resetPassword.errGeneric);
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          {t.resetPassword.checking}
        </CardContent>
      </Card>
    );
  }

  if (!authorized) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xl">{t.resetPassword.expiredTitle}</CardTitle>
          <CardDescription>{t.resetPassword.expiredBody}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/login"
            className="inline-flex items-center justify-center w-full h-11 rounded-full border-2 border-foreground bg-primary text-primary-foreground font-display font-bold text-sm shadow-hard hover:-translate-y-0.5 hover:shadow-hard-hover transition-all"
          >
            {t.resetPassword.backToLogin}
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (done) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xl">{t.resetPassword.successTitle}</CardTitle>
          <CardDescription>{t.resetPassword.successBody}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="shadow-md border-0">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl">{t.resetPassword.title}</CardTitle>
        <CardDescription>{t.resetPassword.subtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="password">{t.resetPassword.newPassword}</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              minLength={8}
              required
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">{t.resetPassword.confirmPassword}</Label>
            <Input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              minLength={8}
              required
              autoComplete="new-password"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 border-2 border-destructive rounded-xl px-3 py-2 font-medium">
              {error}
            </p>
          )}

          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? t.resetPassword.submitting : t.resetPassword.submit}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
