"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "./_supabase-admin";
import { requireAdmin } from "./_gates";
import { getCurrentUser } from "@/lib/supabase/cached";
import { sendPushToUser } from "@/lib/push/web-push";
import type { Json } from "@/lib/supabase/types";
import {
  computeTotal,
  validateMetricScores,
  type Evaluation360MetricScores,
} from "@/lib/evaluation-360/rubric";
import type { ActionResult } from "./_gates";

/**
 * Server actions fitur Evaluasi 360°.
 *
 * Alur: admin buat round + pilih kohort (createRound) → semua peserta
 * saling menilai satu sama lain (round-robin penuh, tanpa self-rating) →
 * tiap submit satu form (submitEvaluation360) → admin lihat rekap penuh
 * dengan atribusi evaluator (getRoundDetail) dan mencatat "Lembar
 * Ringkasan" per subjek (saveSubjectNotes) → tutup round (closeRound).
 *
 * Hasil (skor + alasan) ADMIN-ONLY — subjek yang dievaluasi tidak pernah
 * melihatnya. Tabel `evaluation_360_responses` sengaja tidak punya select
 * policy untuk karyawan (lihat migration 147), jadi semua baca sisi
 * karyawan lewat action ini, pakai service-role client, self-only.
 */

interface RoundRow {
  id: string;
  title: string;
  status: "active" | "closed";
  created_at: string;
  closed_at: string | null;
}

interface ParticipantRow {
  round_id: string;
  user_id: string;
}

interface ResponseRow {
  id: string;
  round_id: string;
  rater_id: string;
  subject_id: string;
  metric_scores: Evaluation360MetricScores;
  total_score: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface SubjectNotesRow {
  round_id: string;
  subject_id: string;
  kesimpulan: string | null;
  target_perbaikan: string | null;
  cara_pengecekan: string | null;
  target_completion_date: string | null;
  updated_at: string;
}

interface ProfileLite {
  id: string;
  full_name: string | null;
  nickname: string | null;
}

// ─── Admin ────────────────────────────────────────────────────────────────

export interface CreateRoundInput {
  title: string;
  participantUserIds: string[];
}

/** Buat round baru + push notifikasi ke semua peserta. */
export async function createRound(
  input: CreateRoundInput
): Promise<ActionResult<{ roundId: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const title = input.title.trim();
  if (!title) return { ok: false, error: "Judul round wajib diisi." };

  const participantIds = Array.from(new Set(input.participantUserIds));
  if (participantIds.length < 2) {
    return { ok: false, error: "Minimal 2 peserta untuk evaluasi 360°." };
  }

  const admin = createAdminClient();

  const { data: round, error: roundErr } = await admin
    .from("evaluation_360_rounds")
    .insert({ title, created_by: gate.userId })
    .select("id")
    .single();
  if (roundErr || !round) {
    return { ok: false, error: roundErr?.message ?? "Gagal membuat round." };
  }
  const roundId = (round as { id: string }).id;

  const { error: partErr } = await admin
    .from("evaluation_360_participants")
    .insert(
      participantIds.map((userId) => ({
        round_id: roundId,
        user_id: userId,
      }))
    );
  if (partErr) {
    // Rollback — jangan tinggalkan round kosong tanpa peserta (mis. salah
    // satu userId sudah tidak ada / FK gagal).
    await admin.from("evaluation_360_rounds").delete().eq("id", roundId);
    return { ok: false, error: partErr.message };
  }

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, full_name, nickname")
    .in("id", participantIds);

  await Promise.all(
    (profiles ?? []).map(async (p) => {
      try {
        await sendPushToUser(p.id, {
          title: "Evaluasi 360° menunggu",
          body: `Kamu diminta mengisi evaluasi untuk rekan satu timmu — "${title}".`,
          url: "/evaluasi",
        });
      } catch (err) {
        console.error("[evaluation-360] push notify failed", err);
      }
    })
  );

  revalidatePath("/admin/evaluasi-360");
  return { ok: true, data: { roundId } };
}

export interface RoundOverviewRow {
  id: string;
  title: string;
  status: "active" | "closed";
  createdAt: string;
  closedAt: string | null;
  participantCount: number;
  submittedCount: number;
  totalSlots: number;
}

/** List semua round + progres (submitted / N×(N-1) total slot). */
export async function getRoundsOverview(): Promise<{ rows: RoundOverviewRow[] }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { rows: [] };

  const admin = createAdminClient();
  const [{ data: rounds }, { data: participants }, { data: responses }] =
    await Promise.all([
      admin
        .from("evaluation_360_rounds")
        .select("*")
        .order("created_at", { ascending: false }),
      admin.from("evaluation_360_participants").select("round_id, user_id"),
      admin.from("evaluation_360_responses").select("round_id"),
    ]);

