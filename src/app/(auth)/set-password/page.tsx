"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
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

/**
 * Set-password landing for invited investors.
 *
 * Investors arrive here from the Resend invite email's CTA. Supabase
 * verifies the invite token on `/auth/v1/verify` then redirects here with
 * a temporary session attached — at that point `updateUser({ password })`
 * sets their first password. On success we keep them signed in and send
 * them straight to /investor (pending state until admin assigns a BU),
 * unlike the reset-password page which signs out.
 *
 * A `getSession()` gate handles expired/invalid links with an explicit
 * "link kedaluwarsa" state instead of a broken form.
 */
export default function SetPasswordPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    // Invite links emit SIGNED_IN (or PASSWORD_RECOVERY) once the hash
    // fragment is consumed. Listen once and also probe the session so
    // both "just landed" and "already landed" work.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "PASSWORD_RECOVERY") {
        setAuthorized(true);
        setChecking(false);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setAuthorized(true);
      setChecking(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password minimal 8 karakter.");
      return;
    }
    if (password !== confirm) {
      setError("Konfirmasi password tidak cocok.");
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
      // Sign out lalu arahkan ke halaman login supaya investor masuk dengan
      // password baru yang baru saja dibuat.
      await supabase.auth.signOut();
      setTimeout(() => router.replace("/"), 1600);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Terjadi kesalahan. Coba lagi."
      );
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Memeriksa undangan…
        </CardContent>
      </Card>
    );
  }

  if (!authorized) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xl">Link undangan tidak valid</CardTitle>
          <CardDescription>
            Link undangan sudah kedaluwarsa atau sudah dipakai. Minta admin
            mengirim ulang undangan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/"
            className="inline-flex items-center justify-center w-full h-11 rounded-full border-2 border-foreground bg-primary text-primary-foreground font-display font-bold text-sm shadow-hard hover:-translate-y-0.5 hover:shadow-hard-hover transition-all"
          >
            Ke halaman login
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (done) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xl">Password berhasil dibuat 🎉</CardTitle>
          <CardDescription>
            Mengarahkan ke halaman login — silakan masuk dengan password baru
            Anda.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="shadow-md border-0">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl">Selamat datang di Zota Corp</CardTitle>
        <CardDescription>
          Buat password untuk mengaktifkan akun investor Anda.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="password">Password baru</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                minLength={8}
                required
                autoComplete="new-password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
                aria-label={showPw ? "Sembunyikan password" : "Lihat password"}
                tabIndex={-1}
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">Konfirmasi password</Label>
            <div className="relative">
              <Input
                id="confirm"
                type={showPw ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                minLength={8}
                required
                autoComplete="new-password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
                aria-label={showPw ? "Sembunyikan password" : "Lihat password"}
                tabIndex={-1}
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 border-2 border-destructive rounded-xl px-3 py-2 font-medium">
              {error}
            </p>
          )}

          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? "Menyimpan…" : "Buat password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
