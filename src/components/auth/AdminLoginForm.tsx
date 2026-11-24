"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { adminSignIn, signOutToAdminLogin } from "@/lib/actions/auth.actions";

/** Form login `/admin/login` — hanya menerima akun dengan peran admin. */
export function AdminLoginForm({ signedInAs }: { signedInAs: string | null }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await adminSignIn(
        String(fd.get("email") ?? ""),
        String(fd.get("password") ?? "")
      );
      if (res.error) {
        setError(res.error);
        setLoading(false);
        return;
      }
      window.location.href = "/admin";
    } catch {
      setError("Terjadi kesalahan. Coba lagi.");
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-2xl">
          Login Admin<span className="text-primary">.</span>
        </CardTitle>
        <CardDescription>Khusus akun admin.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {signedInAs && (
          <div className="text-sm text-amber-800 bg-amber-100 border-2 border-amber-600 rounded-xl px-3 py-2 font-medium space-y-2">
            <p>
              Kamu sedang masuk sebagai <b>{signedInAs}</b>, bukan akun admin.
              Keluar dulu, atau login dengan akun admin di bawah.
            </p>
            <form action={signOutToAdminLogin}>
              <Button type="submit" variant="outline" size="sm">
                Keluar dari akun ini
              </Button>
            </form>
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <PasswordInput
              id="password"
              name="password"
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
            {loading ? "Memproses..." : "Masuk"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
