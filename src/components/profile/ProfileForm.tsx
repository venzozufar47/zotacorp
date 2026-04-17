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
import { Pencil, X, Check, Ruler } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import Image from "next/image";
import {
  BUSINESS_UNITS,
  BUSINESS_UNIT_ROLES,
  GENDERS,
  SHIRT_SIZES,
  type BusinessUnit,
} from "@/lib/utils/constants";
import type { Profile } from "@/lib/supabase/types";
import { AddressPicker, type AddressValues } from "./AddressPicker";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { Dictionary } from "@/lib/i18n/dictionary";

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
  // domisili
  domisili_provinsi: string;
  domisili_kota: string;
  domisili_kecamatan: string;
  domisili_kelurahan: string;
  domisili_alamat: string;
  // asal
  asal_provinsi: string;
  asal_kota: string;
  asal_kecamatan: string;
  asal_kelurahan: string;
  asal_alamat: string;
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
    domisili_provinsi: p.domisili_provinsi ?? "",
    domisili_kota: p.domisili_kota ?? "",
    domisili_kecamatan: p.domisili_kecamatan ?? "",
    domisili_kelurahan: p.domisili_kelurahan ?? "",
    domisili_alamat: p.domisili_alamat ?? "",
    asal_provinsi: p.asal_provinsi ?? "",
    asal_kota: p.asal_kota ?? "",
    asal_kecamatan: p.asal_kecamatan ?? "",
    asal_kelurahan: p.asal_kelurahan ?? "",
    asal_alamat: p.asal_alamat ?? "",
  };
}

type CardSection = "personal" | "work" | "contact" | "emergency" | "domisili" | "asal";

/**
 * True when every asal_* field already equals its domisili_* counterpart.
 * Drives the "Same as current residence" checkbox's checked state so it
 * stays in sync with whatever the user typed in either picker — ticks
 * itself when they happen to match, unticks itself when they diverge.
 * All five fields must match (including a fully-empty domisili — which
 * would tick the box on an empty form, but that's a harmless no-op).
 */
function asalMatchesDomisili(s: FormState): boolean {
  return (
    s.asal_provinsi === s.domisili_provinsi &&
    s.asal_kota === s.domisili_kota &&
    s.asal_kecamatan === s.domisili_kecamatan &&
    s.asal_kelurahan === s.domisili_kelurahan &&
    s.asal_alamat === s.domisili_alamat &&
    // Don't show as "same" when domisili itself is empty — otherwise the
    // box is ticked on a brand-new profile before the user does anything.
    (s.domisili_provinsi.trim() !== "" || s.domisili_alamat.trim() !== "")
  );
}

