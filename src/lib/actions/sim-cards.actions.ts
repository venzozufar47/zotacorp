"use server";

/**
 * Server actions manajemen kartu SIM lintas unit bisnis.
 *
 * Gate pola `_gates.ts`; master data admin-only, pencatatan isi pulsa boleh
 * admin ATAU PIC terdaftar kartu tsb. Query pakai `.from("sim_cards" as
 * never)` (types hand-maintained di `src/lib/sim-cards/types.ts`).
 *
 * Aturan kunci: `recordSimTopup` MENOLAK tanpa `proofPath` — memperbarui
 * tenggat wajib disertai bukti screenshot.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "./_supabase-admin";
import { getCurrentUser } from "@/lib/supabase/cached";
import {
  requireSimAdmin,
  requireSimCardActor,
  type ActionResult,
} from "./_gates";
import { jakartaDateString } from "@/lib/utils/jakarta";
import {
  isSimOverdue,
  simStatus,
  type SimCard,
  type SimTopup,
} from "@/lib/sim-cards/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const ymd = z.string().regex(YMD, "Format tanggal harus YYYY-MM-DD");

/** Hari ini di WIB — dasar perhitungan status. */
function todayWib(): string {
  return jakartaDateString(new Date());
}

// ─── Hydrate ────────────────────────────────────────────────────────────
/**
 * Map row DB → SimCard, melengkapi nama unit bisnis + identitas PIC.
 * PIC terdaftar → nama & WA diambil dari profil (selalu terkini); PIC
 * manual → pakai kolom pic_name/pic_phone.
 */
