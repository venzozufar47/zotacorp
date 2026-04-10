"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  BUSINESS_UNITS,
  BUSINESS_UNIT_ROLES,
  GENDERS,
  SHIRT_SIZES,
  type BusinessUnit,
} from "@/lib/utils/constants";
import type { Profile } from "@/lib/supabase/types";

interface ProfileFormProps {
  profile: Profile;
  /** When set, we're editing someone else (admin mode). Otherwise self-edit. */
  targetId?: string;
}

type FormState = {
  full_name: string;
  nickname: string;
  business_unit: string;
  job_role: string;
  gender: string;
  date_of_birth: string;
  place_of_birth: string;
  current_city: string;
  whatsapp_number: string;
  npwp: string;
  emergency_contact_name: string;
  emergency_contact_whatsapp: string;
  first_day_of_work: string;
  motto: string;
  shirt_size: string;
};

function toFormState(p: Profile): FormState {
  return {
    full_name: p.full_name ?? "",
    nickname: p.nickname ?? "",
    business_unit: p.business_unit ?? "",
    job_role: p.job_role ?? "",
    gender: p.gender ?? "",
    date_of_birth: p.date_of_birth ?? "",
    place_of_birth: p.place_of_birth ?? "",
    current_city: p.current_city ?? "",
    whatsapp_number: p.whatsapp_number ?? "",
    npwp: p.npwp ?? "",
    emergency_contact_name: p.emergency_contact_name ?? "",
    emergency_contact_whatsapp: p.emergency_contact_whatsapp ?? "",
    first_day_of_work: p.first_day_of_work ?? "",
    motto: p.motto ?? "",
    shirt_size: p.shirt_size ?? "",
  };
}

export function ProfileForm({ profile, targetId }: ProfileFormProps) {
  const router = useRouter();
  const [state, setState] = useState<FormState>(() => toFormState(profile));
  const [saving, setSaving] = useState(false);

  const availableJobRoles = useMemo(() => {
    if (!state.business_unit) return [];
    return BUSINESS_UNIT_ROLES[state.business_unit as BusinessUnit] ?? [];
  }, [state.business_unit]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((s) => ({ ...s, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/profile/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId, ...state }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Failed to save profile");
        setSaving(false);
        return;
      }

      toast.success("Profile saved");
      setSaving(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Personal Information */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Personal Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Full Name" required>
              <Input
                value={state.full_name}
                onChange={(e) => set("full_name", e.target.value)}
                required
              />
            </Field>
            <Field label="Nickname">
              <Input
                value={state.nickname}
                onChange={(e) => set("nickname", e.target.value)}
              />
            </Field>
            <Field label="Gender">
              <Select
                value={state.gender || undefined}
                onValueChange={(v) => set("gender", v ?? "")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {GENDERS.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Date of Birth">
              <Input
                type="date"
                value={state.date_of_birth}
                onChange={(e) => set("date_of_birth", e.target.value)}
              />
            </Field>
            <Field label="Place of Birth">
              <Input
                value={state.place_of_birth}
                onChange={(e) => set("place_of_birth", e.target.value)}
                placeholder="City of birth"
              />
            </Field>
            <Field label="Current City">
              <Input
                value={state.current_city}
                onChange={(e) => set("current_city", e.target.value)}
                placeholder="Current residence"
              />
            </Field>
            <Field label="Shirt Size">
              <Select
                value={state.shirt_size || undefined}
                onValueChange={(v) => set("shirt_size", v ?? "")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {SHIRT_SIZES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </CardContent>
      </Card>

      {/* Work Information */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Work Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Business Unit">
              <Select
                value={state.business_unit || undefined}
                onValueChange={(v) => {
                  set("business_unit", v ?? "");
                  set("job_role", ""); // reset role when BU changes
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select business unit…" />
                </SelectTrigger>
                <SelectContent>
                  {BUSINESS_UNITS.map((bu) => (
                    <SelectItem key={bu} value={bu}>
                      {bu}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Role">
              <Select
                value={state.job_role || undefined}
                onValueChange={(v) => set("job_role", v ?? "")}
                disabled={!state.business_unit}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      state.business_unit ? "Select role…" : "Pick business unit first"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {availableJobRoles.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="First Day of Work">
              <Input
                type="date"
                value={state.first_day_of_work}
                onChange={(e) => set("first_day_of_work", e.target.value)}
              />
            </Field>
            <Field label="Motto / Quote of the Day">
              <Textarea
                value={state.motto}
                onChange={(e) => set("motto", e.target.value)}
                placeholder="Words to live by…"
                rows={2}
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      {/* Contact Information */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Contact Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="WhatsApp Number">
              <Input
                type="tel"
                value={state.whatsapp_number}
                onChange={(e) => set("whatsapp_number", e.target.value)}
                placeholder="+62…"
              />
            </Field>
            <Field label="NPWP">
              <Input
                value={state.npwp}
                onChange={(e) => set("npwp", e.target.value)}
                placeholder="Tax ID number"
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      {/* Emergency Contact */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Emergency Contact</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Emergency Contact Name">
              <Input
                value={state.emergency_contact_name}
                onChange={(e) => set("emergency_contact_name", e.target.value)}
              />
            </Field>
            <Field label="Emergency Contact WhatsApp">
              <Input
                type="tel"
                value={state.emergency_contact_whatsapp}
                onChange={(e) => set("emergency_contact_whatsapp", e.target.value)}
                placeholder="+62…"
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end sticky bottom-0 md:static py-3 bg-[#f5f5f7] md:bg-transparent">
        <Button
          type="submit"
          disabled={saving}
          className="min-w-32"
          style={{ background: "var(--primary)" }}
        >
          {saving ? "Saving…" : "Save profile"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}