export function ProfileForm({ profile, targetId }: ProfileFormProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const pf = t.profileForm;
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
        toast.error(body.error ?? pf.profileSaveFailed);
        setSaving(false);
        return;
      }

      toast.success(pf.profileSaved);
      setSnapshot({ ...state });
      setEditing(null);
      setSaving(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : pf.somethingWentWrong);
      setSaving(false);
    }
  }

  const isEditing = (section: CardSection) => editing === section;

  return (
    <div className="space-y-5">
      {/* Personal Information */}
      <SectionCard
        title={pf.sectionPersonal}
        labels={pf}
        editing={isEditing("personal")}
        onEdit={() => startEdit("personal")}
        onCancel={cancelEdit}
        onSave={saveSection}
        saving={saving}
      >
        <div className="grid md:grid-cols-2 gap-4">
          <Field label={pf.fullName} required value={state.full_name} editing={isEditing("personal")} notFilled={pf.notFilled}>
            <Input
              value={state.full_name}
              onChange={(e) => set("full_name", e.target.value)}
              required
            />
          </Field>
          <Field label={pf.nickname} value={state.nickname} editing={isEditing("personal")} notFilled={pf.notFilled}>
            <Input
              value={state.nickname}
              onChange={(e) => set("nickname", e.target.value)}
            />
          </Field>
          <Field label={pf.gender} value={state.gender} editing={isEditing("personal")} notFilled={pf.notFilled}>
            <Select
              value={state.gender || undefined}
              onValueChange={(v) => set("gender", v ?? "")}
            >
              <SelectTrigger>
                <SelectValue placeholder={pf.selectPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                {GENDERS.map((g) => (
                  <SelectItem key={g} value={g}>{g}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={pf.dateOfBirth} value={state.date_of_birth} editing={isEditing("personal")} notFilled={pf.notFilled}>
            <Input
              type="date"
              value={state.date_of_birth}
              onChange={(e) => set("date_of_birth", e.target.value)}
            />
          </Field>
          <Field label={pf.placeOfBirth} value={state.place_of_birth} editing={isEditing("personal")} notFilled={pf.notFilled}>
            <Input
              value={state.place_of_birth}
              onChange={(e) => set("place_of_birth", e.target.value)}
              placeholder={pf.placeOfBirthPlaceholder}
            />
          </Field>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">{pf.shirtSize}</Label>
              <SizeChartDialog label={pf.viewSizeChart} title={pf.sizeChartTitle} />
            </div>
            {isEditing("personal") ? (
              <Select
                value={state.shirt_size || undefined}
                onValueChange={(v) => set("shirt_size", v ?? "")}
              >
                <SelectTrigger>
                  <SelectValue placeholder={pf.selectPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {SHIRT_SIZES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p
                className={`text-sm font-medium py-2.5 px-3.5 rounded-xl border-2 border-border bg-muted min-h-[44px] ${
                  !state.shirt_size ? "text-muted-foreground italic" : "text-foreground"
                }`}
              >
                {state.shirt_size || pf.notFilled}
              </p>
            )}
          </div>
        </div>
      </SectionCard>

      {/* Current Residence */}
      <SectionCard
        title={pf.sectionCurrentResidence}
        labels={pf}
        editing={isEditing("domisili")}
        onEdit={() => startEdit("domisili")}
        onCancel={cancelEdit}
        onSave={saveSection}
        saving={saving}
      >
        <AddressPicker
          editing={isEditing("domisili")}
          values={{
            provinsi: state.domisili_provinsi,
            kota: state.domisili_kota,
            kecamatan: state.domisili_kecamatan,
            kelurahan: state.domisili_kelurahan,
            alamat: state.domisili_alamat,
          }}
          onChange={(patch: Partial<AddressValues>) => {
            setState((s) => ({
              ...s,
              ...(patch.provinsi !== undefined && { domisili_provinsi: patch.provinsi }),
              ...(patch.kota !== undefined && { domisili_kota: patch.kota }),
              ...(patch.kecamatan !== undefined && { domisili_kecamatan: patch.kecamatan }),
              ...(patch.kelurahan !== undefined && { domisili_kelurahan: patch.kelurahan }),
              ...(patch.alamat !== undefined && { domisili_alamat: patch.alamat }),
            }));
          }}
        />
      </SectionCard>

      {/* Hometown */}
      {(() => {
        // Derive "locked" state here so the checkbox, the AddressPicker, and
        // the save button all read from one source of truth.
        const asalLocked = isEditing("asal") && asalMatchesDomisili(state);
        return (
      <SectionCard
        title={pf.sectionHometown}
        labels={pf}
        editing={isEditing("asal")}
        onEdit={() => startEdit("asal")}
        onCancel={cancelEdit}
        onSave={saveSection}
        saving={saving}
      >
        {isEditing("asal") && (
          <label className="flex items-start gap-3 rounded-2xl border-2 border-foreground/30 bg-muted px-3 py-2.5 cursor-pointer hover:border-foreground transition-colors">
            <input
              type="checkbox"
              checked={asalLocked}
              onChange={(e) => {
                if (e.target.checked) {
                  // Mirror domisili → asal. We copy values (rather than aliasing)
                  // so unchecking leaves whatever's there editable instead of
                  // re-clearing the fields.
                  setState((s) => ({
                    ...s,
                    asal_provinsi: s.domisili_provinsi,
                    asal_kota: s.domisili_kota,
                    asal_kecamatan: s.domisili_kecamatan,
                    asal_kelurahan: s.domisili_kelurahan,
                    asal_alamat: s.domisili_alamat,
                  }));
                } else {
                  // Unchecking clears so the user can re-enter a different
                  // hometown — safer than leaving stale mirrored values that
                  // the user might not notice and then accidentally save.
                  setState((s) => ({
                    ...s,
                    asal_provinsi: "",
                    asal_kota: "",
                    asal_kecamatan: "",
                    asal_kelurahan: "",
                    asal_alamat: "",
                  }));
                }
              }}
              className="mt-0.5 h-5 w-5 rounded border-2 border-foreground accent-primary"
            />
            <div className="flex-1">
              <div className="text-sm font-bold">{pf.sameAsCurrentResidence}</div>
              <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                {pf.sameAsCurrentResidenceHint}
              </div>
            </div>
          </label>
        )}
        <AddressPicker
          // When "same as current residence" is ticked we force read-only
          // rendering: (a) it visually signals the fields are locked because
          // they mirror domisili, and (b) it sidesteps a Radix Select quirk
          // where the cascading lists (kota / kecamatan / kelurahan) haven't
          // been fetched yet when values are injected wholesale, so their
          // labels render blank until the user interacts.
          editing={isEditing("asal") && !asalLocked}
          values={{
            provinsi: state.asal_provinsi,
            kota: state.asal_kota,
            kecamatan: state.asal_kecamatan,
            kelurahan: state.asal_kelurahan,
            alamat: state.asal_alamat,
          }}
          onChange={(patch: Partial<AddressValues>) => {
            setState((s) => ({
              ...s,
              ...(patch.provinsi !== undefined && { asal_provinsi: patch.provinsi }),
              ...(patch.kota !== undefined && { asal_kota: patch.kota }),
              ...(patch.kecamatan !== undefined && { asal_kecamatan: patch.kecamatan }),
              ...(patch.kelurahan !== undefined && { asal_kelurahan: patch.kelurahan }),
              ...(patch.alamat !== undefined && { asal_alamat: patch.alamat }),
            }));
          }}
        />
      </SectionCard>
        );
      })()}

      {/* Work Information */}
      <SectionCard
        title={pf.sectionWork}
        labels={pf}
        editing={isEditing("work")}
        onEdit={() => startEdit("work")}
        onCancel={cancelEdit}
        onSave={saveSection}
        saving={saving}
      >
        <div className="grid md:grid-cols-2 gap-4">
          <Field label={pf.businessUnit} value={state.business_unit} editing={isEditing("work")} notFilled={pf.notFilled}>
            <Select
              value={state.business_unit || undefined}
              onValueChange={(v) => {
                set("business_unit", v ?? "");
                set("job_role", "");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder={pf.selectBusinessUnit} />
              </SelectTrigger>
              <SelectContent>
                {BUSINESS_UNITS.map((bu) => (
                  <SelectItem key={bu} value={bu}>{bu}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={pf.role} value={state.job_role} editing={isEditing("work")} notFilled={pf.notFilled}>
            <Select
              value={state.job_role || undefined}
              onValueChange={(v) => set("job_role", v ?? "")}
              disabled={!state.business_unit}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={state.business_unit ? pf.selectRole : pf.pickBusinessUnitFirst}
                />
              </SelectTrigger>
              <SelectContent>
                {availableJobRoles.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={pf.firstDayOfWork} value={state.first_day_of_work} editing={isEditing("work")} notFilled={pf.notFilled}>
            <Input
              type="date"
              value={state.first_day_of_work}
              onChange={(e) => set("first_day_of_work", e.target.value)}
            />
          </Field>
          <Field label={pf.motto} value={state.motto} editing={isEditing("work")} notFilled={pf.notFilled}>
            <Textarea
              value={state.motto}
              onChange={(e) => set("motto", e.target.value)}
              placeholder={pf.mottoPlaceholder}
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
                className="h-5 w-5 rounded border-2 border-foreground accent-primary"
                disabled={!isEditing("work")}
              />
              <div>
                <span className="text-sm font-bold">{pf.flexibleSchedule}</span>
                <p className="text-xs text-muted-foreground">
                  {pf.flexibleScheduleHint}
                </p>
              </div>
            </label>
            {!state.is_flexible_schedule && (
              <div className="grid md:grid-cols-3 gap-4">
                <Field label={pf.workStartTime} value={state.work_start_time} editing={isEditing("work")} notFilled={pf.notFilled}>
                  <Input
                    type="time"
                    value={state.work_start_time}
                    onChange={(e) => set("work_start_time", e.target.value)}
                  />
                </Field>
                <Field label={pf.workEndTime} value={state.work_end_time} editing={isEditing("work")} notFilled={pf.notFilled}>
                  <Input
                    type="time"
                    value={state.work_end_time}
                    onChange={(e) => set("work_end_time", e.target.value)}
                  />
                </Field>
                <Field label={pf.gracePeriodMin} value={String(state.grace_period_min)} editing={isEditing("work")} notFilled={pf.notFilled}>
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
        title={pf.sectionContact}
        labels={pf}
        editing={isEditing("contact")}
        onEdit={() => startEdit("contact")}
        onCancel={cancelEdit}
        onSave={saveSection}
        saving={saving}
      >
        <div className="grid md:grid-cols-2 gap-4">
          <Field label={pf.whatsappNumber} value={state.whatsapp_number} editing={isEditing("contact")} notFilled={pf.notFilled}>
            <Input
              type="tel"
              value={state.whatsapp_number}
              onChange={(e) => set("whatsapp_number", e.target.value)}
              placeholder="+62..."
            />
          </Field>
          <Field label={pf.npwp} value={state.npwp} editing={isEditing("contact")} notFilled={pf.notFilled}>
            <Input
              value={state.npwp}
              onChange={(e) => set("npwp", e.target.value)}
              placeholder={pf.npwpPlaceholder}
            />
          </Field>
        </div>
      </SectionCard>

      {/* Emergency Contact */}
      <SectionCard
        title={pf.sectionEmergency}
        labels={pf}
        editing={isEditing("emergency")}
        onEdit={() => startEdit("emergency")}
        onCancel={cancelEdit}
        onSave={saveSection}
        saving={saving}
      >
        <div className="grid md:grid-cols-2 gap-4">
          <Field label={pf.emergencyContactName} value={state.emergency_contact_name} editing={isEditing("emergency")} notFilled={pf.notFilled}>
            <Input
              value={state.emergency_contact_name}
              onChange={(e) => set("emergency_contact_name", e.target.value)}
            />
          </Field>
          <Field label={pf.emergencyContactWhatsapp} value={state.emergency_contact_whatsapp} editing={isEditing("emergency")} notFilled={pf.notFilled}>
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
  labels,
  editing,
  onEdit,
  onCancel,
  onSave,
  saving,
  children,
}: {
  title: string;
  labels: Dictionary["profileForm"];
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-lg">{title}</CardTitle>
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
              {labels.cancel}
            </Button>
            <Button
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={onSave}
              disabled={saving}
            >
              <Check size={14} className="mr-1" />
              {saving ? labels.saving : labels.save}
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
            {labels.edit}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function SizeChartDialog({ label, title }: { label: string; title: string }) {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
          />
        }
      >
        <Ruler size={12} className="mr-1" />
        {label}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="relative w-full" style={{ aspectRatio: "4 / 3" }}>
          <Image
            src="/sizechart.jpeg"
            alt="Shirt size chart"
            fill
            className="object-contain rounded-md"
            sizes="(max-width: 768px) 100vw, 640px"
            priority
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  required,
  value,
  editing,
  notFilled,
  children,
}: {
  label: string;
  required?: boolean;
  value?: string;
  editing: boolean;
  notFilled: string;
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
        <p className={`text-sm font-medium py-2.5 px-3.5 rounded-xl border-2 border-border bg-muted min-h-[44px] ${isEmpty ? "text-muted-foreground italic" : "text-foreground"}`}>
          {isEmpty ? notFilled : value}
        </p>
      )}
    </div>
  );
}
