"use server";

/**
 * Verifikasi dua pihak untuk poin checklist Tugas Karyawan dan Tiket (migrasi 251).
 *
 * Verifikator melihat daftar "Menunggu verifikasimu" di beranda dan menandai Terverifikasi / Tolak. Satu penolakan
 * mengembalikan pekerjaan ke pekerja (tugas: ronde baru; tiket: dibuka kembali), baris pending lain menjadi 'void'.
 * Semua tulis lewat service-role setelah memeriksa bahwa pemanggil memang verifikator baris itu.
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "./_supabase-admin";
import { getCurrentUser } from "@/lib/supabase/cached";
import type { ActionResult } from "./_gates";
import { sendPushToAdmins, sendPushToUser } from "@/lib/push/web-push";
import { TASK_EVIDENCE_BUCKET } from "@/lib/tasks/types";
import { employeesOfBranch, holderRecipients } from "@/lib/tickets/chain";
import { listVerifierPeople, loadRound, namesOf, voidPending, type VerifierPerson } from "@/lib/verification/server";

/* eslint-disable @typescript-eslint/no-explicit-any -- tabel baru belum ada di types.ts yang di-generate */

export interface PendingVerification {
  id: string;
  kind: "task" | "ticket";
  title: string;
  /** Konteks singkat: siapa yang mengerjakan / cabang. */
  context: string;
  /** Poin checklist yang diverifikasi (khusus tugas). */
  itemTitle: string | null;
  /** Catatan penyelesaian (khusus tiket). */
  note: string | null;
  photoUrls: string[];
  /** Verifikator lain di putaran yang sama. */
  others: { name: string; status: "pending" | "verified" | "rejected" }[];
  at: string;
}

function revalidate() {
  for (const p of ["/dashboard", "/admin", "/admin/tasks", "/tickets", "/admin/tickets"]) revalidatePath(p);
}

/** Orang yang boleh dipilih sebagai verifikator (karyawan & owner aktif). */
export async function listVerifierCandidates(): Promise<VerifierPerson[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  return listVerifierPeople();
}

