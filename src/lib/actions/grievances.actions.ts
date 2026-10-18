"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "./_supabase-admin";
import { requireAdmin } from "./_gates";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { sendPushToAdmins, sendPushToUser } from "@/lib/push/web-push";

/**
 * Kanal Pengaduan HR Berjenjang (PRD-7) — SOP bagian 9.
 *
 * Tier dihitung SAAT SUBMIT:
 *   2 = kepala tim pelapor (leader di `team_members`)
 *   3 = Owner — bila yang dilaporkan adalah pemimpin, kepala tim pelapor
 *       sendiri yang dilaporkan, atau pelapor tidak punya leader tercatat
 *   4 = pihak tepercaya alternatif — bila menyangkut Owner, atau dugaan
 *       pelecehan/kekerasan (boleh langsung ke sini)
 *
 * Kerahasiaan ditegakkan DI SETIAP FUNGSI BACA, bukan cuma di UI: baris
 * `is_anonymous=true` tidak pernah membawa identitas pelapor ke penerima
 * mana pun selain pelapor sendiri.
 *
 * `hr_grievances` / `hr_trusted_contacts` / `team_members` belum di
 * generated `Database` type — pola `db(): any` sama dengan modul PRD
 * lain sesi ini.
 */

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/* eslint-disable @typescript-eslint/no-explicit-any */
function db(): any {
  return createAdminClient();
}

async function leadersOf(userId: string): Promise<string[]> {
  const { data } = await db().from("team_members").select("leader_id").eq("member_id", userId);
  const ids: string[] = (data ?? []).map((r: { leader_id: string }) => r.leader_id);
  return [...new Set(ids)];
}

async function isLeader(userId: string): Promise<boolean> {
  const { data } = await db().from("team_members").select("leader_id").eq("leader_id", userId).limit(1);
  return (data ?? []).length > 0;
}

async function trustedContactIds(): Promise<string[]> {
  const { data } = await db().from("hr_trusted_contacts").select("user_id");
  return (data ?? []).map((r: { user_id: string }) => r.user_id);
}

async function namesFor(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (unique.length === 0) return new Map();
  const { data } = await createAdminClient()
    .from("profiles")
    .select("id, full_name")
    .in("id", unique);
  return new Map((data ?? []).map((p) => [p.id, p.full_name]));
}

/** Tier 2 → leader langsung pelapor. Tier 3 → admin. Tier 4 → trusted
 *  contact, atau admin bila kosong. */
async function recipientsFor(tier: number, reporterId: string, reportedAbout: string | null): Promise<string[]> {
  if (tier === 2) {
    const leaders = await leadersOf(reporterId);
    return leaders.filter((id) => id !== reportedAbout);
  }
  if (tier === 4) {
    const contacts = await trustedContactIds();
    if (contacts.length > 0) return contacts.filter((id) => id !== reportedAbout);
  }
  // Tier 3, atau tier 4 tanpa trusted contact — ke admin.
  const { data } = await createAdminClient().from("profiles").select("id").eq("role", "admin");
  return (data ?? []).map((p) => p.id).filter((id) => id !== reportedAbout);
}

export interface SubmitGrievanceInput {
  isAnonymous: boolean;
  reportedAboutUserId?: string | null;
  isHarassmentOrViolence: boolean;
  description: string;
  witnesses?: string | null;
  desiredOutcome?: string | null;
}

