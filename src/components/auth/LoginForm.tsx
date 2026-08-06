"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

/**
 * Auth landing form. Mounted on `/` (the new root) so anonymous
 * visitors don't pay an extra `/` → `/login` redirect. The legacy
 * `/login` route 308-redirects here for back-compat.
 */
export function LoginForm() {
  const { t } = useTranslation();
  const tl = t.login;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);

  // Investor invite / password-recovery links dari Supabase mendarat di "/"
  // dengan token di URL hash (mis. #access_token=...&type=invite) karena
  // Site URL = root. Teruskan ke halaman yang benar (buat password / reset)
  // dengan hash dipertahankan, alih-alih membiarkan investor terdampar di
  // form login.
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash || !hash.includes("access_token")) return;
    const type = new URLSearchParams(hash.slice(1)).get("type");
    if (type === "invite" || type === "signup") {
      window.location.replace("/set-password" + hash);
    } else if (type === "recovery") {
      window.location.replace("/reset-password" + hash);
    }
  }, []);
  // Banner notice dari middleware (mis. force-logout karena akun
  // dinonaktifkan/resign). Tampil di atas form sampai user submit.
  const searchParams = useSearchParams();
  const noticeKey = searchParams.get("error");
  const notice =
    noticeKey === "account-deactivated"
      ? "Akun kamu sudah dinonaktifkan oleh admin. Hubungi admin kalau ini salah."
      : noticeKey === "pending-activation"
        ? "Akun kamu belum diaktifkan oleh admin. Hubungi admin untuk aktivasi, lalu coba login lagi."
        : null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        setLoading(false);
        return;
      }

      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : tl.errGeneric);
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-2xl">
          {tl.title}
          <span className="text-primary">.</span>
        </CardTitle>
        <CardDescription>{tl.subtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        {forgotOpen ? (
          <ForgotPanel tl={tl} onBack={() => setForgotOpen(false)} />
        ) : (
        <>
        {notice && !error && (
          <p className="text-sm text-amber-800 bg-amber-100 border-2 border-amber-600 rounded-xl px-3 py-2 font-medium mb-4">
            {notice}
          </p>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">{tl.emailLabel}</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder={tl.emailPlaceholder}
              required
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{tl.passwordLabel}</Label>
            <PasswordInput
              id="password"
              name="password"
              placeholder={tl.passwordPlaceholder}
              required
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 border-2 border-destructive rounded-xl px-3 py-2 font-medium">
              {error}
            </p>
          )}

          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? tl.submitting : tl.submit}
          </Button>
        </form>

        {/* Pintu masuk "lupa password". Ditaruh tepat di bawah tombol
            masuk karena di situlah orang berada saat password-nya
            ditolak — bukan di footer bersama tautan pendaftaran. */}
        <div className="text-center mt-3">
          <button
            type="button"
            onClick={() => setForgotOpen(true)}
            className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            {tl.forgotCta}
          </button>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-5 font-medium">
          {tl.noAccount}{" "}
          <Link href="/register" className="font-display font-bold text-primary hover:underline underline-offset-4">
            {tl.registerCta}
          </Link>
        </p>
        <p className="text-center text-[11px] text-muted-foreground mt-1">
          {tl.investorPrompt}{" "}
          <Link
            href="/register-investor"
            className="underline underline-offset-2"
          >
            {tl.investorCta}
          </Link>
        </p>
        </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Form "lupa password" anonim.
 *
 * Sengaja TIDAK memberi tahu apakah emailnya terdaftar — pesan sukses
 * dari server selalu sama persis untuk email dikenal maupun tidak.
 * Menampilkan "email tidak ditemukan" akan mengubah halaman login jadi
 * alat memeriksa siapa saja yang punya akun di sini.
 */
function ForgotPanel({
  tl,
  onBack,
}: {
  tl: ReturnType<typeof useTranslation>["t"]["login"];
  onBack: () => void;
}) {
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSending(true);
    setErr(null);
    const email = new FormData(e.currentTarget).get("email") as string;
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) {
        setErr(json.error ?? tl.errGeneric);
        return;
      }
      setDone(json.message ?? tl.forgotSubmit);
    } catch {
      setErr(tl.errGeneric);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="font-display text-lg font-bold">{tl.forgotTitle}</h2>
        <p className="text-sm text-muted-foreground">{tl.forgotDesc}</p>
      </div>

      {done ? (
        <p className="text-sm bg-pop-emerald/15 border-2 border-foreground rounded-xl px-3 py-2 font-medium">
          {done}
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="forgot-email">{tl.emailLabel}</Label>
            <Input
              id="forgot-email"
              name="email"
              type="email"
              placeholder={tl.emailPlaceholder}
              required
              autoComplete="email"
            />
          </div>
          {err && (
            <p className="text-sm text-destructive bg-destructive/10 border-2 border-destructive rounded-xl px-3 py-2 font-medium">
              {err}
            </p>
          )}
          <Button type="submit" size="lg" className="w-full" disabled={sending}>
            {sending ? tl.forgotSubmitting : tl.forgotSubmit}
          </Button>
        </form>
      )}

      <button
        type="button"
        onClick={onBack}
        className="block w-full text-center text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
      >
        {tl.forgotBack}
      </button>
    </div>
  );
}
