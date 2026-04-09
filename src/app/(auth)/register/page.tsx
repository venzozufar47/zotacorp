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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DEPARTMENTS } from "@/lib/utils/constants";

export default function RegisterPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [department, setDepartment] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!department) {
      setError("Please select a department.");
      setLoading(false);
      return;
    }

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const fullName = formData.get("full_name") as string;
    const position = formData.get("position") as string;

    try {
      const supabase = createClient();

      // Step 1: sign up with Supabase Auth
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, department, position },
          emailRedirectTo: `${window.location.origin}/api/auth/callback`,
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        setLoading(false);
        return;
      }

      // Step 2: create profile row via API route (uses service role server-side)
      if (signUpData.user) {
        const res = await fetch("/api/profile/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: signUpData.user.id,
            email,
            full_name: fullName,
            department,
            position,
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          console.error("Profile creation failed:", body);
          // Non-blocking — user can still proceed, profile can be fixed later
        }
      }

      window.location.href = "/verify";
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
              placeholder="Alex Johnson"
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Select value={department} onValueChange={(v) => setDepartment(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="position">Position</Label>
              <Input
                id="position"
                name="position"
                type="text"
                placeholder="e.g. Designer"
                required
              />
            </div>
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
