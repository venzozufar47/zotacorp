"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "./_supabase-admin";
import { requireAdmin, requireAdminOrPosAssignee, type ActionResult } from "./_gates";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { ASPECT_ALL_GOOD, FEEDBACK_DAILY_TARGET, FEEDBACK_SLUGS, type FeedbackBranch } from "@/lib/feedback/constants";
import { validateFeedback } from "@/lib/feedback/validate";
import { wibDayStart } from "@/lib/feedback/store";

/**
 * Feedback pelanggan Haengbocake. Pengiriman publik tanpa login: divalidasi ketat dan dibatasi lajunya di sini, ditulis
 * dengan service-role (tabel tidak punya kebijakan untuk anon). Bagian admin dan POS berada di balik gerbang masing-masing.
 */

const DEVICE_LIMIT = { count: 2, windowMin: 10 };
// Pelanggan di toko memakai Wi-Fi yang sama, jadi batas per IP sengaja longgar (hanya menahan banjir otomatis).
const IP_LIMIT = { count: 40, windowMin: 60 };

function hashIp(ip: string): string {
  return createHash("sha256")
    .update(`${ip}|${process.env.SUPABASE_SERVICE_ROLE_KEY ?? "zota"}`)
    .digest("hex")
    .slice(0, 32);
}

export interface SubmitFeedbackInput {
  slug: string;
  visitType: unknown;
  rating: unknown;
  aspects: unknown;
  comment: unknown;
  productWish: unknown;
  /** Urutan tombol masukan yang tampil (acak per pelanggan). */
  aspectOrder?: unknown;
  deviceId: unknown;
  /** Kolom jebakan bot: manusia tidak pernah mengisinya. */
  website?: unknown;
}

export async function submitCustomerFeedback(input: SubmitFeedbackInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const target = FEEDBACK_SLUGS[String(input.slug)];
  if (!target) return { ok: false, error: "Halaman tidak ditemukan." };
  // Bot yang mengisi kolom jebakan dianggap berhasil supaya tidak mencoba ulang.
  if (typeof input.website === "string" && input.website.trim() !== "") return { ok: true };

  const v = validateFeedback(input);
  if (!v.ok) return v;

  const deviceId = typeof input.deviceId === "string" && /^[\w-]{8,64}$/.test(input.deviceId) ? input.deviceId : null;
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "";
  const ipHash = ip ? hashIp(ip) : null;

  const db = createAdminClient();
  const since = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
  const tooMany = { ok: false as const, error: "Terima kasih, kak! Masukan kakak sudah kami terima. Coba lagi sebentar lagi ya." };
  if (deviceId) {
    const { count } = await db
      .from("customer_feedback" as never)
      .select("id", { count: "exact", head: true })
      .eq("device_id", deviceId)
      .gte("created_at", since(DEVICE_LIMIT.windowMin));
    if ((count ?? 0) >= DEVICE_LIMIT.count) return tooMany;
  }
  if (ipHash) {
    const { count } = await db
      .from("customer_feedback" as never)
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gte("created_at", since(IP_LIMIT.windowMin));
    if ((count ?? 0) >= IP_LIMIT.count) return tooMany;
  }

  const { error } = await db.from("customer_feedback" as never).insert({
    branch: target.branch,
    visit_type: v.data.visitType,
    rating: v.data.rating,
    aspects: v.data.aspects,
    comment: v.data.comment,
    product_wish: v.data.productWish,
    aspect_order: v.data.aspectOrder,
    device_id: deviceId,
    ip_hash: ipHash,
  } as never);
  if (error) {
    console.error("[feedback] gagal menyimpan", error.message);
    return { ok: false, error: "Maaf, masukan belum terkirim. Coba lagi ya, kak." };
  }
  return { ok: true };
}

// ── Admin ────────────────────────────────────────────────────────────

export interface FeedbackRow {
  id: string;
  branch: FeedbackBranch;
  visitType: "first" | "returning";
  rating: number;
  aspects: string[];
  comment: string | null;
  productWish: string | null;
  hidden: boolean;
  createdAt: string;
}

export interface FeedbackAdminData {
  rows: FeedbackRow[];
  /** Statistik atas SEMUA feedback tampil pada rentang (bukan hanya baris yang dimuat). */
  stats: {
    count: number;
    average: number | null;
    /** Rata-rata jumlah tombol masukan yang dipilih per pelanggan (tidak menghitung "Sudah bagus semua"). */
    avgAspects: number | null;
    distribution: [number, number, number, number, number];
    firstCount: number;
    returningCount: number;
    aspectCounts: Record<string, number>;
    /** Jumlah per hari kalender WIB (YYYY-MM-DD) pada rentang. */
    perDay: Record<string, number>;
  };
  wishes: { text: string; branch: FeedbackBranch; createdAt: string }[];
  /**
   * Pemeriksaan bias posisi: untuk tiap posisi tampil (1 = paling atas, tombol "Sudah bagus semua" tidak ikut karena selalu
   * terakhir), berapa kali tombol di posisi itu ditampilkan dan berapa kali dipilih. Hanya jawaban yang mencatat urutan.
   */
  position: { responses: number; slots: { shown: number; selected: number }[] };
}

const LIST_LIMIT = 300;

