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

export default function RegisterPage() {
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
        setError(body.error ?? "Account creation failed. Please try again.");
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
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
      setLoading(false);
    }
  }

  return (
    <Card className="shadow-md border-0">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl">Create account</CardTitle>
        <CardDescription>Join Zota Corp dashboard</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="full_name">Full name</Label>
            <Input
              id="full_name"
              name="full_name"
              type="text"
              placeholder="Avenzoar Zufar Qisthauzan"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">Work email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@zotacorp.com"
              required
              autoComplete="email"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as "employee" | "admin")}>
              <SelectTrigger>
                <SelectValue placeholder="Select role…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="employee">Employee</SelectItem>
                {!adminTaken && <SelectItem value="admin">Admin</SelectItem>}
              </SelectContent>
            </Select>
            {adminTaken && (
              <p className="text-xs text-muted-foreground">
                An admin account already exists — only employee sign-ups are allowed.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="Min. 8 characters"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive bg-destructive/8 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <Button
            type="submit"
            className="w-full"
            style={{ background: "var(--primary)" }}
            disabled={loading}
          >
            {loading ? "Creating account…" : "Create account"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-4">
          Already have an account?{" "}
          <Link href="/login" className="font-medium" style={{ color: "var(--primary)" }}>
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
