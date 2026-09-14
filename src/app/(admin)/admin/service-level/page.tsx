export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/supabase/cached";
import { PageHeader } from "@/components/shared/PageHeader";
import { ServiceLevelAdminClient } from "@/components/admin/ServiceLevelAdminClient";
import { ServiceLevelRangePicker } from "@/components/admin/ServiceLevelRangePicker";
import {
  getServiceLevel,
  getServiceLevelSummary,
  getWaste,
  listServiceLevelOwners,
  listServiceLevelExclusions,
  listServiceLevelSkus,
} from "@/lib/actions/pos-service-level.actions";
import { jakartaDateString, jakartaDateMinusDays } from "@/lib/utils/jakarta";

/** Harus sama dengan MAX_SPAN_DAYS di pos-service-level.actions.ts — di
 * sini dipakai untuk memangkas rentang custom SEBELUM dikirim ke action,
 * supaya orang dapat data 90 hari terakhir (jendela dipangkas + pesan),
 * bukan halaman kosong tanpa penjelasan dari `ok:false` yang ditelan
 * `.catch(() => null)` di bawah. */
const MAX_RANGE_DAYS = 90;
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

type RangeMode = "7d" | "30d" | "custom";

interface ResolvedRange {
  mode: RangeMode;
  fromDate: string;
  toDate: string;
  /** Custom tidak valid/kepanjangan → jatuh balik ke 30 hari, alasannya di sini. */
  warning: string | null;
}

/**
 * Baca `?range=7d|30d|custom&from=&to=` dari URL. Default (tanpa param)
 * = 30 hari, sama seperti perilaku sebelum picker ini ada.
 */
function resolveRange(
  sp: { range?: string; from?: string; to?: string },
  today: string
): ResolvedRange {
  if (sp.range === "7d") {
    return {
      mode: "7d",
      fromDate: jakartaDateMinusDays(today, 6),
      toDate: today,
      warning: null,
    };
  }
  if (sp.range !== "custom") {
    return {
      mode: "30d",
      fromDate: jakartaDateMinusDays(today, 29),
      toDate: today,
      warning: null,
    };
  }

  const rawFrom = sp.from ?? "";
  const rawTo = sp.to ?? "";
  const fallback = (warning: string): ResolvedRange => ({
    mode: "custom",
    fromDate: jakartaDateMinusDays(today, 29),
    toDate: today,
    warning,
  });

  if (!YMD_RE.test(rawFrom) || !YMD_RE.test(rawTo)) {
    return fallback("Tanggal custom tidak valid — menampilkan 30 hari terakhir.");
  }
  // Tanggal akhir di masa depan tidak berarti apa-apa untuk metrik
  // historis — dipangkas ke hari ini daripada menampilkan halaman kosong.
  const to = rawTo > today ? today : rawTo;
  if (rawFrom > to) {
    return fallback("Tanggal mulai melewati tanggal akhir — menampilkan 30 hari terakhir.");
  }
  const spanDays =
    Math.round(
      (Date.parse(to + "T00:00:00Z") - Date.parse(rawFrom + "T00:00:00Z")) / 86_400_000
    ) + 1;
  if (spanDays > MAX_RANGE_DAYS) {
    return {
      mode: "custom",
      fromDate: jakartaDateMinusDays(to, MAX_RANGE_DAYS - 1),
      toDate: to,
      warning: `Rentang dipangkas ke maksimal ${MAX_RANGE_DAYS} hari.`,
    };
  }
  return { mode: "custom", fromDate: rawFrom, toDate: to, warning: null };
}

function formatTanggalPendek(ymd: string): string {
  return new Date(ymd + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
  });
}

/** Label pendek dipakai di judul subsection ("Penyebab terbesar (…)"). */
function formatRangeLabel(range: ResolvedRange, today: string): string {
  if (range.mode === "7d") return "7 hari";
  if (range.mode === "30d") return "30 hari";
  if (range.fromDate === range.toDate) return formatTanggalPendek(range.fromDate);
  const toLabel = range.toDate === today ? "hari ini" : formatTanggalPendek(range.toDate);
  return `${formatTanggalPendek(range.fromDate)} – ${toLabel}`;
}

