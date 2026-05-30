"use client";

import { useState } from "react";
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
import { TrendingUp } from "lucide-react";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

/**
 * Halaman registrasi khusus investor — terpisah dari /register
 * employee/admin. Submit ke /api/profile/create-investor; setelah
 * sukses sign in, middleware mengarahkan ke /investor (dashboard
 * dengan state "menunggu admin assignment").
 */
export default function RegisterInvestorPage() {
  const { t } = useTranslation();
  const tl = t.registerInvestor;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const fullName = formData.get("full_name") as string;
    const company = formData.get("company") as string;

    try {
      const res = await fetch("/api/profile/create-investor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          full_name: fullName,
          company,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? tl.errFailed);
        setLoading(false);
        return;
      }

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

      window.location.href = "/investor";
    } catch (err) {
      setError(err instanceof Error ? err.message : tl.errGeneric);
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex items-center justify-center size-9 rounded-full bg-primary/15 text-primary">
            <TrendingUp size={18} strokeWidth={2.5} />
          </span>
          <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-primary">
            {tl.eyebrow}
          </span>
        </div>
        <CardTitle className="text-2xl">
          {tl.title}
          <span className="text-primary">.</span>
        </CardTitle>
        <CardDescription>{tl.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="full_name">{tl.fullNameLabel}</Label>
            <Input
              id="full_name"
              name="full_name"
              type="text"
              placeholder={tl.fullNamePlaceholder}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="company">
              {tl.companyLabel}{" "}
              <span className="text-muted-foreground">{tl.companyOptional}</span>
            </Label>
            <Input
              id="company"
              name="company"
              type="text"
              placeholder={tl.companyPlaceholder}
            />
          </div>

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
            <Input
              id="password"
              name="password"
              type="password"
              placeholder={tl.passwordPlaceholder}
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
            {loading ? tl.submitting : tl.submit}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-5 font-medium">
          {tl.haveAccount}{" "}
          <Link
            href="/"
            className="font-display font-bold text-primary hover:underline underline-offset-4"
          >
            {tl.loginCta}
          </Link>
        </p>
        <p className="text-center text-[11px] text-muted-foreground mt-2">
          {tl.notInvestor}{" "}
          <Link href="/register" className="underline">
            {tl.employeeCta}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
