export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, getCurrentProfile } from "@/lib/supabase/cached";
import {
  getEmployeePayslips,
  getPayslipDeliverables,
  getPayslipSettings,
} from "@/lib/actions/payslip.actions";
import { listMyPayslipDisputes } from "@/lib/actions/payslip-disputes.actions";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { EnablePushButton } from "@/components/shared/EnablePushButton";
import { PayslipDetailView } from "@/components/payslip/PayslipDetailView";
import { getDictionary } from "@/lib/i18n/server";

/** Field yang harus terisi sebelum karyawan boleh lihat payslip
 *  ter-finalize. Mirror PROFILE_SECTIONS di dashboard supaya gating
 *  konsisten dengan progress bar yang dilihat karyawan. */
const REQUIRED_PROFILE_KEYS = [
  "full_name",
  "gender",
  "date_of_birth",
  "place_of_birth",
  "domisili_provinsi",
  "domisili_kota",
  "domisili_kecamatan",
  "domisili_kelurahan",
  "domisili_alamat",
  "asal_provinsi",
  "asal_kota",
  "asal_kecamatan",
  "asal_kelurahan",
  "asal_alamat",
  "business_unit",
  "job_role",
  "whatsapp_number",
  "npwp",
  "emergency_contact_name",
  "emergency_contact_whatsapp",
] as const;

export default async function EmployeePayslipsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const profile = await getCurrentProfile();
  const missingFields = REQUIRED_PROFILE_KEYS.filter((k) => {
    const v = (profile as Record<string, unknown> | null)?.[k];
    return typeof v === "string" ? v.trim().length === 0 : !v;
  });
  const profileComplete = missingFields.length === 0;
  const completionPct = Math.round(
    ((REQUIRED_PROFILE_KEYS.length - missingFields.length) /
      REQUIRED_PROFILE_KEYS.length) *
      100
  );

  // Gate DISC: karyawan yang di-push admin untuk ambil Tes Kepribadian
  // DISC tidak bisa melihat slip gaji sampai tesnya selesai (flag mati
  // otomatis saat submit tes di /disc).
  const discRequired = Boolean(profile?.disc_test_required);

  const [payslips, settings, disputes] =
    profileComplete && !discRequired
      ? await Promise.all([
          getEmployeePayslips(user.id),
          getPayslipSettings(user.id),
          listMyPayslipDisputes(),
        ])
      : [[], null, []];
  const deliverablesByPayslip = new Map(
    await Promise.all(
      payslips.map(
        async (p) => [p.id, await getPayslipDeliverables(p.id)] as const
      )
    )
  );
  const { t } = await getDictionary();

  // Show locked state kalau profile belum lengkap, ATAU kalau profile
  // sudah lengkap tapi memang belum ada finalisasi sama sekali.
  const showLocked = !profileComplete || payslips.length === 0;

  return (
    <div className="space-y-5 animate-fade-up overflow-x-hidden">
      <PageHeader
        title={t.payslipsPage.title}
        subtitle={t.payslipsPage.subtitle}
      />

      {/* Opt-in to push once the profile is complete — works even before the
          first payslip exists, so they're notified the moment it lands. */}
      {profileComplete && !discRequired && <EnablePushButton />}

      {discRequired ? (
        <DiscLockedNotice />
      ) : showLocked ? (
        <LockedNotice
          profileComplete={profileComplete}
          completionPct={completionPct}
          missingCount={missingFields.length}
        />
      ) : (
        <PayslipDetailView
          payslips={payslips}
          deliverablesByPayslip={Object.fromEntries(deliverablesByPayslip)}
          settings={settings}
          profile={profile}
          disputes={disputes}
        />
      )}
    </div>
  );
}

function LockedNotice({
  profileComplete,
  completionPct,
  missingCount,
}: {
  profileComplete: boolean;
  completionPct: number;
  missingCount: number;
}) {
  return (
    <Card>
      <CardContent className="p-6 text-center space-y-4">
        <div className="inline-flex items-center justify-center size-16 rounded-full border-2 border-foreground bg-warning shadow-hard-sm">
          <span className="text-3xl">{profileComplete ? "💰" : "🔒"}</span>
        </div>
        {profileComplete ? (
          <>
            <h3 className="font-display text-lg font-bold">
              Belum ada slip gaji
            </h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Admin belum men-finalize slip gaji apapun untuk kamu. Slip
              gaji akan muncul di sini setelah admin men-finalize-nya
              pada akhir periode.
            </p>
          </>
        ) : (
          <>
            <h3 className="font-display text-lg font-bold">
              Lengkapi profile dulu
            </h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Slip gaji terkunci sampai profile kamu lengkap.
              Tinggal{" "}
              <strong className="text-foreground">{missingCount} field</strong>{" "}
              lagi yang belum diisi (saat ini{" "}
              <strong className="text-foreground">{completionPct}%</strong>{" "}
              lengkap). Buka dashboard untuk lihat field mana yang
              kosong.
            </p>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm border-2 border-foreground shadow-hard hover:bg-primary/90 transition"
            >
              Lengkapi profile →
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Slip gaji terkunci karena karyawan di-push mengambil Tes DISC. */
function DiscLockedNotice() {
  return (
    <Card>
      <CardContent className="p-6 text-center space-y-4">
        <div className="inline-flex items-center justify-center size-16 rounded-full border-2 border-foreground bg-warning shadow-hard-sm">
          <span className="text-3xl">🧠</span>
        </div>
        <h3 className="font-display text-lg font-bold">
          Ambil Tes Kepribadian DISC dulu
        </h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Kamu diminta admin untuk mengambil Tes Kepribadian DISC. Slip gaji
          terkunci sampai tesnya selesai — cuma butuh ±10 menit dan hasilnya
          langsung muncul.
        </p>
        <Link
          href="/disc"
          className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm border-2 border-foreground shadow-hard hover:bg-primary/90 transition"
        >
          Ambil tes sekarang →
        </Link>
      </CardContent>
    </Card>
  );
}