/**
 * Pusat pengaturan + pemantauan metrik Service Level.
 *
 * Halaman tersendiri, bukan kartu di /admin/settings: manajemen
 * pengecualian per-SKU ber-tanggal bukan kartu kecil, dan superadmin
 * butuh tempat melihat angkanya tanpa harus membuka layar kasir.
 *
 * RENTANG WAKTU dikendalikan lewat query string (`range`/`from`/`to`),
 * bukan state klien — supaya bisa dibagikan sebagai link dan supaya
 * Service Level, Susut, penyebab terbesar, dan per-hari SEMUA memakai
 * jendela yang sama persis. Lihat resolveRange di atas.
 */
export default async function ServiceLevelAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const sp = await searchParams;
  const today = jakartaDateString(new Date());
  const range = resolveRange(sp, today);
  const rangeLabel = formatRangeLabel(range, today);

  const supabase = await createClient();
  const [{ data: accounts }, { data: employeeRows }] = await Promise.all([
    supabase
      .from("bank_accounts")
      .select(
        "id, account_name, default_branch, service_level_enabled, service_level_open_hour, service_level_close_hour, service_level_target"
      )
      .eq("pos_enabled", true)
      .eq("is_active", true)
      .order("default_branch", { ascending: true }),
    supabase
      .from("profiles")
      .select("id, full_name, email")
      .neq("role", "investor")
      .eq("is_active", true)
      .order("full_name", { ascending: true }),
  ]);

  const employees = (employeeRows ?? []).map((e) => ({
    id: e.id,
    name: e.full_name || e.email,
  }));

  // Satu putaran per outlet — jumlah outlet POS segelintir, jadi ini
  // masih jauh lebih murah daripada memecah halaman jadi banyak request.
  const outlets = await Promise.all(
    (accounts ?? []).map(async (a) => {
      const [summary, owners, exclusions, skus, live, waste] = await Promise.all([
        getServiceLevelSummary(a.id, { fromDate: range.fromDate, toDate: range.toDate }),
        listServiceLevelOwners(a.id),
        listServiceLevelExclusions(a.id),
        listServiceLevelSkus(a.id),
        // Rincian penyebab (worst SKU + per-hari) sama seperti yang
        // dilihat kasir di POS — dihitung LIVE, jadi hanya untuk outlet
        // yang aktif supaya tidak buang waktu query di outlet mati.
        a.service_level_enabled
          ? getServiceLevel(a.id, { fromDate: range.fromDate, toDate: range.toDate }).catch(
              () => null
            )
          : Promise.resolve(null),
        // Susut dihitung untuk SEMUA outlet, termasuk yang metrik SL-nya
        // mati: penarikan expired tetap terjadi dan tetap layak dilihat.
        // Murah, jadi tidak perlu digerbangi flag seperti `live`.
        getWaste(a.id, { fromDate: range.fromDate, toDate: range.toDate }).catch(() => null),
      ]);
      return {
        id: a.id,
        accountName: a.account_name,
        branch: a.default_branch,
        enabled: a.service_level_enabled,
        openHour: a.service_level_open_hour,
        closeHour: a.service_level_close_hour,
        target: a.service_level_target,
        summary: summary.ok ? (summary.data ?? null) : null,
        live: live && live.ok ? (live.data ?? null) : null,
        waste: waste && waste.ok ? (waste.data ?? null) : null,
        owners,
        exclusions,
        skus,
      };
    })
  );

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="Service Level"
        subtitle="Berapa persen produk ready stock, dirata-rata sepanjang jam buka. Target per outlet, lihat kartu masing-masing."
      />
      <ServiceLevelRangePicker
        mode={range.mode}
        fromDate={range.fromDate}
        toDate={range.toDate}
        today={today}
        warning={range.warning}
      />
      <ServiceLevelAdminClient outlets={outlets} employees={employees} rangeLabel={rangeLabel} />
    </div>
  );
}
