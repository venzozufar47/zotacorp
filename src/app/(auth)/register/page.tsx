"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

export default function RegisterPage() {
  const { t } = useTranslation();
  const tr = t.register;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<"employee" | "admin">("employee");
  const [adminTaken, setAdminTaken] = useState(false);

  useEffect(() => {
    fetch("/api/admin/exists")
      .then((r) => r.json())
      .then((d: { exists: boolean }) => {
        if (d.exists) {
          setAdminTaken(true);
          setRole("employee");
        }
      })
      .catch(() => setAdminTaken(false));
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const fullName = formData.get("full_name") as string;

    try {
      // Step 1: create user + profile entirely server-side (no Supabase email sent)
      const res = await fetch("/api/profile/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          full_name: fullName,
          role,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? tr.errFailed);
        setLoading(false);
        return;
      }

      // Step 2: sign in (user is already confirmed, no email verification needed)
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(signInError.message);
        setLoading(false);
        return;
      }

      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : tr.errGeneric);
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-2xl">
          {tr.title}
          <span className="text-primary">.</span>
        </CardTitle>
        <CardDescription>{tr.subtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="full_name">{tr.fullNameLabel}</Label>
            <Input
              id="full_name"
              name="full_name"
              type="text"
              placeholder={tr.fullNamePlaceholder}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">{tr.emailLabel}</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder={tr.emailPlaceholder}
              required
              autoComplete="email"
            />
          </div>

          <div className="space-y-2">
            <Label>{tr.roleLabel}</Label>
            <Select value={role} onValueChange={(v) => setRole(v as "employee" | "admin")}>
              <SelectTrigger>
                <SelectValue placeholder={tr.rolePlaceholder} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="employee">{tr.roleEmployee}</SelectItem>
                {!adminTaken && <SelectItem value="admin">{tr.roleAdmin}</SelectItem>}
              </SelectContent>
            </Select>
            {adminTaken && (
              <p className="text-xs text-muted-foreground">{tr.adminTakenHint}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">{tr.passwordLabel}</Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder={tr.passwordPlaceholder}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 border-2 border-destructive rounded-xl px-3 py-2 font-medium">
              {error}
            </p>
          )}

          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? tr.submitting : tr.submit}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-5 font-medium">
          {tr.alreadyHave}{" "}
          <Link href="/login" className="font-display font-bold text-primary hover:underline underline-offset-4">
            {tr.loginCta}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
