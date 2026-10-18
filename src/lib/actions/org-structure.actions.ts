"use server";

/**
 * Struktur organisasi (superadmin): siapa atasan siapa, dikelola lewat papan
 * seret-lepas di /admin/struktur. Datanya tabel `team_members` yang sama dengan
 * Tugas (/tim), Notulen, dan routing Izin — satu hierarki, bukan sistem baru.
 *
 * Owner bukan baris di tabel: orang tanpa atasan otomatis di bawah Owner
 * (fallback routing izin). Jadi "lepas ke Owner" = cabut link atasannya.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "./_supabase-admin";
import { requireAdmin, type ActionResult } from "./_gates";
import { wouldCreateCycle, type OrgLink } from "@/lib/org/hierarchy";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface OrgPerson {
  id: string;
  name: string;
  businessUnit: string | null;
  jobRole: string | null;
}

export interface OrgChartData {
  owner: { id: string; name: string };
  people: OrgPerson[];
  links: OrgLink[];
}

function nameOf(p: any): string {
  return String(p?.full_name ?? "").trim() || String(p?.nickname ?? "").trim() || "—";
}

export async function getOrgChart(): Promise<ActionResult<OrgChartData>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const db = createAdminClient() as any;

  const [{ data: people, error: pErr }, { data: links, error: lErr }, { data: owner }] =
    await Promise.all([
      db
        .from("profiles")
        .select("id, full_name, nickname, business_unit, job_role")
        .eq("role", "employee")
        .eq("is_active", true)
        .order("full_name", { ascending: true }),
      db.from("team_members").select("leader_id, member_id"),
      db.from("profiles").select("id, full_name, nickname").eq("id", gate.userId).maybeSingle(),
    ]);
  if (pErr) return { ok: false, error: pErr.message };
  if (lErr) return { ok: false, error: lErr.message };

  const active = new Set<string>((people ?? []).map((p: any) => p.id));
  return {
    ok: true,
    data: {
      owner: { id: gate.userId, name: nameOf(owner) === "—" ? "Owner" : nameOf(owner) },
      people: (people ?? []).map((p: any) => ({
        id: p.id,
        name: nameOf(p),
        businessUnit: p.business_unit ?? null,
        jobRole: p.job_role ?? null,
      })),
      // Link ke orang nonaktif/di luar daftar disembunyikan supaya papan tak
      // menampilkan simpul hantu; barisnya tidak disentuh.
      links: (links ?? [])
        .filter((l: any) => active.has(l.leader_id) && active.has(l.member_id))
        .map((l: any) => ({ leaderId: l.leader_id, memberId: l.member_id })),
    },
  };
}

const schema = z.object({
  memberId: z.string().uuid(),
  leaderIds: z.array(z.string().uuid()).max(10),
});

/**
 * Ganti SELURUH daftar atasan satu orang. Kosong = langsung di bawah Owner.
 * Tambah dulu, baru hapus yang tak dipilih — kegagalan di tengah tidak
 * meninggalkan orang tanpa atasan (yang berarti izinnya diam-diam ke Owner).
 */
export async function setMemberLeaders(
  input: z.input<typeof schema>
): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Input tidak valid" };
  const { memberId } = parsed.data;
  const leaderIds = [...new Set(parsed.data.leaderIds)];
  if (leaderIds.includes(memberId)) {
    return { ok: false, error: "Seseorang tidak bisa menjadi atasannya sendiri." };
  }

  const db = createAdminClient() as any;

  // Semua yang terlibat harus karyawan aktif (Owner tidak masuk tabel).
  const everyone = [memberId, ...leaderIds];
  const { data: people } = await db
    .from("profiles")
    .select("id, role, is_active")
    .in("id", everyone);
  const ok = new Set<string>(
    (people ?? []).filter((p: any) => p.role === "employee" && p.is_active).map((p: any) => p.id)
  );
  if (everyone.some((id) => !ok.has(id))) {
    return { ok: false, error: "Atasan dan anggota harus karyawan aktif." };
  }

  // Cegah siklus (A atasan B, B atasan A) memakai hierarki yang sekarang.
  if (leaderIds.length > 0) {
    const { data: all, error: allErr } = await db
      .from("team_members")
      .select("leader_id, member_id");
    if (allErr) return { ok: false, error: allErr.message };
    const links: OrgLink[] = (all ?? []).map((l: any) => ({
      leaderId: l.leader_id,
      memberId: l.member_id,
    }));
    for (const leaderId of leaderIds) {
      if (wouldCreateCycle(memberId, leaderId, links)) {
        return {
          ok: false,
          error: "Tidak bisa: orang itu adalah bawahan dari yang akan dijadikan atasannya.",
        };
      }
    }
    const { error: upErr } = await db.from("team_members").upsert(
      leaderIds.map((leader_id) => ({ leader_id, member_id: memberId, created_by: gate.userId })),
      { onConflict: "leader_id,member_id", ignoreDuplicates: true }
    );
    if (upErr) return { ok: false, error: upErr.message };
  }

  let del = db.from("team_members").delete().eq("member_id", memberId);
  if (leaderIds.length > 0) del = del.not("leader_id", "in", `(${leaderIds.join(",")})`);
  const { error: delErr } = await del;
  if (delErr) return { ok: false, error: delErr.message };

  revalidatePath("/admin/struktur");
  revalidatePath("/admin/tasks");
  revalidatePath("/tim");
  revalidatePath("/izin");
  return { ok: true };
}
