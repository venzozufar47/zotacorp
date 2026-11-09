export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Check, ChevronRight } from "lucide-react";
import { getCurrentRole, getCurrentUser } from "@/lib/supabase/cached";
import { createAdminClient } from "@/lib/actions/_supabase-admin";
import { listLocations } from "@/lib/actions/location.actions";
import { listBusinessUnits } from "@/lib/actions/business-units.actions";
import {
  getEmployerSignatureStatus,
  listContractTemplates,
  listEmploymentContracts,
} from "@/lib/actions/employment-contracts.actions";
import { EmploymentContractsManager } from "@/components/admin/EmploymentContractsManager";
import { loadRoster, toUserRow } from "@/lib/employees/roster";
import {
  CONTRACT_LABEL,
  STAGE_LABEL,
  contractState,
  formatShortDate,
  onboardingSteps,
  todayIso,
  type EmployeeStage,
  type ProfileTab,
} from "@/lib/employees/lifecycle";
import { cn } from "@/lib/utils";
import { EmployeeAvatar } from "@/components/shared/EmployeeAvatar";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { StagePill } from "@/components/admin/karyawan/StagePill";
import { Panel } from "@/components/admin/karyawan/Panel";
import { WorkSettings } from "@/components/admin/karyawan/WorkSettings";
import { ResignControl } from "@/components/admin/karyawan/ResignControl";
import { OffboardingItems } from "@/components/admin/karyawan/OffboardingItems";
import { DeleteAccountControl } from "@/components/admin/karyawan/DeleteAccountControl";
import type { Profile } from "@/lib/supabase/types";

const TABS: { key: ProfileTab; label: string }[] = [
  { key: "ringkasan", label: "Ringkasan" },
  { key: "data", label: "Data diri" },
  { key: "kerja", label: "Kerja" },
  { key: "kontrak", label: "Kontrak" },
  { key: "gaji", label: "Gaji" },
  { key: "izin", label: "Izin & SP" },
  { key: "keluar", label: "Keluar" },
];

const LIFELINE: EmployeeStage[] = ["baru", "probation", "aktif", "pamit", "keluar"];