export async function submitGrievance(
  input: SubmitGrievanceInput
): Promise<ActionResult<{ id: string; tier: number }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  if (!input.description.trim()) return { ok: false, error: "Ceritakan kejadiannya dulu" };

  const reportedAbout = input.reportedAboutUserId || null;
  let tier = 2;
  if (input.isHarassmentOrViolence) {
    tier = 4;
  } else if (reportedAbout) {
    const { data: aboutProfile } = await createAdminClient()
      .from("profiles")
      .select("role")
      .eq("id", reportedAbout)
      .maybeSingle();
    if (aboutProfile?.role === "admin") {
      tier = 4;
    } else if (await isLeader(reportedAbout)) {
      tier = 3;
    }
  }
  if (tier === 2) {
    const myLeaders = await leadersOf(user.id);
    const eligibleLeaders = myLeaders.filter((id) => id !== reportedAbout);
    if (eligibleLeaders.length === 0) tier = 3;
  }

  const { data: inserted, error } = await db()
    .from("hr_grievances")
    .insert({
      reporter_id: user.id,
      is_anonymous: input.isAnonymous,
      reported_about_user_id: reportedAbout,
      is_harassment_or_violence: input.isHarassmentOrViolence,
      description: input.description.trim(),
      witnesses: input.witnesses?.trim() || null,
      desired_outcome: input.desiredOutcome?.trim() || null,
      tier,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  const recipients = await recipientsFor(tier, user.id, reportedAbout);
  const title = "Ada pengaduan baru";
  const body = `Tingkat ${tier} — perlu dikonfirmasi dalam 1 hari kerja.`;
  if (recipients.length > 0) {
    await Promise.all(recipients.map((r) => sendPushToUser(r, { title, body, url: "/pengaduan" })));
  } else {
    await sendPushToAdmins({ title, body, url: "/pengaduan" });
  }

  revalidatePath("/pengaduan");
  return { ok: true, data: { id: (inserted as { id: string }).id, tier } };
}

export interface GrievanceView {
  id: string;
  reporterName: string | null;
  isAnonymous: boolean;
  reportedAboutName: string | null;
  isHarassmentOrViolence: boolean;
  description: string;
  witnesses: string | null;
  desiredOutcome: string | null;
  tier: number;
  status: "submitted" | "confirmed" | "investigating" | "decided";
  decision: string | null;
  decidedAt: string | null;
  createdAt: string;
  isMine: boolean;
}

function scrubAndHydrate(
  rows: any[],
  names: Map<string, string>,
  viewerId: string
): GrievanceView[] {
  return rows.map((r) => {
    const isMine = r.reporter_id === viewerId;
    const revealReporter = !r.is_anonymous || isMine;
    return {
      id: r.id,
      reporterName: revealReporter ? names.get(r.reporter_id) ?? null : null,
      isAnonymous: r.is_anonymous,
      reportedAboutName: r.reported_about_user_id ? names.get(r.reported_about_user_id) ?? null : null,
      isHarassmentOrViolence: r.is_harassment_or_violence,
      description: r.description,
      witnesses: r.witnesses,
      desiredOutcome: r.desired_outcome,
      tier: r.tier,
      status: r.status,
      decision: r.decision,
      decidedAt: r.decided_at,
      createdAt: r.created_at,
      isMine,
    };
  });
}

/** Laporan yang PERNAH saya ajukan — saya selalu tahu identitas saya sendiri. */
export async function listMyFiledGrievances(): Promise<GrievanceView[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const { data } = await db()
    .from("hr_grievances")
    .select("*")
    .eq("reporter_id", user.id)
    .order("created_at", { ascending: false });
  const rows = data ?? [];
  const names = await namesFor(rows.flatMap((r: any) => [r.reporter_id, r.reported_about_user_id]));
  return scrubAndHydrate(rows, names, user.id);
}

/**
 * Antrean masuk: admin melihat semua; non-admin hanya laporan di mana
 * mereka memang penerima tier-nya (kepala tim untuk tier 2, trusted
 * contact untuk tier 4) — dan TIDAK PERNAH laporan tentang dirinya sendiri
 * sebagai pihak yang dilaporkan, meski ia leader/trusted contact.
 */
export async function listGrievanceInbox(): Promise<GrievanceView[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const role = await getCurrentRole();

  let rows: any[] = [];
  if (role === "admin") {
    const { data } = await db().from("hr_grievances").select("*").order("created_at", { ascending: false });
    rows = (data ?? []).filter((r: any) => r.reported_about_user_id !== user.id);
  } else {
    const [myLeaderLinks, contacts] = await Promise.all([
      db().from("team_members").select("member_id").eq("leader_id", user.id),
      trustedContactIds(),
    ]);
    const rawMemberIds: string[] = (myLeaderLinks.data ?? []).map(
      (l: { member_id: string }) => l.member_id
    );
    const memberIds = [...new Set(rawMemberIds)];
    const isTrustedContact = contacts.includes(user.id);

    const filters: any[] = [];
    if (memberIds.length > 0) {
      const { data } = await db()
        .from("hr_grievances")
        .select("*")
        .eq("tier", 2)
        .in("reporter_id", memberIds)
        .neq("reported_about_user_id", user.id);
      filters.push(...(data ?? []));
    }
    if (isTrustedContact) {
      const { data } = await db().from("hr_grievances").select("*").eq("tier", 4);
      filters.push(...(data ?? []));
    }
    rows = filters
      .filter((r) => r.reported_about_user_id !== user.id)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }

  const names = await namesFor(rows.flatMap((r: any) => [r.reporter_id, r.reported_about_user_id]));
  return scrubAndHydrate(rows, names, user.id);
}

export async function confirmGrievance(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const { error } = await db()
    .from("hr_grievances")
    .update({ status: "confirmed", confirmed_by: user.id, confirmed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "submitted");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/pengaduan");
  return { ok: true };
}

export async function decideGrievance(input: { id: string; decision: string }): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  if (!input.decision.trim()) return { ok: false, error: "Isi keputusannya" };

  const { data: rowData } = await db()
    .from("hr_grievances")
    .select("id, reporter_id, is_anonymous")
    .eq("id", input.id)
    .maybeSingle();
  const row = rowData as { id: string; reporter_id: string; is_anonymous: boolean } | null;
  if (!row) return { ok: false, error: "Laporan tidak ditemukan" };

  const { error } = await db()
    .from("hr_grievances")
    .update({
      status: "decided",
      decision: input.decision.trim(),
      decided_by: user.id,
      decided_at: new Date().toISOString(),
    })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };

  await sendPushToUser(row.reporter_id, {
    title: "Keputusan pengaduanmu",
    body: input.decision.slice(0, 140),
    url: "/pengaduan",
  });

  revalidatePath("/pengaduan");
  return { ok: true };
}

