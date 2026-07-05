"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
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
    // Recovery link pakai implicit flow (#access_token=...&refresh_token=...).
    // Browser client default PKCE (cari ?code=), jadi set sesi manual dari
    // hash. Tangkap hash sinkron dulu sebelum di-strip.
    const rawHash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : "";
    const supabase = createClient();
    let active = true;

    (async () => {
      const params = new URLSearchParams(rawHash);
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      const errDesc = params.get("error_description");

      if (errDesc) {
        if (active) {
          setAuthorized(false);
          setChecking(false);
        }
        return;
      }
      if (accessToken && refreshToken) {
        const { error: sessErr } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        window.history.replaceState(null, "", window.location.pathname);
        if (active) {
          setAuthorized(!sessErr);
          setChecking(false);
        }
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (active) {
        setAuthorized(!!data.session);
        setChecking(false);
      }
    })();

    return () => {
      active = false;
    };
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
      // Konfirmasi password BENAR-BENAR tersimpan: autentikasi ulang dengan
      // password baru. Ini jadi sumber kebenaran "tersimpan" — kalau gagal,
      // kita surface error eksplisit alih-alih menyatakan sukses palsu.
      // Sekaligus mencegah karyawan terkunci di check-in (yang juga re-auth
      // pakai signInWithPassword).
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.email) {
        const { error: verifyErr } = await supabase.auth.signInWithPassword({
          email: user.email,
          password,
        });
        if (verifyErr) {
          setError(t.resetPassword.errNotPersisted);
          setLoading(false);
          return;
        }
      }
      setDone(true);
      // Sign out the recovery session so the next login uses the new password
      // on a clean slate, then bounce to / (auth landing) after a short beat
      // so the success message is visible.
      await supabase.auth.signOut();
      setTimeout(() => router.replace("/"), 1600);
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
            href="/"
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
            <PasswordInput
              id="password"
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
            <PasswordInput
              id="confirm"
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
            {loading ? t.resetPassword.verifying : t.resetPassword.submit}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
