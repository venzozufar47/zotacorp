"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
  Pencil,
  X,
  Check,
  Ruler,
  UserRound,
  MapPin,
  House,
  Briefcase,
  Phone,
  HeartPulse,
  type LucideIcon,
} from "lucide-react";
import { Disclosure, DisclosureGroup } from "@/components/account/Disclosure";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import Image from "next/image";
import { GENDERS, SHIRT_SIZES } from "@/lib/utils/constants";
import type { Profile } from "@/lib/supabase/types";
import { AddressPicker, type AddressValues } from "./AddressPicker";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { Dictionary } from "@/lib/i18n/dictionary";
import { cleanProfileFields } from "@/lib/profile/normalize";

export interface BusinessUnitOption {
  name: string;
  roles: string[];
}

interface ProfileFormProps {
  profile: Profile;
  targetId?: string;
  /**
   * Business units + role-list tiap BU, di-fetch parent (server
   * component) dari DB via `listBusinessUnits`. Admin ubah di
   * `/admin/settings` → berubah live di sini tanpa deploy.
   */
  businessUnits: BusinessUnitOption[];
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
  npwp_not_applicable: boolean;
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
    npwp_not_applicable: p.npwp_not_applicable ?? false,
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

const REQUIRED_KEYS: Record<CardSection, (keyof FormState)[]> = {
  personal: ["full_name", "gender", "date_of_birth", "place_of_birth"],
  domisili: [
    "domisili_provinsi",
    "domisili_kota",
    "domisili_kecamatan",
    "domisili_kelurahan",
    "domisili_alamat",
  ],
  asal: [
    "asal_provinsi",
    "asal_kota",
    "asal_kecamatan",
    "asal_kelurahan",
    "asal_alamat",
  ],
  work: ["business_unit", "job_role"],
  // NPWP dicek terpisah di `missing()`: terisi, atau dicentang "tidak punya".
  contact: ["whatsapp_number"],
  emergency: ["emergency_contact_name", "emergency_contact_whatsapp"],
};

/** Kolom yang divalidasi saat bagian itu disimpan (lihat lib/profile/normalize.ts). */
const SECTION_KEYS: Record<CardSection, string[]> = {
  personal: ["full_name", "nickname", "place_of_birth"],
  domisili: [],
  asal: [],
  work: [],
  contact: ["whatsapp_number", "npwp"],
  emergency: ["emergency_contact_name", "emergency_contact_whatsapp"],
};

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

export function ProfileForm({
  profile,
  targetId,
  businessUnits,
}: ProfileFormProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const pf = t.profileForm;
  const [state, setState] = useState<FormState>(() => toFormState(profile));
  const [snapshot, setSnapshot] = useState<FormState>(() => toFormState(profile));
  const [editing, setEditing] = useState<CardSection | null>(null);
  const [saving, setSaving] = useState(false);

  const rolesByBu = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const b of businessUnits) map.set(b.name, b.roles);
    return map;
  }, [businessUnits]);

  // Karyawan mengisi unit bisnis, jabatan, dan hari pertama kerja SEKALI saat
  // onboarding; setelah tersimpan hanya admin yang bisa mengubah
  // (lib/profile/edit-policy.ts — server menolak perubahan).
  const lockBusinessUnit = !targetId && !!profile.business_unit;
  const lockJobRole = !targetId && !!profile.job_role;
  const lockFirstDay = !targetId && !!profile.first_day_of_work;

  const availableJobRoles = useMemo(() => {
    if (!state.business_unit) return [];
    return rolesByBu.get(state.business_unit) ?? [];
  }, [state.business_unit, rolesByBu]);

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
    // Aturan baku nama/kontak/NPWP (lib/profile/normalize.ts). Hanya isian
    // bagian yang sedang diubah yang boleh menolak simpan; isian bagian lain
    // yang masih format lama dirapikan diam-diam bila bisa.
    const { values, errors } = cleanProfileFields(state);
    const mine = editing ? SECTION_KEYS[editing] : [];
    const blocking = mine.map((k) => errors[k]).find(Boolean);
    if (blocking) {
      toast.error(blocking);
      return;
    }
    const cleaned: Record<string, unknown> = { ...state };
    for (const [k, v] of Object.entries(values)) {
      if (!errors[k]) cleaned[k] = v ?? "";
    }

    setSaving(true);
    try {
      const res = await fetch("/api/profile/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId, ...cleaned }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? pf.profileSaveFailed);
        setSaving(false);
        return;
      }

      toast.success(pf.profileSaved);
      setState(cleaned as FormState);
      setSnapshot({ ...(cleaned as FormState) });
      setEditing(null);
      setSaving(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : pf.somethingWentWrong);
      setSaving(false);
    }
  }

  const isEditing = (section: CardSection) => editing === section;

  /** Ringkasan satu baris saat bagian tertutup; kosong → "Belum diisi". */
  const summaryOf = (...parts: string[]) =>
    parts.map((p) => p.trim()).filter(Boolean).join(" · ") || pf.notFilled;
  /** Kunci wajib per bagian — sama dengan daftar yang dipakai kartu kelengkapan di dashboard. */
  const missing = (section: CardSection) =>
    REQUIRED_KEYS[section].some((k) => String(state[k] ?? "").trim() === "") ||
    (section === "contact" && !state.npwp_not_applicable && state.npwp.trim() === "");

  return (
    <DisclosureGroup>
      {/* Personal Information */}
      <SectionCard
        title={pf.sectionPersonal}
        icon={UserRound}
        summary={summaryOf(state.nickname || state.full_name, state.place_of_birth)}
        incomplete={missing("personal")}
        labels={pf}
        editing={isEditing("personal")}
        onEdit={() => startEdit("personal")}
        onCancel={cancelEdit}
        onSave={saveSection}
        saving={saving}
      >
        <div className={isEditing("personal") ? "grid gap-4 md:grid-cols-2" : "grid grid-cols-2 gap-x-4 gap-y-3"}>
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
              maxLength={30}
              onChange={(e) => set("nickname", e.target.value)}
            />
          </Field>
          <Field label={pf.gender} value={state.gender} editing={isEditing("personal")} notFilled={pf.notFilled}>
            <Select
              value={state.gender || undefined}
              onValueChange={(v) => set("gender", v ?? "")}
            >
              <SelectTrigger className="w-full">
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
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{pf.shirtSize}</Label>
            {isEditing("personal") ? (
              <Select
                value={state.shirt_size || undefined}
                onValueChange={(v) => set("shirt_size", v ?? "")}
              >
                <SelectTrigger className="w-full">
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
                className={`text-sm ${
                  !state.shirt_size ? "text-muted-foreground" : "font-medium text-foreground"
                }`}
              >
                {state.shirt_size || pf.notFilled}
              </p>
            )}
            <SizeChartDialog label={pf.viewSizeChart} title={pf.sizeChartTitle} />
          </div>
        </div>
      </SectionCard>

      {/* Current Residence */}
      <SectionCard
        title={pf.sectionCurrentResidence}
        icon={House}
        summary={summaryOf(state.domisili_kota, state.domisili_provinsi)}
        incomplete={missing("domisili")}
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
        icon={MapPin}
        summary={summaryOf(state.asal_kota, state.asal_provinsi)}
        incomplete={missing("asal")}
        labels={pf}
        editing={isEditing("asal")}
        onEdit={() => startEdit("asal")}
        onCancel={cancelEdit}
        onSave={saveSection}
        saving={saving}
      >
        {isEditing("asal") && (
          <label className="flex items-start gap-3 rounded-xl border border-border bg-muted/50 px-3 py-2.5 cursor-pointer hover:bg-muted transition-colors">
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
              className="mt-0.5 h-5 w-5 rounded accent-primary"
            />
            <div className="flex-1">
              <div className="text-sm font-semibold">{pf.sameAsCurrentResidence}</div>
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
        icon={Briefcase}
        summary={summaryOf(state.business_unit, state.job_role)}
        incomplete={missing("work")}
        labels={pf}
        editing={isEditing("work")}
        onEdit={() => startEdit("work")}
        onCancel={cancelEdit}
        onSave={saveSection}
        saving={saving}
      >
        <div className={isEditing("work") ? "grid gap-4 md:grid-cols-2" : "grid grid-cols-2 gap-x-4 gap-y-3"}>
          <Field label={pf.businessUnit} value={state.business_unit} editing={isEditing("work")} notFilled={pf.notFilled}>
            <Select
              value={state.business_unit || undefined}
              onValueChange={(v) => {
                set("business_unit", v ?? "");
                if (!lockJobRole) set("job_role", "");
              }}
              disabled={lockBusinessUnit}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={pf.selectBusinessUnit} />
              </SelectTrigger>
              <SelectContent>
                {businessUnits.map((b) => b.name).map((bu) => (
                  <SelectItem key={bu} value={bu}>{bu}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={pf.role} value={state.job_role} editing={isEditing("work")} notFilled={pf.notFilled}>
            <Select
              value={state.job_role || undefined}
              onValueChange={(v) => set("job_role", v ?? "")}
              disabled={!state.business_unit || lockJobRole}
            >
              <SelectTrigger className="w-full">
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
              disabled={lockFirstDay}
            />
          </Field>
          {isEditing("work") && (lockBusinessUnit || lockJobRole || lockFirstDay) && (
            <p className="text-xs text-muted-foreground md:col-span-2">{pf.adminOnlyAfterFilled}</p>
          )}
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
                className="h-5 w-5 rounded accent-primary"
                disabled={!isEditing("work")}
              />
              <div>
                <span className="text-sm font-semibold">{pf.flexibleSchedule}</span>
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
        icon={Phone}
        summary={summaryOf(state.whatsapp_number)}
        incomplete={missing("contact")}
        labels={pf}
        editing={isEditing("contact")}
        onEdit={() => startEdit("contact")}
        onCancel={cancelEdit}
        onSave={saveSection}
        saving={saving}
      >
        <div className={isEditing("contact") ? "grid gap-4 md:grid-cols-2" : "grid grid-cols-2 gap-x-4 gap-y-3"}>
          <Field label={pf.whatsappNumber} value={state.whatsapp_number} editing={isEditing("contact")} notFilled={pf.notFilled}>
            <Input
              type="tel"
              value={state.whatsapp_number}
              onChange={(e) => set("whatsapp_number", e.target.value)}
              placeholder="+62..."
            />
          </Field>
          <Field
            label={pf.npwp}
            value={state.npwp_not_applicable ? pf.noNpwp : state.npwp}
            editing={isEditing("contact")}
            notFilled={pf.notFilled}
          >
            <div className="space-y-2">
              <Input
                value={state.npwp}
                onChange={(e) => set("npwp", e.target.value)}
                inputMode="numeric"
                placeholder={pf.npwpPlaceholder}
                disabled={state.npwp_not_applicable}
              />
              <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={state.npwp_not_applicable}
                  onChange={(e) => {
                    set("npwp_not_applicable", e.target.checked);
                    if (e.target.checked) set("npwp", "");
                  }}
                  className="size-4 accent-primary"
                />
                {pf.noNpwp}
              </label>
            </div>
          </Field>
        </div>
      </SectionCard>

      {/* Emergency Contact */}
      <SectionCard
        title={pf.sectionEmergency}
        icon={HeartPulse}
        summary={summaryOf(state.emergency_contact_name)}
        incomplete={missing("emergency")}
        labels={pf}
        editing={isEditing("emergency")}
        onEdit={() => startEdit("emergency")}
        onCancel={cancelEdit}
        onSave={saveSection}
        saving={saving}
      >
        <div className={isEditing("emergency") ? "grid gap-4 md:grid-cols-2" : "grid grid-cols-2 gap-x-4 gap-y-3"}>
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
    </DisclosureGroup>
  );
}

/**
 * Satu bagian profil: baris ringkas yang terbuka jadi detail. Saat diedit
 * bagian ini dikunci terbuka; Ubah / Batal / Simpan ada di bawah isinya
 * supaya jempol tidak perlu naik lagi setelah mengisi.
 */
function SectionCard({
  title,
  icon,
  summary,
  incomplete,
  labels,
  editing,
  onEdit,
  onCancel,
  onSave,
  saving,
  children,
}: {
  title: string;
  icon: LucideIcon;
  summary: string;
  incomplete: boolean;
  labels: Dictionary["profileForm"];
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Disclosure
      title={title}
      icon={icon}
      summary={summary}
      status={incomplete ? "warn" : undefined}
      statusLabel={labels.notFilled}
      open={open || editing}
      onOpenChange={(next) => {
        if (!editing) setOpen(next);
      }}
    >
      {children}
      <div className="flex items-center justify-end gap-2 pt-1">
        {editing ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="min-h-11 px-4 text-muted-foreground"
              onClick={onCancel}
              disabled={saving}
            >
              <X size={14} />
              {labels.cancel}
            </Button>
            <Button
              size="sm"
              className="min-h-11 px-5"
              onClick={onSave}
              disabled={saving}
            >
              <Check size={14} />
              {saving ? labels.saving : labels.save}
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="min-h-11 px-4"
            onClick={onEdit}
          >
            <Pencil size={14} />
            {labels.edit}
          </Button>
        )}
      </div>
    </Disclosure>
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
            className="h-auto min-h-8 justify-start gap-1 px-0 font-sans text-xs font-normal text-primary hover:bg-transparent hover:underline"
          />
        }
      >
        <Ruler size={12} aria-hidden />
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
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {editing ? (
        children
      ) : (
        <p className={`text-sm break-words ${isEmpty ? "text-muted-foreground" : "font-medium text-foreground"}`}>
          {isEmpty ? notFilled : value}
        </p>
      )}
    </div>
  );
}
