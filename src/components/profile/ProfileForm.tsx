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
import { Pencil, X, Check } from "lucide-react";
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
  is_flexible_schedule: boolean;
  work_start_time: string;
  work_end_time: string;
  grace_period_min: number;
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
    is_flexible_schedule: p.is_flexible_schedule ?? false,
    work_start_time: (p.work_start_time ?? "09:00").slice(0, 5),
    work_end_time: (p.work_end_time ?? "18:00").slice(0, 5),
    grace_period_min: p.grace_period_min ?? 15,
  };
}

type CardSection = "personal" | "work" | "contact" | "emergency";

export function ProfileForm({ profile, targetId }: ProfileFormProps) {
  const router = useRouter();
  const [state, setState] = useState<FormState>(() => toFormState(profile));
  const [snapshot, setSnapshot] = useState<FormState>(() => toFormState(profile));
  const [editing, setEditing] = useState<CardSection | null>(null);
  const [saving, setSaving] = useState(false);

  const availableJobRoles = useMemo(() => {
    if (!state.business_unit) return [];
    return BUSINESS_UNIT_ROLES[state.business_unit as BusinessUnit] ?? [];
  }, [state.business_unit]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((s) => ({ ...s, [key]: value }));
  }

  function startEdit(section: CardSection) {
    setSnapshot({ ...state });
    setEditing(section);
  }

  function cancelEdit() {
    setState({ ...snapshot });
    setEditing(null);
  }

  async function saveSection() {
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
      setSnapshot({ ...state });
      setEditing(null);
      setSaving(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      setSaving(false);
    }
  }

  const isEditing = (section: CardSection) => editing === section;

  return (
    <div className="space-y-5">
      {/* Personal Information */}
      <SectionCard
        title="Personal Information"
        editing={isEditing("personal")}
        onEdit={() => startEdit("personal")}
        onCancel={cancelEdit}
        onSave={saveSection}
        saving={saving}
      >
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Full Name" required value={state.full_name} editing={isEditing("personal")}>
            <Input
              value={state.full_name}
              onChange={(e) => set("full_name", e.target.value)}
              required
            />
          </Field>
          <Field label="Nickname" value={state.nickname} editing={isEditing("personal")}>
            <Input
              value={state.nickname}
              onChange={(e) => set("nickname", e.target.value)}
            />
          </Field>
          <Field label="Gender" value={state.gender} editing={isEditing("personal")}>
            <Select
              value={state.gender || undefined}
              onValueChange={(v) => set("gender", v ?? "")}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                {GENDERS.map((g) => (
                  <SelectItem key={g} value={g}>{g}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Date of Birth" value={state.date_of_birth} editing={isEditing("personal")}>
            <Input
              type="date"
              value={state.date_of_birth}
              onChange={(e) => set("date_of_birth", e.target.value)}
            />
          </Field>
          <Field label="Place of Birth" value={state.place_of_birth} editing={isEditing("personal")}>
            <Input
              value={state.place_of_birth}
              onChange={(e) => set("place_of_birth", e.target.value)}
              placeholder="City of birth"
            />
          </Field>
          <Field label="Current City" value={state.current_city} editing={isEditing("personal")}>
            <Input
              value={state.current_city}
              onChange={(e) => set("current_city", e.target.value)}
              placeholder="Current residence"
            />
          </Field>
          <Field label="Shirt Size" value={state.shirt_size} editing={isEditing("personal")}>
            <Select
              value={state.shirt_size || undefined}
              onValueChange={(v) => set("shirt_size", v ?? "")}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                {SHIRT_SIZES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </SectionCard>

      {/* Work Information */}
      <SectionCard
        title="Work Information"
        editing={isEditing("work")}
        onEdit={() => startEdit("work")}
        onCancel={cancelEdit}
        onSave={saveSection}
        saving={saving}
      >
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Business Unit" value={state.business_unit} editing={isEditing("work")}>
            <Select
              value={state.business_unit || undefined}
              onValueChange={(v) => {
                set("business_unit", v ?? "");
                set("job_role", "");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select business unit..." />
              </SelectTrigger>
              <SelectContent>
                {BUSINESS_UNITS.map((bu) => (
                  <SelectItem key={bu} value={bu}>{bu}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Role" value={state.job_role} editing={isEditing("work")}>
            <Select
              value={state.job_role || undefined}
              onValueChange={(v) => set("job_role", v ?? "")}
              disabled={!state.business_unit}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={state.business_unit ? "Select role..." : "Pick business unit first"}
                />
              </SelectTrigger>
              <SelectContent>
                {availableJobRoles.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="First Day of Work" value={state.first_day_of_work} editing={isEditing("work")}>
            <Input
              type="date"
              value={state.first_day_of_work}
              onChange={(e) => set("first_day_of_work", e.target.value)}
            />
          </Field>
          <Field label="Motto / Quote of the Day" value={state.motto} editing={isEditing("work")}>
            <Textarea
              value={state.motto}
              onChange={(e) => set("motto", e.target.value)}
              placeholder="Words to live by..."
              rows={2}
            />
          </Field>
        </div>
        {targetId && (
          <div className="pt-3 border-t border-border mt-4 space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={state.is_flexible_schedule}
                onChange={(e) => set("is_flexible_schedule", e.target.checked)}
                className="h-4 w-4 rounded border-border"
                style={{ accentColor: "var(--primary)" }}
                disabled={!isEditing("work")}
              />
              <div>
                <span className="text-sm font-medium">Flexible Schedule</span>
                <p className="text-xs text-muted-foreground">
                  Exempt from on-time/late and overtime rules
                </p>
              </div>
            </label>
            {!state.is_flexible_schedule && (
              <div className="grid md:grid-cols-3 gap-4">
                <Field label="Work Start Time" value={state.work_start_time} editing={isEditing("work")}>
                  <Input
                    type="time"
                    value={state.work_start_time}
                    onChange={(e) => set("work_start_time", e.target.value)}
                  />
                </Field>
                <Field label="Work End Time" value={state.work_end_time} editing={isEditing("work")}>
                  <Input
                    type="time"
                    value={state.work_end_time}
                    onChange={(e) => set("work_end_time", e.target.value)}
                  />
                </Field>
                <Field label="Grace Period (min)" value={String(state.grace_period_min)} editing={isEditing("work")}>
                  <Input
                    type="number"
                    min={0}
                    max={120}
                    value={state.grace_period_min}
                    onChange={(e) => set("grace_period_min", Number(e.target.value))}
                  />
                </Field>
              </div>
            )}
          </div>
        )}
      </SectionCard>

      {/* Contact Information */}
      <SectionCard
        title="Contact Information"
        editing={isEditing("contact")}
        onEdit={() => startEdit("contact")}
        onCancel={cancelEdit}
        onSave={saveSection}
        saving={saving}
      >
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="WhatsApp Number" value={state.whatsapp_number} editing={isEditing("contact")}>
            <Input
              type="tel"
              value={state.whatsapp_number}
              onChange={(e) => set("whatsapp_number", e.target.value)}
              placeholder="+62..."
            />
          </Field>
          <Field label="NPWP" value={state.npwp} editing={isEditing("contact")}>
            <Input
              value={state.npwp}
              onChange={(e) => set("npwp", e.target.value)}
              placeholder="Tax ID number"
            />
          </Field>
        </div>
      </SectionCard>

      {/* Emergency Contact */}
      <SectionCard
        title="Emergency Contact"
        editing={isEditing("emergency")}
        onEdit={() => startEdit("emergency")}
        onCancel={cancelEdit}
        onSave={saveSection}
        saving={saving}
      >
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Emergency Contact Name" value={state.emergency_contact_name} editing={isEditing("emergency")}>
            <Input
              value={state.emergency_contact_name}
              onChange={(e) => set("emergency_contact_name", e.target.value)}
            />
          </Field>
          <Field label="Emergency Contact WhatsApp" value={state.emergency_contact_whatsapp} editing={isEditing("emergency")}>
            <Input
              type="tel"
              value={state.emergency_contact_whatsapp}
              onChange={(e) => set("emergency_contact_whatsapp", e.target.value)}
              placeholder="+62..."
            />
          </Field>
        </div>
      </SectionCard>
    </div>
  );
}

function SectionCard({
  title,
  editing,
  onEdit,
  onCancel,
  onSave,
  saving,
  children,
}: {
  title: string;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-base">{title}</CardTitle>
        {editing ? (
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2.5 text-xs text-muted-foreground"
              onClick={onCancel}
              disabled={saving}
            >
              <X size={14} className="mr-1" />
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-8 px-3 text-xs"
              style={{ background: "var(--primary)" }}
              onClick={onSave}
              disabled={saving}
            >
              <Check size={14} className="mr-1" />
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2.5 text-xs text-muted-foreground"
            onClick={onEdit}
          >
            <Pencil size={14} className="mr-1" />
            Edit
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function Field({
  label,
  required,
  value,
  editing,
  children,
}: {
  label: string;
  required?: boolean;
  value?: string;
  editing: boolean;
  children: React.ReactNode;
}) {
  const isEmpty = !value || value.trim() === "";

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {editing ? (
        children
      ) : (
        <p className={`text-sm py-2 px-3 rounded-md bg-[#f5f5f7] min-h-[36px] ${isEmpty ? "text-muted-foreground italic" : "text-foreground"}`}>
          {isEmpty ? "Not filled" : value}
        </p>
      )}
    </div>
  );
}