async function hydrate(rows: any[]): Promise<SimCard[]> {
  if (rows.length === 0) return [];
  const admin = createAdminClient() as any;

  const buIds = Array.from(new Set(rows.map((r) => r.business_unit_id)));
  const picIds = Array.from(
    new Set(rows.map((r) => r.pic_user_id).filter(Boolean))
  );

  const [{ data: bus }, { data: profs }] = await Promise.all([
    admin.from("business_units").select("id, name").in("id", buIds),
    picIds.length > 0
      ? admin
          .from("profiles")
          .select("id, full_name, nickname, whatsapp_number")
          .in("id", picIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const buById = new Map<string, string>(
    ((bus ?? []) as any[]).map((b) => [b.id, b.name])
  );
  const profById = new Map<string, any>(
    ((profs ?? []) as any[]).map((p) => [p.id, p])
  );

  return rows.map((r) => {
    const p = r.pic_user_id ? profById.get(r.pic_user_id) : null;
    return {
      id: r.id,
      businessUnitId: r.business_unit_id,
      businessUnitName: buById.get(r.business_unit_id) ?? "—",
      phoneNumber: r.phone_number,
      provider: r.provider ?? null,
      label: r.label ?? null,
      picUserId: r.pic_user_id ?? null,
      picName: p
        ? p.nickname?.trim() || p.full_name || "Karyawan"
        : (r.pic_name ?? null),
      picPhone: p ? (p.whatsapp_number ?? null) : (r.pic_phone ?? null),
      picIsUser: Boolean(r.pic_user_id),
      activeUntil: r.active_until ?? null,
      graceUntil: r.grace_until ?? null,
      notes: r.notes ?? null,
      isActive: r.is_active,
      createdAt: r.created_at,
    } satisfies SimCard;
  });
}

const CARD_COLS =
  "id, business_unit_id, phone_number, provider, label, pic_user_id, pic_name, pic_phone, active_until, grace_until, notes, is_active, created_at";

// ─── Read ───────────────────────────────────────────────────────────────
/**
 * Daftar kartu. Admin → semua (opsional termasuk arsip); PIC → hanya
 * kartu miliknya. Non-admin non-PIC → kosong.
 */
export async function listSimCards(
  includeArchived = false
): Promise<SimCard[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const admin = createAdminClient() as any;
  const isAdmin = (await requireSimAdmin()).ok;

  let q = admin.from("sim_cards").select(CARD_COLS);
  if (!includeArchived) q = q.eq("is_active", true);
  if (!isAdmin) q = q.eq("pic_user_id", user.id);
  const { data, error } = await q.order("created_at", { ascending: true });
  if (error) return [];
  return await hydrate((data ?? []) as any[]);
}

/** Kartu yang sudah lewat tenggat (grace/expired) — inbox admin + cron. */
export async function getOverdueSimCards(): Promise<SimCard[]> {
  const gate = await requireSimAdmin();
  if (!gate.ok) return [];
  const cards = await listSimCards(false);
  const today = todayWib();
  return cards.filter((c) => isSimOverdue(simStatus(c, today)));
}

export async function listSimTopups(
  simCardId: string
): Promise<ActionResult<SimTopup[]>> {
  const gate = await requireSimCardActor(simCardId);
  if (!gate.ok) return { ok: false, error: gate.error };
  const admin = createAdminClient() as any;
  const { data, error } = await admin
    .from("sim_card_topups")
    .select(
      "id, sim_card_id, topped_up_by, proof_path, new_active_until, new_grace_until, amount_idr, note, created_at"
    )
    .eq("sim_card_id", simCardId)
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message };

  const rows = (data ?? []) as any[];
  const ids = Array.from(new Set(rows.map((r) => r.topped_up_by).filter(Boolean)));
  const byId = new Map<string, string>();
  if (ids.length > 0) {
    const { data: profs } = await admin
      .from("profiles")
      .select("id, full_name, nickname")
      .in("id", ids);
    for (const p of (profs ?? []) as any[]) {
      byId.set(p.id, p.nickname?.trim() || p.full_name || "Karyawan");
    }
  }

  return {
    ok: true,
    data: rows.map((r) => ({
      id: r.id,
      simCardId: r.sim_card_id,
      toppedUpBy: r.topped_up_by ?? null,
      toppedUpByName: r.topped_up_by ? (byId.get(r.topped_up_by) ?? null) : null,
      proofPath: r.proof_path,
      newActiveUntil: r.new_active_until ?? null,
      newGraceUntil: r.new_grace_until ?? null,
      amountIdr: r.amount_idr ?? null,
      note: r.note ?? null,
      createdAt: r.created_at,
    })),
  };
}

/** Signed URL bukti isi pulsa (10 menit). Admin, atau PIC pemilik kartu. */
export async function getSimProofSignedUrl(
  path: string
): Promise<ActionResult<{ url: string }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const admin = createAdminClient() as any;

  const isAdmin = (await requireSimAdmin()).ok;
  if (!isAdmin) {
    const { data: t } = await admin
      .from("sim_card_topups")
      .select("sim_card_id")
      .eq("proof_path", path)
      .maybeSingle();
    if (!t) return { ok: false, error: "Bukti tidak ditemukan" };
    const gate = await requireSimCardActor(t.sim_card_id);
    if (!gate.ok) return { ok: false, error: "Forbidden" };
  }

  const { data, error } = await admin.storage
    .from("sim-topup-proofs")
    .createSignedUrl(path, 600);
  if (error || !data?.signedUrl)
    return { ok: false, error: error?.message ?? "Gagal membuat URL" };
  return { ok: true, data: { url: data.signedUrl } };
}

// ─── Master data (admin) ────────────────────────────────────────────────
const cardSchema = z
  .object({
    businessUnitId: z.string().uuid("Unit bisnis wajib dipilih"),
    phoneNumber: z.string().trim().min(5, "Nomor minimal 5 digit").max(30),
    provider: z.string().trim().max(40).optional().nullable(),
    label: z.string().trim().max(80).optional().nullable(),
    picUserId: z.string().uuid().optional().nullable(),
    picName: z.string().trim().max(80).optional().nullable(),
    picPhone: z.string().trim().max(30).optional().nullable(),
    activeUntil: ymd.optional().nullable(),
    graceUntil: ymd.optional().nullable(),
    notes: z.string().trim().max(500).optional().nullable(),
  })
  .refine(
    (v) => Boolean(v.picUserId) || (Boolean(v.picName) && Boolean(v.picPhone)),
    { message: "Pilih karyawan, atau isi nama + nomor WA penanggung jawab" }
  )
  // Masa tenggang selalu SESUDAH masa aktif. Kalau terbalik, perhitungan
  // status jadi rancu (kartu terbaca "hangus" padahal masih aktif).
  .refine((v) => !(v.activeUntil && v.graceUntil) || v.graceUntil >= v.activeUntil, {
    message: "Masa tenggang tidak boleh lebih awal dari masa aktif",
  });

export type SimCardInput = z.infer<typeof cardSchema>;

function toRow(input: SimCardInput) {
  // PIC terdaftar dan PIC manual saling eksklusif — hindari data rancu.
  const asUser = Boolean(input.picUserId);
  return {
    business_unit_id: input.businessUnitId,
    phone_number: input.phoneNumber,
    provider: input.provider || null,
    label: input.label || null,
    pic_user_id: asUser ? input.picUserId : null,
    pic_name: asUser ? null : input.picName || null,
    pic_phone: asUser ? null : input.picPhone || null,
    active_until: input.activeUntil || null,
    grace_until: input.graceUntil || null,
    notes: input.notes || null,
  };
}

function revalidateSim() {
  try {
    revalidatePath("/admin/sim-cards");
    revalidatePath("/sim-cards");
    revalidatePath("/admin");
  } catch {
    // abaikan kegagalan revalidate
  }
}

export async function createSimCard(
  input: SimCardInput
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireSimAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const parsed = cardSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Input tidak valid" };

  const admin = createAdminClient() as any;
  const { data, error } = await admin
    .from("sim_cards")
    .insert({ ...toRow(parsed.data), created_by: gate.userId })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505")
      return { ok: false, error: "Nomor ini sudah terdaftar & masih aktif" };
    return { ok: false, error: error.message };
  }
  revalidateSim();
  return { ok: true, data: { id: data.id } };
}