/** Permintaan verifikasi yang masih menunggu SAYA, beserta bukti & status verifikator lain. */
export async function getMyPendingVerifications(): Promise<PendingVerification[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const db = createAdminClient() as any;
  const { data: mine } = await db
    .from("verifications")
    .select("id, subject_type, subject_id, item_id, round, created_at")
    .eq("verifier_id", user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(100);
  const rows: any[] = mine ?? [];
  if (rows.length === 0) return [];

  const taskIds = [...new Set(rows.filter((r) => r.subject_type === "task").map((r) => r.subject_id as string))];
  const ticketIds = [...new Set(rows.filter((r) => r.subject_type === "ticket").map((r) => r.subject_id as string))];
  const itemIds = [...new Set(rows.map((r) => r.item_id).filter(Boolean) as string[])];

  const [tasksRes, ticketsRes, itemsRes, completionsRes, ticketPhotosRes] = await Promise.all([
    taskIds.length
      ? db.from("assigned_tasks").select("id, title, assignee_id, status, current_round").in("id", taskIds)
      : Promise.resolve({ data: [] }),
    ticketIds.length
      ? db
          .from("tickets")
          .select("id, title, branch, status, confirmed_at, resolved_by, resolution_note")
          .in("id", ticketIds)
      : Promise.resolve({ data: [] }),
    itemIds.length ? db.from("assigned_task_items").select("id, title").in("id", itemIds) : Promise.resolve({ data: [] }),
    itemIds.length
      ? db.from("assigned_task_completions").select("item_id, round, photo_path").in("item_id", itemIds)
      : Promise.resolve({ data: [] }),
    ticketIds.length
      ? db.from("ticket_attachments").select("ticket_id, path").in("ticket_id", ticketIds).eq("kind", "resolution")
      : Promise.resolve({ data: [] }),
  ]);
  const tasks = new Map<string, any>(((tasksRes.data ?? []) as any[]).map((t) => [t.id, t]));
  const tickets = new Map<string, any>(((ticketsRes.data ?? []) as any[]).map((t) => [t.id, t]));
  const itemTitle = new Map<string, string>(((itemsRes.data ?? []) as any[]).map((i) => [i.id, i.title]));

  const personIds = [
    ...new Set([
      ...[...tasks.values()].map((t) => t.assignee_id as string),
      ...[...tickets.values()].map((t) => t.resolved_by as string | null).filter(Boolean) as string[],
    ]),
  ].filter(Boolean);
  const personNames = await namesOf(db, personIds);
  const personName = new Map<string, string>(personIds.map((id, i) => [id, personNames[i]]));

  // Verifikator lain per subjek+putaran.
  const { data: siblingRows } = await db
    .from("verifications")
    .select("subject_type, subject_id, item_id, round, verifier_id, status")
    .in("subject_id", [...taskIds, ...ticketIds])
    .neq("status", "void");
  const siblings: any[] = siblingRows ?? [];
  const siblingNames = await namesOf(db, siblings.map((s) => s.verifier_id as string));
  const siblingName = new Map<string, string>(siblings.map((s, i) => [s.verifier_id, siblingNames[i]]));

  const paths: string[] = [];
  const taskPhoto = (itemId: string | null, round: number) =>
    ((completionsRes.data ?? []) as any[]).find((c) => c.item_id === itemId && c.round === round && c.photo_path)?.photo_path as
      | string
      | undefined;
  for (const r of rows) {
    if (r.subject_type === "task") {
      const p = taskPhoto(r.item_id, r.round);
      if (p) paths.push(p);
    }
  }
  const ticketPaths = ((ticketPhotosRes.data ?? []) as any[]).map((a) => a.path as string);

  const signed = new Map<string, string>();
  const sign = async (bucket: string, list: string[]) => {
    const unique = [...new Set(list.filter(Boolean))];
    if (unique.length === 0) return;
    const { data } = await db.storage.from(bucket).createSignedUrls(unique, 1800);
    for (const s of data ?? []) if (s.path && s.signedUrl) signed.set(`${bucket}:${s.path}`, s.signedUrl);
  };
  await Promise.all([sign(TASK_EVIDENCE_BUCKET, paths), sign("ticket-attachments", ticketPaths)]);

  const out: PendingVerification[] = [];
  for (const r of rows) {
    const others = (subjectId: string, itemId: string | null, round: number) =>
      siblings
        .filter((s) => s.subject_id === subjectId && (s.item_id ?? null) === itemId && s.round === round && s.verifier_id !== user.id)
        .map((s) => ({ name: siblingName.get(s.verifier_id) ?? "—", status: s.status as "pending" | "verified" | "rejected" }));

    if (r.subject_type === "task") {
      const t = tasks.get(r.subject_id);
      // Hanya yang masih berlaku: tugas sedang menunggu review pada putaran ini.
      if (!t || t.status !== "submitted" || t.current_round !== r.round) continue;
      const p = taskPhoto(r.item_id, r.round);
      out.push({
        id: r.id,
        kind: "task",
        title: t.title,
        context: `Dikerjakan ${personName.get(t.assignee_id) ?? "karyawan"}`,
        itemTitle: itemTitle.get(r.item_id) ?? null,
        note: null,
        photoUrls: p && signed.get(`${TASK_EVIDENCE_BUCKET}:${p}`) ? [signed.get(`${TASK_EVIDENCE_BUCKET}:${p}`) as string] : [],
        others: others(r.subject_id, r.item_id ?? null, r.round),
        at: r.created_at,
      });
    } else {
      const t = tickets.get(r.subject_id);
      if (!t || t.status !== "resolved" || t.confirmed_at) continue;
      const urls = ((ticketPhotosRes.data ?? []) as any[])
        .filter((a) => a.ticket_id === t.id)
        .map((a) => signed.get(`ticket-attachments:${a.path}`))
        .filter(Boolean) as string[];
      out.push({
        id: r.id,
        kind: "ticket",
        title: t.title,
        context: `Tiket ${t.branch}${t.resolved_by ? ` · diselesaikan ${personName.get(t.resolved_by) ?? ""}` : ""}`.trim(),
        itemTitle: null,
        note: t.resolution_note ?? null,
        photoUrls: urls,
        others: others(r.subject_id, null, r.round),
        at: r.created_at,
      });
    }
  }
  return out;
}

/** Jumlah permintaan verifikasi yang menunggu saya (untuk lencana). */
export async function countMyPendingVerifications(): Promise<number> {
  return (await getMyPendingVerifications()).length;
}

export async function decideVerification(
  verificationId: string,
  decision: "verify" | "reject",
  note?: string
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const reason = (note ?? "").trim();
  if (decision === "reject" && reason.length < 3) return { ok: false, error: "Alasan penolakan wajib diisi." };
  if (reason.length > 500) return { ok: false, error: "Catatan maksimal 500 karakter." };

  const db = createAdminClient() as any;
  const { data: v } = await db.from("verifications").select("*").eq("id", verificationId).maybeSingle();
  if (!v || v.verifier_id !== user.id) return { ok: false, error: "Permintaan verifikasi tidak ditemukan." };
  if (v.status !== "pending") return { ok: false, error: "Permintaan ini sudah diproses." };

  // Subjek harus masih menunggu verifikasi pada putaran ini.
  const live = await isStillLive(db, v);
  if (!live.ok) {
    await db.from("verifications").update({ status: "void", decided_at: new Date().toISOString() }).eq("id", v.id).eq("status", "pending");
    revalidate();
    return { ok: false, error: "Pekerjaan ini sudah tidak menunggu verifikasi." };
  }

  const now = new Date().toISOString();
  const { data: claimed } = await db
    .from("verifications")
    .update({ status: decision === "verify" ? "verified" : "rejected", note: reason || null, decided_at: now })
    .eq("id", v.id)
    .eq("status", "pending")
    .select("id");
  if (!claimed || claimed.length === 0) return { ok: false, error: "Permintaan ini sudah diproses." };

  const [myName] = await namesOf(db, [user.id]);

  if (decision === "verify") {
    const round = await loadRound(db, v.subject_type, v.subject_id, v.round);
    const allDone = round.filter((r) => r.status !== "void").every((r) => r.status === "verified");
    if (allDone) await notifyAllVerified(db, v, live);
    revalidate();
    return { ok: true };
  }

  const feedback = `Ditolak verifikator ${myName}: ${reason}`;
  if (v.subject_type === "task") await reopenTask(db, v, live.row, feedback, user.id);
  else await reopenTicket(db, v, live.row, feedback);
  await voidPending(db, v.subject_type, v.subject_id, v.round);
  revalidate();
  return { ok: true };
}

async function isStillLive(db: any, v: any): Promise<{ ok: true; row: any } | { ok: false }> {
  if (v.subject_type === "task") {
    const { data: t } = await db
      .from("assigned_tasks")
      .select("id, title, assignee_id, status, current_round")
      .eq("id", v.subject_id)
      .maybeSingle();
    return t && t.status === "submitted" && t.current_round === v.round ? { ok: true, row: t } : { ok: false };
  }
  const { data: t } = await db.from("tickets").select("*").eq("id", v.subject_id).maybeSingle();
  return t && t.status === "resolved" && !t.confirmed_at ? { ok: true, row: t } : { ok: false };
}

async function notifyAllVerified(db: any, v: any, live: { row: any }) {
  try {
    if (v.subject_type === "task") {
      await sendPushToAdmins({
        title: "Semua verifikator sudah setuju ✅",
        body: `"${live.row.title}" siap disetujui.`,
        url: "/admin/tasks",
      });
    } else if (live.row.created_by) {
      await sendPushToUser(live.row.created_by, {
        title: "Tiket sudah terverifikasi ✅",
        body: `"${live.row.title}" lolos verifikasi — silakan konfirmasi selesai.`,
        url: live.row.direction === "down" ? "/admin/tickets" : "/tickets",
      });
    }
  } catch (err) {
    console.error("[verification] push failed", err);
  }
  void db;
}

/** Tugas dikembalikan ke pekerja: ronde baru, catatan = alasan verifikator. */
async function reopenTask(db: any, v: any, task: any, feedback: string, verifierId: string) {
  const now = new Date().toISOString();
  const { data: updated } = await db
    .from("assigned_tasks")
    .update({
      status: "open",
      current_round: task.current_round + 1,
      reviewed_by: verifierId,
      reviewed_at: now,
      review_note: feedback,
      submitted_at: null,
      last_reminded_at: now,
    })
    .eq("id", task.id)
    .eq("status", "submitted")
    .eq("current_round", task.current_round)
    .select("id");
  if (!updated || updated.length === 0) return;
  await db.from("assigned_task_reviews").insert({
    task_id: task.id,
    round: task.current_round,
    decision: "rejected",
    note: feedback,
    reviewed_by: verifierId,
  });
  try {
    await sendPushToUser(task.assignee_id, {
      title: "Tugas perlu diulang 🔁",
      body: `${task.title} belum lolos verifikasi. Buka beranda untuk melihat catatan dan mengulang dari awal.`,
      url: "/dashboard",
    });
  } catch (err) {
    console.error("[verification] push failed", err);
  }
  void v;
}

/** Tiket dibuka kembali ke penanggung jawab tingkatnya (jalur sama dengan 'belum beres' dari pembuat). */
async function reopenTicket(db: any, v: any, row: any, feedback: string) {
  const { data: reopened } = await db
    .from("tickets")
    .update({ status: "in_progress", resolved_at: null, resolved_by: null, resolution_note: null, dispute_note: feedback })
    .eq("id", row.id)
    .eq("status", "resolved")
    .is("confirmed_at", null)
    .select("id");
  if (!reopened || reopened.length === 0) return;
  await db.from("ticket_attachments").update({ kind: "superseded" }).eq("ticket_id", row.id).eq("kind", "resolution");

  const lvl = Number(row.handler_level);
  const targets =
    lvl === 0
      ? row.assignee_id
        ? [row.assignee_id as string]
        : await employeesOfBranch(row.branch_id)
      : lvl >= 99
        ? []
        : await holderRecipients(lvl, row.handler_id ?? null);
  try {
    for (const uid of new Set<string>(targets)) {
      await sendPushToUser(uid, { title: "Tiket dibuka kembali", body: `"${row.title}": ${feedback}`, url: "/tickets" });
    }
    if (lvl >= 99) await sendPushToAdmins({ title: "Tiket dibuka kembali", body: `"${row.title}": ${feedback}`, url: "/admin/tickets" });
  } catch (err) {
    console.error("[verification] push failed", err);
  }
  void v;
}
