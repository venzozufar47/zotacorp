"use server";

import { revalidatePath } from "next/cache";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { sendWhatsApp } from "@/lib/whatsapp/fonnte";
import { renderWaTemplate } from "@/lib/whatsapp/templates";
import { normalizePhone } from "@/lib/whatsapp/normalize-phone";
import {
  scoreDisc,
  validateAnswers,
  highLabel,
  type DiscAnswer,
  type DiscGraphValues,
} from "@/lib/disc/scoring";
import type { Database, Json } from "@/lib/supabase/types";

/**
 * Server actions fitur Tes Kepribadian DISC.
 *
 * Alur push: admin set `profiles.disc_test_required = true` (+ WA) →
 * karyawan tidak bisa lihat slip gaji sampai submit tes di /disc →
 * `submitDiscTest` menyimpan hasil dan mematikan flag (sekali push).
 */

export interface DiscResultDTO {
  id: string;
  userId: string;
  takenAt: string;
  source: "app" | "import";
  positionLabel: string | null;
  graph1: DiscGraphValues | null;
  graph2: DiscGraphValues | null;
  pattern1Num: number | null;
  pattern1Name: string | null;
  pattern1High: string | null;
  pattern2Num: number | null;
  pattern2Name: string | null;
  pattern2High: string | null;
  importedPdfPath: string | null;
}

type DiscRow = Database["public"]["Tables"]["disc_results"]["Row"];

function mapRow(r: DiscRow): DiscResultDTO {
  return {
    id: r.id,
    userId: r.user_id,
    takenAt: r.taken_at,
    source: r.source as "app" | "import",
    positionLabel: r.position_label,
    graph1: (r.graph1 as unknown as DiscGraphValues) ?? null,
    graph2: (r.graph2 as unknown as DiscGraphValues) ?? null,
    pattern1Num: r.pattern1_num,
    pattern1Name: r.pattern1_name,
    pattern1High: r.pattern1_high,
    pattern2Num: r.pattern2_num,
    pattern2Name: r.pattern2_name,
    pattern2High: r.pattern2_high,
    importedPdfPath: r.imported_pdf_path,
  };
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createAdminClient<Database>(url, key, {
    auth: { persistSession: false },
  });
}

/** State DISC milik karyawan yang login: flag wajib tes + hasil terbaru. */
export async function getMyDiscState(): Promise<{
  required: boolean;
  result: DiscResultDTO | null;
}> {
  const user = await getCurrentUser();
  if (!user) return { required: false, result: null };
  const supabase = await createClient();
  const [{ data: prof }, { data: rows }] = await Promise.all([
    supabase.from("profiles").select("disc_test_required").eq("id", user.id).maybeSingle(),
    supabase
      .from("disc_results")
      .select("*")
      .eq("user_id", user.id)
      .order("taken_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  return {
    required: Boolean(prof?.disc_test_required),
    result: rows && rows[0] ? mapRow(rows[0]) : null,
  };
}

/**
 * Submit tes dari wizard karyawan. Menghitung skor, menyimpan hasil
 * (source 'app'), lalu mematikan flag push. Return DTO hasil untuk
 * langsung ditampilkan.
 */
export async function submitDiscTest(
  answers: DiscAnswer[]
): Promise<{ ok: true; result: DiscResultDTO } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Tidak terautentikasi." };

  const invalid = validateAnswers(answers);
  if (invalid) return { ok: false, error: invalid };

  const supabase = await createClient();
  const { data: prof } = await supabase
    .from("profiles")
    .select("position, job_role, business_unit")
    .eq("id", user.id)
    .maybeSingle();
  const positionLabel =
    [prof?.job_role, prof?.business_unit].filter(Boolean).join(" ") ||
    prof?.position ||
    null;

  const score = scoreDisc(answers);
  const todayWib = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
  }).format(new Date());

  const { data: inserted, error } = await supabase
    .from("disc_results")
    .insert({
      user_id: user.id,
      taken_at: todayWib,
      source: "app",
      position_label: positionLabel,
      answers: answers as unknown as Json,
      most_counts: score.mostCounts as unknown as Json,
      least_counts: score.leastCounts as unknown as Json,
      graph1: score.graph1.values as unknown as Json,
      graph2: score.graph2.values as unknown as Json,
      pattern1_num: score.graph1.pattern.num,
      pattern1_name: score.graph1.pattern.name,
      pattern1_high: highLabel(score.graph1.highest),
      pattern2_num: score.graph2.pattern.num,
      pattern2_name: score.graph2.pattern.name,
      pattern2_high: highLabel(score.graph2.highest),
      created_by: user.id,
    })
    .select("*")
    .single();
  if (error || !inserted) {
    return { ok: false, error: error?.message ?? "Gagal menyimpan hasil." };
  }

  // Matikan flag push (sekali push). Pakai service role — profiles update
  // karyawan biasa tidak diizinkan RLS untuk kolom ini.
  const admin = getServiceClient();
  if (admin) {
    await admin
      .from("profiles")
      .update({ disc_test_required: false, updated_at: new Date().toISOString() })
      .eq("id", user.id);
  }

  revalidatePath("/disc");
  revalidatePath("/dashboard");
  revalidatePath("/payslips");
  revalidatePath("/admin/disc");
  return { ok: true, result: mapRow(inserted) };
}

// ─── Admin ────────────────────────────────────────────────────────────────

export interface DiscOverviewRow {
  userId: string;
  fullName: string;
  nickname: string | null;
  businessUnit: string | null;
  jobRole: string | null;
  avatarUrl: string | null;
  avatarSeed: string | null;
  required: boolean;
  latest: DiscResultDTO | null;
}