const rupiah = (n: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

const LEAVE_KIND: Record<string, string> = {
  sakit: "Sakit",
  izin_keluar_toko: "Keluar toko",
  lainnya: "Lainnya",
};
const LEAVE_STATUS: Record<string, string> = { pending: "Menunggu", approved: "Disetujui", rejected: "Ditolak" };

export default async function KaryawanProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");
  const me = await getCurrentUser();

  const [{ id }, { tab: rawTab }] = await Promise.all([params, searchParams]);
  const tab: ProfileTab = TABS.some((t) => t.key === rawTab) ? (rawTab as ProfileTab) : "ringkasan";

  const [entry] = await loadRoster({ userId: id });
  if (!entry) notFound();
  const { profile: p, facts, stage, actions } = entry;
  const name = p.full_name || p.email;

  return (
    <div className="mx-auto max-w-6xl space-y-4 animate-fade-up">
      <Link
        href="/admin/karyawan"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={14} /> Karyawan
      </Link>

      <header className="flex flex-wrap items-center gap-4">
        <EmployeeAvatar
          size="lg"
          id={p.id}
          full_name={p.full_name}
          avatar_url={p.avatar_url ?? null}
          avatar_seed={p.avatar_seed ?? null}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-bold text-foreground">{name}</h1>
            <StagePill stage={stage} />
            {facts.isAdmin && <span className="text-xs text-muted-foreground">Admin</span>}
          </div>
          <p className="text-sm text-muted-foreground">
            {[p.job_role, p.business_unit, p.email].filter(Boolean).join(" · ")}
          </p>
        </div>
        {!facts.isAdmin && <Lifeline stage={stage} />}
      </header>

      <nav aria-label="Bagian profil" className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "ringkasan" ? `/admin/karyawan/${id}` : `/admin/karyawan/${id}?tab=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === t.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
            {actions.some((a) => a.tab === t.key && a.severity !== "info") && (
              <span aria-label="ada tindakan" className="size-1.5 rounded-full bg-destructive" />
            )}
          </Link>
        ))}
      </nav>

      {tab === "ringkasan" && <Ringkasan entry={entry} />}
      {tab === "data" && <DataDiri profile={p as Profile} />}
      {tab === "kerja" && <Kerja entry={entry} />}
      {tab === "kontrak" && <Kontrak entry={entry} />}
      {tab === "gaji" && <Gaji userId={id} included={facts.payslipIncluded} />}
      {tab === "izin" && <IzinSp userId={id} />}
      {tab === "keluar" && <Keluar entry={entry} isSelf={me?.id === id} />}
    </div>
  );
}

type Entry = Awaited<ReturnType<typeof loadRoster>>[number];

function Lifeline({ stage }: { stage: EmployeeStage }) {
  const current = LIFELINE.indexOf(stage);
  return (
    <ol aria-label="Tahap karyawan" className="flex items-center gap-1 text-xs">
      {LIFELINE.map((s, i) => (
        <li key={s} className="flex items-center gap-1">
          <span
            aria-current={i === current ? "step" : undefined}
            className={cn(
              "rounded-full px-2 py-0.5",
              i === current
                ? "bg-foreground text-background"
                : i < current
                  ? "text-foreground"
                  : "text-muted-foreground/60"
            )}
          >
            {STAGE_LABEL[s]}
          </span>
          {i < LIFELINE.length - 1 && <ChevronRight size={12} aria-hidden className="text-muted-foreground/50" />}
        </li>
      ))}
    </ol>
  );
}

function Ringkasan({ entry }: { entry: Entry }) {
  const { profile: p, facts, actions, stage } = entry;
  const steps = onboardingSteps(facts);
  const showSteps = !facts.isAdmin && (stage === "baru" || steps.some((s) => !s.done));
  const schedule = p.is_flexible_schedule
    ? "Jam fleksibel"
    : `${(p.work_start_time ?? "09:00").slice(0, 5)}–${(p.work_end_time ?? "18:00").slice(0, 5)}`;

  return (
    <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
      <Panel title="Berikutnya">
        {actions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Tidak ada yang perlu dikerjakan.</p>
        ) : (
          <ul className="-mx-2">
            {actions.map((a) => (
              <li key={a.key}>
                <Link
                  href={`?tab=${a.tab}`}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-muted"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "size-2 rounded-full",
                      a.severity === "tinggi" ? "bg-destructive" : a.severity === "sedang" ? "bg-warning" : "bg-muted-foreground/40"
                    )}
                  />
                  <span className="text-foreground">{a.label}</span>
                  {a.owner === "karyawan" && <span className="text-xs text-muted-foreground">menunggu karyawan</span>}
                  <ChevronRight size={14} aria-hidden className="ml-auto text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Sekilas">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">Bergabung</dt>
          <dd className="text-foreground">{formatShortDate(facts.joinedAt)}</dd>
          <dt className="text-muted-foreground">Kontrak</dt>
          <dd className="text-foreground">
            {facts.isAdmin ? "—" : CONTRACT_LABEL[contractState(facts)]}
            {facts.contract?.status === "signed" && facts.contract.termEndsOn && (
              <span className="text-muted-foreground"> s.d. {formatShortDate(facts.contract.termEndsOn)}</span>
            )}
          </dd>
          <dt className="text-muted-foreground">Jadwal</dt>
          <dd className="text-foreground">{schedule}</dd>
          <dt className="text-muted-foreground">Lokasi absen</dt>
          <dd className="text-foreground">{facts.locationCount ? `${facts.locationCount} lokasi` : "Bebas"}</dd>
          <dt className="text-muted-foreground">Penggajian</dt>
          <dd className="text-foreground">{facts.payslipIncluded ? "Ikut" : "Tidak ikut"}</dd>
        </dl>
      </Panel>

      {showSteps && (
        <Panel title="Onboarding" className="lg:col-span-2">
          <ol className="flex flex-wrap gap-2">
            {steps.map((s) => (
              <li key={s.key}>
                <Link
                  href={`?tab=${s.tab}`}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm",
                    s.done ? "border-transparent bg-success/15 text-foreground" : "border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  {s.done ? <Check size={14} aria-hidden /> : <span aria-hidden className="size-3.5 rounded-full border border-current" />}
                  {s.label}
                </Link>
              </li>
            ))}
          </ol>
        </Panel>
      )}
    </div>
  );
}

async function DataDiri({ profile }: { profile: Profile }) {
  const businessUnits = await listBusinessUnits();
  return <ProfileForm profile={profile} targetId={profile.id} businessUnits={businessUnits} />;
}

async function Kerja({ entry }: { entry: Entry }) {
  const { data: locations } = await listLocations();
  return (
    <WorkSettings
      row={toUserRow(entry.profile, entry.locationIds)}
      allLocations={(locations ?? []).map((l) => ({ id: l.id, name: l.name }))}
    />
  );
}

async function Kontrak({ entry }: { entry: Entry }) {
  const p = entry.profile;
  const [templates, contracts, employerSignatures, businessUnits] = await Promise.all([
    listContractTemplates(),
    listEmploymentContracts(),
    getEmployerSignatureStatus(),
    listBusinessUnits(),
  ]);
  const mine = contracts.filter((c) => c.user_id === p.id);
  const archived = mine.filter((c) => c.archived_at).length;
  const buNames = [
    ...new Set([p.business_unit, ...templates.map((t) => t.business_unit), ...mine.map((c) => c.business_unit)]),
  ].filter((v): v is string => !!v);

  return (
    <Panel
      title="Kontrak kerja"
      hint="Draft → Menunggu TTD → Berlaku → Berakhir"
      action={
        <Link href="/admin/employment-contracts" className="text-sm text-muted-foreground hover:text-foreground">
          Template & semua kontrak
        </Link>
      }
    >
      <EmploymentContractsManager
        focusUserId={p.id}
        templates={templates}
        contracts={mine}
        employees={[{ id: p.id, full_name: p.full_name, business_unit: p.business_unit ?? null }]}
        businessUnits={buNames}
        rolesByBu={Object.fromEntries(businessUnits.map((b) => [b.name, b.roles]))}
        employerSignatures={employerSignatures}
      />
      {archived > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">{archived} kontrak lama diarsipkan.</p>
      )}
    </Panel>
  );
}

async function Gaji({ userId, included }: { userId: string; included: boolean }) {
  const db = createAdminClient();
  const [{ data: slips }, { data: settings }] = await Promise.all([
    db
      .from("payslips")
      .select("id, month, year, net_total, status, payment_status, employee_response")
      .eq("user_id", userId)
      .order("year", { ascending: false })
      .order("month", { ascending: false })
      .limit(6),
    db
      .from("payslip_settings")
      .select("calculation_basis, monthly_fixed_amount, expected_work_days, is_finalized")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  const editor = (q: string) => `/admin/payslips/variables?user=${userId}${q}`;

  if (!included) {
    return (
      <Panel title="Gaji">
        <p className="text-sm text-muted-foreground">
          Orang ini tidak ikut penggajian bulanan. Nyalakan &ldquo;Masuk penggajian&rdquo; di tab Kerja bila perlu.
        </p>
      </Panel>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_3fr]">
      <Panel
        title="Setelan gaji"
        action={
          <Link href={editor("&scope=settings")} className="text-sm text-primary hover:underline">
            Ubah
          </Link>
        }
      >
        {!settings ? (
          <p className="text-sm text-destructive">Belum diatur.</p>
        ) : (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Dasar hitung</dt>
            <dd className="text-foreground">{settings.calculation_basis ?? "—"}</dd>
            <dt className="text-muted-foreground">Gaji pokok</dt>
            <dd className="tabular-nums text-foreground">{rupiah(settings.monthly_fixed_amount)}</dd>
            <dt className="text-muted-foreground">Hari kerja/bulan</dt>
            <dd className="text-foreground">{settings.expected_work_days ?? "—"}</dd>
            <dt className="text-muted-foreground">Status</dt>
            <dd className={settings.is_finalized ? "text-foreground" : "text-destructive"}>
              {settings.is_finalized ? "Final" : "Belum final"}
            </dd>
          </dl>
        )}
      </Panel>
      <Panel
        title="Slip terakhir"
        action={
          <span className="flex gap-3 text-sm">
            <Link href={editor("&scope=monthly")} className="text-primary hover:underline">
              Slip bulan ini
            </Link>
            <Link href={editor("&view=payments")} className="text-muted-foreground hover:text-foreground">
              Pembayaran
            </Link>
          </span>
        }
      >
        {(slips ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada slip.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {(slips ?? []).map((s) => (
                <tr key={s.id} className="border-t border-border first:border-0">
                  <td className="py-1.5 text-foreground">
                    {MONTHS[s.month - 1]} {s.year}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-foreground">{rupiah(s.net_total)}</td>
                  <td className="py-1.5 pl-4 text-muted-foreground">
                    {s.status === "draft" ? "Draft" : s.payment_status === "paid" ? "Dibayar" : "Final, belum dibayar"}
                    {s.employee_response === "issue" && <span className="ml-2 text-destructive">ada sanggahan</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}

async function IzinSp({ userId }: { userId: string }) {
  const db = createAdminClient();
  const [{ data: leaves }, { data: notes }] = await Promise.all([
    db
      .from("leave_requests")
      .select("id, kind, reason, status, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(8),
    db
      .from("employee_coaching_notes")
      .select("id, sp_level, body, created_at, valid_until")
      .eq("user_id", userId)
      .not("sp_level", "is", null)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);
  const today = todayIso();

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel
        title="Izin"
        action={
          <Link href="/admin/izin" className="text-sm text-primary hover:underline">
            Semua izin
          </Link>
        }
      >
        {(leaves ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum pernah izin.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {(leaves ?? []).map((l) => (
              <li key={l.id} className="flex items-baseline gap-2">
                <span className="w-24 shrink-0 text-muted-foreground">{formatShortDate(l.created_at)}</span>
                <span className="text-foreground">{LEAVE_KIND[l.kind] ?? l.kind}</span>
                <span className="truncate text-muted-foreground">{l.reason}</span>
                <span className={cn("ml-auto shrink-0 text-xs", l.status === "pending" ? "text-destructive" : "text-muted-foreground")}>
                  {LEAVE_STATUS[l.status] ?? l.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel
        title="Teguran & SP"
        action={
          <Link href="/admin/sp" className="text-sm text-primary hover:underline">
            Terbitkan
          </Link>
        }
      >
        {(notes ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Bersih.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {(notes ?? []).map((n) => {
              const active = !!n.valid_until && n.valid_until >= today;
              return (
                <li key={n.id} className="flex items-baseline gap-2">
                  <span className="w-24 shrink-0 text-muted-foreground">{formatShortDate(n.created_at)}</span>
                  <span className="font-medium uppercase text-foreground">{n.sp_level}</span>
                  <span className="truncate text-muted-foreground">{n.body}</span>
                  <span className={cn("ml-auto shrink-0 text-xs", active ? "text-destructive" : "text-muted-foreground")}>
                    {active ? `aktif s.d. ${formatShortDate(n.valid_until!)}` : "lewat"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}

async function Keluar({ entry, isSelf }: { entry: Entry; isSelf: boolean }) {
  const { profile: p, facts } = entry;
  const name = p.full_name || p.email;
  const db = createAdminClient();
  const { data: checklist } = await db
    .from("offboarding_checklists")
    .select("id, effective_at")
    .eq("user_id", p.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: items } = checklist
    ? await db.from("offboarding_manual_items").select("id, label, done, done_at").eq("checklist_id", checklist.id)
    : { data: [] as { id: string; label: string; done: boolean; done_at: string | null }[] };
  const c = facts.contract;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel
        title={facts.isActive ? "Status" : "Sudah keluar"}
        hint={
          facts.isActive
            ? "Akhiri kontrak dulu bila ada masa pemberitahuan, lalu tandai keluar di hari terakhir."
            : p.resigned_at
              ? `Dinonaktifkan ${formatShortDate(p.resigned_at)}`
              : "Akun nonaktif"
        }
        action={<ResignControl userId={p.id} name={name} isActive={facts.isActive} disabled={isSelf} />}
      >
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">Kontrak</dt>
          <dd className="text-foreground">{CONTRACT_LABEL[contractState(facts)]}</dd>
          {c?.resignNoticeAt && (
            <>
              <dt className="text-muted-foreground">Pemberitahuan</dt>
              <dd className="text-foreground">{formatShortDate(c.resignNoticeAt)}</dd>
            </>
          )}
          {c?.endedAt && (
            <>
              <dt className="text-muted-foreground">Hari terakhir</dt>
              <dd className="text-foreground">{formatShortDate(c.endedAt)}</dd>
            </>
          )}
        </dl>
        {facts.isActive && c?.status === "signed" && (
          <Link href="?tab=kontrak" className="mt-3 inline-block text-sm text-primary hover:underline">
            Akhiri kontrak
          </Link>
        )}
      </Panel>

      {checklist && (
        <Panel
          title="Checklist keluar"
          hint={`Dibuat ${formatShortDate(checklist.effective_at)}. PIN POS, tim, dan akses app sudah dicabut otomatis.`}
        >
          <OffboardingItems
            items={(items ?? []).map((i) => ({ id: i.id, label: i.label, done: i.done, doneAt: i.done_at }))}
          />
        </Panel>
      )}

      {!isSelf && (
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3 text-xs text-muted-foreground lg:col-span-2">
          <span>Akun salah buat atau duplikat?</span>
          <DeleteAccountControl userId={p.id} name={name} />
        </div>
      )}
    </div>
  );
}