export async function getFeedbackAdminData(input: {
  branch: FeedbackBranch | "all";
  days: number;
}): Promise<ActionResult<FeedbackAdminData>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const days = Math.min(365, Math.max(1, Math.floor(input.days) || 30));
  const today = jakartaDateString(new Date());
  const startIso = wibDayStart(new Date(new Date(`${today}T00:00:00Z`).getTime() - (days - 1) * 86_400_000).toISOString().slice(0, 10));

  const db = createAdminClient();
  type Raw = {
    id: string;
    branch: FeedbackBranch;
    visit_type: "first" | "returning";
    rating: number;
    aspects: string[] | null;
    aspect_order: string[] | null;
    comment: string | null;
    product_wish: string | null;
    hidden: boolean;
    created_at: string;
  };
  const all: Raw[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    let q = db
      .from("customer_feedback" as never)
      .select("id, branch, visit_type, rating, aspects, aspect_order, comment, product_wish, hidden, created_at")
      .gte("created_at", startIso)
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (input.branch !== "all") q = q.eq("branch", input.branch);
    const { data, error } = await q;
    if (error) return { ok: false, error: error.message };
    const page = (data ?? []) as unknown as Raw[];
    all.push(...page);
    if (page.length < PAGE) break;
  }

  const visible = all.filter((r) => !r.hidden);
  const distribution: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  const aspectCounts: Record<string, number> = {};
  const perDay: Record<string, number> = {};
  let sum = 0;
  let firstCount = 0;
  let aspectTotal = 0;
  const slots: { shown: number; selected: number }[] = [];
  let ordered = 0;
  for (const r of visible) {
    if (r.aspect_order && r.aspect_order.length > 0) {
      ordered += 1;
      r.aspect_order
        .filter((k) => k !== ASPECT_ALL_GOOD)
        .forEach((k, i) => {
          slots[i] ??= { shown: 0, selected: 0 };
          slots[i].shown += 1;
          if ((r.aspects ?? []).includes(k)) slots[i].selected += 1;
        });
    }
    aspectTotal += (r.aspects ?? []).filter((a) => a !== ASPECT_ALL_GOOD).length;
    distribution[r.rating - 1] += 1;
    sum += r.rating;
    if (r.visit_type === "first") firstCount += 1;
    for (const a of r.aspects ?? []) aspectCounts[a] = (aspectCounts[a] ?? 0) + 1;
    const d = jakartaDateString(new Date(r.created_at));
    perDay[d] = (perDay[d] ?? 0) + 1;
  }

  return {
    ok: true,
    data: {
      rows: all.slice(0, LIST_LIMIT).map((r) => ({
        id: r.id,
        branch: r.branch,
        visitType: r.visit_type,
        rating: r.rating,
        aspects: r.aspects ?? [],
        comment: r.comment,
        productWish: r.product_wish,
        hidden: r.hidden,
        createdAt: r.created_at,
      })),
      stats: {
        count: visible.length,
        average: visible.length ? sum / visible.length : null,
        avgAspects: visible.length ? aspectTotal / visible.length : null,
        distribution,
        firstCount,
        returningCount: visible.length - firstCount,
        aspectCounts,
        perDay,
      },
      wishes: visible
        .filter((r) => r.product_wish)
        .map((r) => ({ text: r.product_wish as string, branch: r.branch, createdAt: r.created_at })),
      position: { responses: ordered, slots },
    },
  };
}

export async function setFeedbackHidden(id: string, hidden: boolean): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { error } = await createAdminClient()
    .from("customer_feedback" as never)
    .update({ hidden } as never)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/scorecard");
  revalidatePath("/dashboard");
  return { ok: true };
}

// ── POS ──────────────────────────────────────────────────────────────

export interface PosFeedbackToday {
  /** Jumlah feedback tampil yang masuk hari ini (WIB) untuk cabang outlet. */
  count: number;
  target: number;
  branch: FeedbackBranch;
  /** Alamat halaman feedback cabang ini (untuk QR / tautan). */
  path: string;
}

/** Jumlah feedback hari ini untuk kartu target di layar kasir. Hanya outlet Pare dan Semarang; selain itu null. */
export async function getPosFeedbackToday(bankAccountId: string): Promise<ActionResult<PosFeedbackToday | null>> {
  const gate = await requireAdminOrPosAssignee(bankAccountId);
  if (!gate.ok) return { ok: false, error: gate.error };
  const db = createAdminClient();
  const { data: account } = await db.from("bank_accounts").select("default_branch, ledger_account_id").eq("id", bankAccountId).maybeSingle();
  const branch = account?.default_branch;
  // Rekening yang membukukan ke buku lain (Mamaya) tidak punya target feedback sendiri.
  if (account?.ledger_account_id || (branch !== "Pare" && branch !== "Semarang")) return { ok: true, data: null };
  const today = jakartaDateString(new Date());
  const { count, error } = await db
    .from("customer_feedback" as never)
    .select("id", { count: "exact", head: true })
    .eq("branch", branch)
    .eq("hidden", false)
    .gte("created_at", wibDayStart(today));
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { count: count ?? 0, target: FEEDBACK_DAILY_TARGET, branch, path: `/feedback/${branch.toLowerCase()}` } };
}