/** Tabel status DISC semua karyawan aktif untuk /admin/disc. */
export async function getDiscOverview(): Promise<{ rows: DiscOverviewRow[] }> {
  const role = await getCurrentRole();
  if (role !== "admin") return { rows: [] };
  const supabase = await createClient();

  const [{ data: profs }, { data: results }] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, full_name, nickname, business_unit, job_role, avatar_url, avatar_seed, disc_test_required"
      )
      .eq("role", "employee")
      .eq("is_active", true)
      .is("resigned_at", null)
      .order("full_name"),
    supabase
      .from("disc_results")
      .select("*")
      .order("taken_at", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  const latestByUser = new Map<string, DiscRow>();
  for (const r of results ?? []) {
    if (!latestByUser.has(r.user_id)) latestByUser.set(r.user_id, r);
  }

  const rows: DiscOverviewRow[] = (profs ?? []).map((p) => ({
    userId: p.id,
    fullName: p.full_name ?? "",
    nickname: p.nickname,
    businessUnit: p.business_unit,
    jobRole: p.job_role,
    avatarUrl: p.avatar_url,
    avatarSeed: p.avatar_seed,
    required: Boolean(p.disc_test_required),
    latest: latestByUser.has(p.id) ? mapRow(latestByUser.get(p.id)!) : null,
  }));
  return { rows };
}

/** Hasil DISC lengkap seorang karyawan (admin view / riwayat). */
export async function getDiscResultsForUser(
  userId: string
): Promise<{ results: DiscResultDTO[] }> {
  const role = await getCurrentRole();
  if (role !== "admin") return { results: [] };
  const supabase = await createClient();
  const { data } = await supabase
    .from("disc_results")
    .select("*")
    .eq("user_id", userId)
    .order("taken_at", { ascending: false })
    .order("created_at", { ascending: false });
  return { results: (data ?? []).map(mapRow) };
}

/**
 * Push / batalkan push tes untuk seorang karyawan. Saat push, kirim WA
 * (best-effort) memakai template `disc_test_push`.
 */
export async function setDiscTestRequired(
  userId: string,
  required: boolean
): Promise<{ ok: true; waSent: boolean } | { ok: false; error: string }> {
  const role = await getCurrentRole();
  if (role !== "admin") return { ok: false, error: "Forbidden" };

  const admin = getServiceClient();
  if (!admin) return { ok: false, error: "Service role belum dikonfigurasi." };

  const { data: prof, error } = await admin
    .from("profiles")
    .update({ disc_test_required: required, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .select("id, full_name, nickname, whatsapp_number, is_active, resigned_at")
    .single();
  if (error || !prof) return { ok: false, error: error?.message ?? "Profil tidak ditemukan." };

  let waSent = false;
  if (required && prof.is_active && !prof.resigned_at) {
    const phone = normalizePhone(prof.whatsapp_number ?? "");
    if (phone) {
      try {
        const message = await renderWaTemplate("disc_test_push", {
          name: prof.nickname || prof.full_name || "teman",
        });
        await sendWhatsApp(phone, message);
        waSent = true;
      } catch (err) {
        console.error("[disc] WA push failed", err);
      }
    }
  }

  revalidatePath("/admin/disc");
  revalidatePath("/dashboard");
  revalidatePath("/payslips");
  return { ok: true, waSent };
}

/**
 * Simpan hasil import dari PDF Frexor (setelah admin review di dialog).
 * `graph1/graph2` boleh null — UI akan merender bentuk referensi pattern
 * sebagai perkiraan.
 */
export async function importDiscResult(input: {
  userId: string;
  takenAt: string; // yyyy-mm-dd
  positionLabel: string | null;
  pattern1Num: number;
  pattern2Num: number;
  graph1: DiscGraphValues | null;
  graph2: DiscGraphValues | null;
  importedPdfPath: string | null;
}): Promise<{ ok: true; result: DiscResultDTO } | { ok: false; error: string }> {
  const role = await getCurrentRole();
  if (role !== "admin") return { ok: false, error: "Forbidden" };
  const user = await getCurrentUser();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.takenAt)) {
    return { ok: false, error: "Format tanggal tidak valid." };
  }

  const { DISC_PATTERN_BY_NUM } = await import("@/lib/disc/data/patterns");
  const p1 = DISC_PATTERN_BY_NUM.get(input.pattern1Num);
  const p2 = DISC_PATTERN_BY_NUM.get(input.pattern2Num);
  if (!p1 || !p2) return { ok: false, error: "Nomor pattern tidak dikenal." };

  const admin = getServiceClient();
  if (!admin) return { ok: false, error: "Service role belum dikonfigurasi." };

  const { data: inserted, error } = await admin
    .from("disc_results")
    .insert({
      user_id: input.userId,
      taken_at: input.takenAt,
      source: "import",
      position_label: input.positionLabel,
      graph1: (input.graph1 as unknown as Json) ?? null,
      graph2: (input.graph2 as unknown as Json) ?? null,
      pattern1_num: p1.num,
      pattern1_name: p1.name,
      pattern1_high: highLabel(p1.high),
      pattern2_num: p2.num,
      pattern2_name: p2.name,
      pattern2_high: highLabel(p2.high),
      imported_pdf_path: input.importedPdfPath,
      created_by: user?.id ?? null,
    })
    .select("*")
    .single();
  if (error || !inserted) {
    return { ok: false, error: error?.message ?? "Gagal menyimpan hasil import." };
  }

  revalidatePath("/admin/disc");
  return { ok: true, result: mapRow(inserted) };
}
