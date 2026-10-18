"use server";

import { createHash } from "crypto";
import { createAdminClient } from "./_supabase-admin";
import { requireAdmin } from "./_gates";
import { getCurrentUser } from "@/lib/supabase/cached";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { MONTHLY_QUESTIONS, QUARTERLY_QUESTIONS } from "@/lib/pulse-survey/constants";

/**
 * Survei Bulanan Anonim (PRD-8) — SOP 3.12.
 *
 * ANONIM SUNGGUHAN: jawaban (`pulse_survey_responses`) tidak pernah
 * menyimpan user_id. Penjaga "satu kali per orang per periode" adalah
 * token satu-arah (`sha256(userId:period:surveyType:salt)`) disimpan di
 * tabel TERPISAH tanpa relasi balik ke jawaban — tahu token sudah
 * terpakai tidak memberi tahu jawaban mana yang dikirim orang itu.
 *
 * Hasil per cabang HANYA ditampilkan bila >= 4 responden (SOP 3.12) —
 * ditegakkan di `getAggregate`, bukan cuma disembunyikan di UI.
 */

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/* eslint-disable @typescript-eslint/no-explicit-any */
function db(): any {
  return createAdminClient();
}

const MIN_RESPONDENTS = 4;
const LOW_SCORE_THRESHOLD = 3.5;
const TOKEN_SALT = "zota-pulse-survey-v1";

function currentMonthPeriod(): string {
  return jakartaDateString(new Date()).slice(0, 7);
}

function currentQuarterPeriod(): string {
  const [y, m] = jakartaDateString(new Date()).split("-").map(Number);
  const q = Math.ceil(m / 3);
  return `${y}-Q${q}`;
}

function tokenFor(userId: string, period: string, surveyType: string): string {
  return createHash("sha256").update(`${userId}:${period}:${surveyType}:${TOKEN_SALT}`).digest("hex");
}

async function alreadyAnswered(userId: string, period: string, surveyType: string): Promise<boolean> {
  const token = tokenFor(userId, period, surveyType);
  const { data } = await db().from("pulse_survey_tokens").select("token").eq("token", token).maybeSingle();
  return !!data;
}

export async function hasAnsweredMonthlyPulse(): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return true;
  return alreadyAnswered(user.id, currentMonthPeriod(), "monthly");
}

export async function hasAnsweredQuarterlyPulse(): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return true;
  return alreadyAnswered(user.id, currentQuarterPeriod(), "quarterly");
}

export async function submitMonthlyPulse(input: {
  answers: [number, number, number];
  branch?: "Pare" | "Semarang" | null;
}): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  if (input.answers.some((a) => a < 1 || a > 5)) return { ok: false, error: "Jawaban tidak valid" };

  const period = currentMonthPeriod();
  const token = tokenFor(user.id, period, "monthly");
  const { error: tokenErr } = await db()
    .from("pulse_survey_tokens")
    .insert({ token, period, survey_type: "monthly" });
  if (tokenErr) return { ok: false, error: "Kamu sudah mengisi survei bulan ini" };

  const { error } = await db().from("pulse_survey_responses").insert({
    period,
    survey_type: "monthly",
    branch: input.branch ?? null,
    answers: { q1: input.answers[0], q2: input.answers[1], q3: input.answers[2] },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function submitQuarterlyPulse(input: {
  answers: number[];
  branch?: "Pare" | "Semarang" | null;
}): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  if (input.answers.length !== QUARTERLY_QUESTIONS.length || input.answers.some((a) => a < 1 || a > 5)) {
    return { ok: false, error: "Jawaban tidak valid" };
  }

  const period = currentQuarterPeriod();
  const token = tokenFor(user.id, period, "quarterly");
  const { error: tokenErr } = await db()
    .from("pulse_survey_tokens")
    .insert({ token, period, survey_type: "quarterly" });
  if (tokenErr) return { ok: false, error: "Kamu sudah mengisi survei kuartal ini" };

  const answers: Record<string, number> = {};
  input.answers.forEach((a, i) => {
    answers[`e${i + 1}`] = a;
  });
  const { error } = await db().from("pulse_survey_responses").insert({
    period,
    survey_type: "quarterly",
    branch: input.branch ?? null,
    answers,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export interface PulseAggregate {
  period: string;
  branch: "Pare" | "Semarang" | "all";
  respondentCount: number;
  enoughRespondents: boolean;
  averages: { label: string; average: number; low: boolean }[];
  anyLow: boolean;
}

async function getAggregate(
  surveyType: "monthly" | "quarterly",
  period: string,
  branch: "Pare" | "Semarang" | "all",
  questionKeys: string[],
  labels: string[]
): Promise<ActionResult<PulseAggregate>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  let query = db().from("pulse_survey_responses").select("answers").eq("period", period).eq("survey_type", surveyType);
  if (branch !== "all") query = query.eq("branch", branch);
  const { data } = await query;
  const rows = data ?? [];
  const count = rows.length;
  const enoughRespondents = count >= MIN_RESPONDENTS;

  const averages = questionKeys.map((key, i) => {
    const values = rows.map((r: any) => r.answers?.[key]).filter((v: unknown) => typeof v === "number");
    const avg = values.length > 0 ? values.reduce((s: number, v: number) => s + v, 0) / values.length : 0;
    return { label: labels[i], average: avg, low: avg < LOW_SCORE_THRESHOLD };
  });

  return {
    ok: true,
    data: {
      period,
      branch,
      respondentCount: count,
      enoughRespondents,
      averages: enoughRespondents ? averages : [],
      anyLow: enoughRespondents && averages.some((a) => a.low),
    },
  };
}

export async function getMonthlyPulseAggregate(
  branch: "Pare" | "Semarang" | "all" = "all",
  period?: string
): Promise<ActionResult<PulseAggregate>> {
  return getAggregate(
    "monthly",
    period ?? currentMonthPeriod(),
    branch,
    ["q1", "q2", "q3"],
    [...MONTHLY_QUESTIONS]
  );
}

export async function getQuarterlyPulseAggregate(
  branch: "Pare" | "Semarang" | "all" = "all",
  period?: string
): Promise<ActionResult<PulseAggregate>> {
  return getAggregate(
    "quarterly",
    period ?? currentQuarterPeriod(),
    branch,
    QUARTERLY_QUESTIONS.map((_, i) => `e${i + 1}`),
    QUARTERLY_QUESTIONS.map((q) => q.text)
  );
}