/** Karyawan aktif (semua BU) selain diri sendiri — dropdown "pihak yang
 *  dilaporkan" dan pemilihan trusted contact admin. */
export async function listEmployeesForGrievance(): Promise<{ id: string; name: string }[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const { data } = await createAdminClient()
    .from("profiles")
    .select("id, full_name")
    .eq("role", "employee")
    .eq("is_active", true)
    .neq("id", user.id)
    .order("full_name", { ascending: true });
  return (data ?? []).map((p) => ({ id: p.id, name: p.full_name }));
}

export async function listTrustedContacts(): Promise<{ id: string; name: string }[]> {
  const gate = await requireAdmin();
  if (!gate.ok) return [];
  const { data } = await db().from("hr_trusted_contacts").select("user_id");
  const ids: string[] = (data ?? []).map((r: { user_id: string }) => r.user_id);
  const names = await namesFor(ids);
  return ids.map((id) => ({ id, name: names.get(id) ?? "—" }));
}

export async function addTrustedContact(userId: string): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const { error } = await db()
    .from("hr_trusted_contacts")
    .upsert({ user_id: userId, added_by: gate.userId }, { onConflict: "user_id", ignoreDuplicates: true });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/pengaduan");
  return { ok: true };
}

export async function removeTrustedContact(userId: string): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const { error } = await db().from("hr_trusted_contacts").delete().eq("user_id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/pengaduan");
  return { ok: true };
}