export async function updateSimCard(
  id: string,
  input: SimCardInput
): Promise<ActionResult> {
  const gate = await requireSimAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const parsed = cardSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Input tidak valid" };

  const admin = createAdminClient() as any;
  const { error } = await admin.from("sim_cards").update(toRow(parsed.data)).eq("id", id);
  if (error) {
    if (error.code === "23505")
      return { ok: false, error: "Nomor ini sudah terdaftar & masih aktif" };
    return { ok: false, error: error.message };
  }
  revalidateSim();
  return { ok: true };
}

/** Arsip / aktifkan kembali (bukan hard delete — riwayat top-up tetap ada). */
export async function setSimCardArchived(
  id: string,
  archived: boolean
): Promise<ActionResult> {
  const gate = await requireSimAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const admin = createAdminClient() as any;
  const { error } = await admin
    .from("sim_cards")
    .update({ is_active: !archived })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidateSim();
  return { ok: true };
}

// ─── Isi pulsa (admin atau PIC) ─────────────────────────────────────────
const topupSchema = z.object({
  simCardId: z.string().uuid(),
  /** WAJIB — path bukti di bucket `sim-topup-proofs`. */
  proofPath: z.string().trim().min(1, "Bukti screenshot wajib diunggah"),
  newActiveUntil: ymd,
  newGraceUntil: ymd.optional().nullable(),
  amountIdr: z.number().int().nonnegative().optional().nullable(),
  note: z.string().trim().max(300).optional().nullable(),
});

export type SimTopupInput = z.infer<typeof topupSchema>;

/**
 * Catat isi pulsa + perbarui tenggat. Ini yang MENGHENTIKAN reminder:
 * begitu active_until melewati hari ini, kartu keluar dari daftar overdue.
 */
export async function recordSimTopup(
  input: SimTopupInput
): Promise<ActionResult> {
  const parsed = topupSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  const v = parsed.data;

  if (v.newGraceUntil && v.newGraceUntil < v.newActiveUntil)
    return {
      ok: false,
      error: "Masa tenggang tidak boleh lebih awal dari masa aktif",
    };

  const gate = await requireSimCardActor(v.simCardId);
  if (!gate.ok) return { ok: false, error: gate.error };

  const admin = createAdminClient() as any;

  // Bukti harus BENAR-BENAR ada di bucket & diunggah oleh akun ini.
  // Tanpa cek ini, string path sembarang bisa "mematikan" reminder tanpa
  // bukti sungguhan (path convention: `${uid}/${uuid}.ext`).
  const slash = v.proofPath.indexOf("/");
  if (slash <= 0) return { ok: false, error: "Path bukti tidak valid" };
  const folder = v.proofPath.slice(0, slash);
  const fileName = v.proofPath.slice(slash + 1);
  if (folder !== gate.userId)
    return { ok: false, error: "Bukti harus diunggah dari akun ini" };
  const { data: files } = await admin.storage
    .from("sim-topup-proofs")
    .list(folder, { search: fileName, limit: 100 });
  const exists = ((files ?? []) as any[]).some((f) => f.name === fileName);
  if (!exists)
    return { ok: false, error: "File bukti tidak ditemukan — ulangi unggah" };

  const { error: insErr } = await admin.from("sim_card_topups").insert({
    sim_card_id: v.simCardId,
    topped_up_by: gate.userId,
    proof_path: v.proofPath,
    new_active_until: v.newActiveUntil,
    new_grace_until: v.newGraceUntil || null,
    amount_idr: v.amountIdr ?? null,
    note: v.note || null,
  });
  if (insErr) return { ok: false, error: insErr.message };

  const patch: Record<string, string | null> = {
    active_until: v.newActiveUntil,
  };
  if (v.newGraceUntil) patch.grace_until = v.newGraceUntil;
  const { error: updErr } = await admin
    .from("sim_cards")
    .update(patch)
    .eq("id", v.simCardId);
  if (updErr) return { ok: false, error: updErr.message };

  revalidateSim();
  return { ok: true };
}