  const participantsByRound = new Map<string, number>();
  for (const p of (participants ?? []) as unknown as ParticipantRow[]) {
    participantsByRound.set(p.round_id, (participantsByRound.get(p.round_id) ?? 0) + 1);
  }
  const submittedByRound = new Map<string, number>();
  for (const r of (responses ?? []) as unknown as { round_id: string }[]) {
    submittedByRound.set(r.round_id, (submittedByRound.get(r.round_id) ?? 0) + 1);
  }

  const rows: RoundOverviewRow[] = ((rounds ?? []) as unknown as RoundRow[]).map((r) => {
    const n = participantsByRound.get(r.id) ?? 0;
    return {
      id: r.id,
      title: r.title,
      status: r.status,
      createdAt: r.created_at,
      closedAt: r.closed_at,
      participantCount: n,
      submittedCount: submittedByRound.get(r.id) ?? 0,
      totalSlots: n * (n - 1),
    };
  });
  return { rows };
}

export interface RoundParticipantDTO {
  userId: string;
  fullName: string;
  nickname: string | null;
  submittedCount: number; // dari (N-1) form yang harus diisi orang ini
  receivedCount: number; // berapa evaluator sudah menilai orang ini
}

export interface RoundResponseDTO {
  raterId: string;
  raterName: string;
  metricScores: Evaluation360MetricScores;
  totalScore: number;
  notes: string | null;
  submittedAt: string;
}

export interface SubjectNotesDTO {
  kesimpulan: string;
  targetPerbaikan: string;
  caraPengecekan: string;
  targetCompletionDate: string;
}

export interface RoundDetailDTO {
  round: {
    id: string;
    title: string;
    status: "active" | "closed";
    createdAt: string;
    closedAt: string | null;
  };
  participants: RoundParticipantDTO[];
  responsesBySubject: Record<string, RoundResponseDTO[]>;
  notesBySubject: Record<string, SubjectNotesDTO>;
}

/** Detail satu round: progres per peserta + rekap penuh per subjek. */
export async function getRoundDetail(roundId: string): Promise<RoundDetailDTO | null> {
  const gate = await requireAdmin();
  if (!gate.ok) return null;

  const admin = createAdminClient();
  const [{ data: round }, { data: participants }, { data: responses }, { data: notes }] =
    await Promise.all([
      admin.from("evaluation_360_rounds").select("*").eq("id", roundId).maybeSingle(),
      admin
        .from("evaluation_360_participants")
        .select("user_id")
        .eq("round_id", roundId),
      admin
        .from("evaluation_360_responses")
        .select("*")
        .eq("round_id", roundId),
      admin
        .from("evaluation_360_subject_notes")
        .select("*")
        .eq("round_id", roundId),
    ]);
  if (!round) return null;

  const participantIds = ((participants ?? []) as unknown as { user_id: string }[]).map(
    (p) => p.user_id
  );
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, full_name, nickname")
    .in("id", participantIds.length > 0 ? participantIds : [""]);
  const profileById = new Map(
    ((profiles ?? []) as ProfileLite[]).map((p) => [p.id, p])
  );

  const responseRows = (responses ?? []) as unknown as ResponseRow[];
  const submittedByRater = new Map<string, number>();
  const receivedBySubject = new Map<string, number>();
  const responsesBySubject: Record<string, RoundResponseDTO[]> = {};
  for (const r of responseRows) {
    submittedByRater.set(r.rater_id, (submittedByRater.get(r.rater_id) ?? 0) + 1);
    receivedBySubject.set(r.subject_id, (receivedBySubject.get(r.subject_id) ?? 0) + 1);
    (responsesBySubject[r.subject_id] ??= []).push({
      raterId: r.rater_id,
      raterName:
        profileById.get(r.rater_id)?.nickname ||
        profileById.get(r.rater_id)?.full_name ||
        "—",
      metricScores: r.metric_scores,
      totalScore: r.total_score,
      notes: r.notes,
      submittedAt: r.created_at,
    });
  }

  const participantsDTO: RoundParticipantDTO[] = participantIds.map((userId) => ({
    userId,
    fullName: profileById.get(userId)?.full_name ?? "—",
    nickname: profileById.get(userId)?.nickname ?? null,
    submittedCount: submittedByRater.get(userId) ?? 0,
    receivedCount: receivedBySubject.get(userId) ?? 0,
  }));

  const notesBySubject: Record<string, SubjectNotesDTO> = {};
  for (const n of (notes ?? []) as unknown as SubjectNotesRow[]) {
    notesBySubject[n.subject_id] = {
      kesimpulan: n.kesimpulan ?? "",
      targetPerbaikan: n.target_perbaikan ?? "",
      caraPengecekan: n.cara_pengecekan ?? "",
      targetCompletionDate: n.target_completion_date ?? "",
    };
  }

  const r = round as unknown as RoundRow;
  return {
    round: {
      id: r.id,
      title: r.title,
      status: r.status,
      createdAt: r.created_at,
      closedAt: r.closed_at,
    },
    participants: participantsDTO,
    responsesBySubject,
    notesBySubject,
  };
}

export interface SaveSubjectNotesInput {
  roundId: string;
  subjectId: string;
  kesimpulan: string;
  targetPerbaikan: string;
  caraPengecekan: string;
  targetCompletionDate: string; // yyyy-mm-dd atau ""
}

/** Simpan / update "Lembar Ringkasan" admin untuk satu subjek. */
export async function saveSubjectNotes(
  input: SaveSubjectNotesInput
): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const admin = createAdminClient();
  const { error } = await admin
    .from("evaluation_360_subject_notes")
    .upsert(
      {
        round_id: input.roundId,
        subject_id: input.subjectId,
        kesimpulan: input.kesimpulan.trim() || null,
        target_perbaikan: input.targetPerbaikan.trim() || null,
        cara_pengecekan: input.caraPengecekan.trim() || null,
        target_completion_date: input.targetCompletionDate || null,
        updated_by: gate.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "round_id,subject_id" }
    );
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/evaluasi-360/${input.roundId}`);
  return { ok: true };
}

/** Tutup round — submit/edit ditolak begitu closed. */
export async function closeRound(roundId: string): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const admin = createAdminClient();
  const { error } = await admin
    .from("evaluation_360_rounds")
    .update({
      status: "closed",
      closed_at: new Date().toISOString(),
      closed_by: gate.userId,
    })
    .eq("id", roundId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/evaluasi-360");
  revalidatePath(`/admin/evaluasi-360/${roundId}`);
  return { ok: true };
}

// ─── Karyawan ─────────────────────────────────────────────────────────────

export interface PendingEvaluation360DTO {
  roundId: string;
  roundTitle: string;
  subjectId: string;
  subjectName: string;
  submitted: boolean;
}

/**
 * Worklist evaluasi milik karyawan yang login: round aktif tempat dia
 * jadi peserta, dikurangi peer mana yang sudah/belum dinilai. Self-only —
 * tidak pernah menerima userId dari klien (cegah IDOR).
 */
export async function getMyPending360Evaluations(): Promise<{
  items: PendingEvaluation360DTO[];
}> {
  const user = await getCurrentUser();
  if (!user) return { items: [] };

  const admin = createAdminClient();

  const { data: myRows } = await admin
    .from("evaluation_360_participants")
    .select("round_id")
    .eq("user_id", user.id);
  const myRoundIds = ((myRows ?? []) as unknown as { round_id: string }[]).map(
    (r) => r.round_id
  );
  if (myRoundIds.length === 0) return { items: [] };

  const { data: rounds } = await admin
    .from("evaluation_360_rounds")
    .select("id, title, status")
    .in("id", myRoundIds)
    .eq("status", "active");
  const activeRounds = (rounds ?? []) as unknown as {
    id: string;
    title: string;
    status: string;
  }[];
  if (activeRounds.length === 0) return { items: [] };
  const activeRoundIds = activeRounds.map((r) => r.id);

  const { data: allParticipants } = await admin
    .from("evaluation_360_participants")
    .select("round_id, user_id")
    .in("round_id", activeRoundIds);
  const peersByRound = new Map<string, string[]>();
  for (const p of (allParticipants ?? []) as unknown as ParticipantRow[]) {
    if (p.user_id === user.id) continue;
    (peersByRound.get(p.round_id) ?? peersByRound.set(p.round_id, []).get(p.round_id)!).push(
      p.user_id
    );
  }

  const { data: myResponses } = await admin
    .from("evaluation_360_responses")
    .select("round_id, subject_id")
    .eq("rater_id", user.id)
    .in("round_id", activeRoundIds);
  const submittedPairs = new Set(
    ((myResponses ?? []) as unknown as { round_id: string; subject_id: string }[]).map(
      (r) => `${r.round_id}:${r.subject_id}`
    )
  );

  const peerIds = Array.from(new Set(Array.from(peersByRound.values()).flat()));
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, full_name, nickname")
    .in("id", peerIds.length > 0 ? peerIds : [""]);
  const profileById = new Map(
    ((profiles ?? []) as ProfileLite[]).map((p) => [p.id, p])
  );

  const items: PendingEvaluation360DTO[] = [];
  for (const round of activeRounds) {
    for (const subjectId of peersByRound.get(round.id) ?? []) {
      items.push({
        roundId: round.id,
        roundTitle: round.title,
        subjectId,
        subjectName:
          profileById.get(subjectId)?.nickname ||
          profileById.get(subjectId)?.full_name ||
          "—",
        submitted: submittedPairs.has(`${round.id}:${subjectId}`),
      });
    }
  }
  return { items };
}

export interface MyEvaluation360FormDTO {
  roundTitle: string;
  roundStatus: "active" | "closed";
  subjectName: string;
  existing: {
    scores: Evaluation360MetricScores;
    notes: string;
  } | null;
}

/**
 * Data untuk halaman form satu pasangan (round, subject): judul round,
 * nama subjek, dan jawaban sebelumnya (kalau sudah pernah submit — form
 * boleh diedit sebelum round ditutup). Self-only, IDOR-safe: subjectId
 * cuma dipakai untuk lookup nama & jawaban milik rater yang login.
 */
export async function getMy360EvaluationForm(
  roundId: string,
  subjectId: string
): Promise<MyEvaluation360FormDTO | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  if (subjectId === user.id) return null;

  const admin = createAdminClient();

  const [{ data: round }, { data: coParticipants }, { data: existing }] =
    await Promise.all([
      admin
        .from("evaluation_360_rounds")
        .select("title, status")
        .eq("id", roundId)
        .maybeSingle(),
      admin
        .from("evaluation_360_participants")
        .select("user_id")
        .eq("round_id", roundId)
        .in("user_id", [user.id, subjectId]),
      admin
        .from("evaluation_360_responses")
        .select("metric_scores, notes")
        .eq("round_id", roundId)
        .eq("rater_id", user.id)
        .eq("subject_id", subjectId)
        .maybeSingle(),
    ]);
  if (!round) return null;

  const ids = new Set(
    ((coParticipants ?? []) as unknown as { user_id: string }[]).map((p) => p.user_id)
  );
  if (!ids.has(user.id) || !ids.has(subjectId)) return null;

  const { data: subjectProfile } = await admin
    .from("profiles")
    .select("full_name, nickname")
    .eq("id", subjectId)
    .maybeSingle();

  const r = round as unknown as { title: string; status: "active" | "closed" };
  const ex = existing as unknown as {
    metric_scores: Evaluation360MetricScores;
    notes: string | null;
  } | null;

  return {
    roundTitle: r.title,
    roundStatus: r.status,
    subjectName:
      (subjectProfile as ProfileLite | null)?.nickname ||
      (subjectProfile as ProfileLite | null)?.full_name ||
      "—",
    existing: ex ? { scores: ex.metric_scores, notes: ex.notes ?? "" } : null,
  };
}

export interface SubmitEvaluation360Input {
  roundId: string;
  subjectId: string;
  scores: Evaluation360MetricScores;
  notes?: string;
}

/** Submit (atau update sebelum round ditutup) satu form evaluasi peer. */
export async function submitEvaluation360(
  input: SubmitEvaluation360Input
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Tidak terautentikasi." };

  if (input.subjectId === user.id) {
    return { ok: false, error: "Tidak bisa menilai diri sendiri." };
  }

  const invalid = validateMetricScores(input.scores);
  if (invalid) return { ok: false, error: invalid };

  const admin = createAdminClient();

  const { data: round } = await admin
    .from("evaluation_360_rounds")
    .select("status")
    .eq("id", input.roundId)
    .maybeSingle();
  if (!round) return { ok: false, error: "Round tidak ditemukan." };
  if ((round as unknown as { status: string }).status !== "active") {
    return { ok: false, error: "Round ini sudah ditutup." };
  }

  const { data: coParticipants } = await admin
    .from("evaluation_360_participants")
    .select("user_id")
    .eq("round_id", input.roundId)
    .in("user_id", [user.id, input.subjectId]);
  const ids = new Set(
    ((coParticipants ?? []) as unknown as { user_id: string }[]).map((p) => p.user_id)
  );
  if (!ids.has(user.id) || !ids.has(input.subjectId)) {
    return { ok: false, error: "Kamu atau orang ini bukan peserta round ini." };
  }

  const totalScore = computeTotal(input.scores);

  const { error } = await admin
    .from("evaluation_360_responses")
    .upsert(
      {
        round_id: input.roundId,
        rater_id: user.id,
        subject_id: input.subjectId,
        metric_scores: input.scores as unknown as Json,
        total_score: totalScore,
        notes: input.notes?.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "round_id,rater_id,subject_id" }
    );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/evaluasi");
  revalidatePath("/admin/evaluasi-360");
  revalidatePath(`/admin/evaluasi-360/${input.roundId}`);
  return { ok: true };
}
