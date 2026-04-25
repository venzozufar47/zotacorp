"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentUser,
  getCurrentProfile,
  getCachedAttendanceSettings,
} from "@/lib/supabase/cached";
import type { Database } from "@/lib/supabase/types";
import {
  type Celebrant,
  type CelebrationKind,
  type CelebrationRow,
  getCelebrantsInWindow,
  getSelfCelebrationToday,
  isWithinActiveWindow,
  pickDisplayName,
  zonedDateString,
} from "@/lib/utils/celebrations";
import { renderWaTemplate } from "@/lib/whatsapp/templates";
import { sendWhatsApp } from "@/lib/whatsapp/fonnte";
import { normalizePhone } from "@/lib/whatsapp/normalize-phone";

/**
 * Wrap kirim WA + persist log ke `whatsapp_send_logs` supaya admin
 * bisa audit kapan + ke siapa pesan dikirim. Pakai `admin` (service
 * role) client supaya insert tetap jalan walau RLS authenticated
 * tidak punya policy insert.
 */
async function logAndSendWhatsApp(
  admin: ReturnType<typeof createAdminClient<Database>>,
  args: {
    recipientProfileId: string | null;
    phone: string;
    eventType:
      | "birthday"
      | "anniversary"
      | "celebration_greeting_notification"
      | "other";
    body: string;
  }
) {
  let status: "sent" | "failed" = "sent";
  let errorMessage: string | null = null;
  try {
    await sendWhatsApp(args.phone, args.body);
  } catch (err) {
    status = "failed";
    errorMessage = err instanceof Error ? err.message : String(err);
  }
  try {
    await admin.from("whatsapp_send_logs").insert({
      recipient_profile_id: args.recipientProfileId,
      recipient_phone: args.phone,
      event_type: args.eventType,
      message_body: args.body,
      status,
      error_message: errorMessage,
    });
  } catch (err) {
    console.error("[whatsapp-log] insert failed", err);
  }
}

const WINDOW_DAYS = 8; // today + next 7 days

export type CelebrationMessage = {
  id: string;
  celebrantId: string;
  authorId: string;
  authorName: string;
  eventType: CelebrationKind;
  eventYear: number;
  kind: "greeting" | "reply" | "broadcast";
  parentId: string | null;
  body: string;
  createdAt: string;
};

export type CelebrantWithMessages = Celebrant & {
  messages: CelebrationMessage[];
};

export type CelebrationsFeed = {
  today: CelebrantWithMessages[];
  upcoming: Celebrant[];
  mySelfCelebration: Celebrant | null;
};

/**
 * Build the feed shown on the employee dashboard.
 *
 * Privacy: for coworker data we read `profiles_celebrations_public` which
 * exposes only MM-DD of DOB. The viewer's own DOB is read from their
 * profile (they already have access to it).
 */
export async function getCelebrationsFeed(): Promise<CelebrationsFeed> {
  const user = await getCurrentUser();
  if (!user) {
    return { today: [], upcoming: [], mySelfCelebration: null };
  }

  const supabase = await createClient();
  const [profileSelf, settings, publicRowsRes] = await Promise.all([
    getCurrentProfile(),
    getCachedAttendanceSettings(),
    supabase
      .from("profiles_celebrations_public")
      .select("id, full_name, nickname, dob_month_day, first_day_of_work"),
  ]);

  const tz = settings?.timezone ?? "Asia/Jakarta";
  const now = new Date();

  // Celebrants in the window, EXCLUDING the viewer — they'll be added back
  // in only for the `today` slice below so they can read greetings addressed
  // to them. We still exclude self from `upcoming` (no need to remind
  // yourself of your own birthday next week).
  const rows: CelebrationRow[] = (publicRowsRes.data ?? [])
    .filter((r) => r.id && r.full_name && r.id !== user.id)
    .map((r) => ({
      id: r.id as string,
      full_name: r.full_name as string,
      nickname: r.nickname ?? null,
      dob_month_day: r.dob_month_day ?? null,
      first_day_of_work: r.first_day_of_work ?? null,
    }));
  const all = getCelebrantsInWindow(rows, now, tz, WINDOW_DAYS);

  const todayIso = zonedDateString(now, tz);
  const upcoming = all.filter((c) => c.occursOn !== todayIso);
  const todayCoworkers = all.filter((c) => c.occursOn === todayIso);

  // If the viewer themselves is a celebrant today, fold them into the
  // today list so the card renders for them too (with all the greetings
  // coworkers have posted). Broadcast composer lives inside the card.
  const selfToday = profileSelf
    ? getSelfCelebrationToday({
        id: profileSelf.id,
        fullName: profileSelf.full_name ?? "",
        nickname: profileSelf.nickname ?? null,
        dateOfBirth: profileSelf.date_of_birth ?? null,
        firstDayOfWork: profileSelf.first_day_of_work ?? null,
        today: now,
        tz,
      })
    : null;
  const todayCelebrants = selfToday
    ? [selfToday, ...todayCoworkers]
    : todayCoworkers;

  // Load messages for today's celebrants in one query.
  let today: CelebrantWithMessages[] = todayCelebrants.map((c) => ({
    ...c,
    messages: [],
  }));

  if (todayCelebrants.length > 0) {
    const celebrantIds = todayCelebrants.map((c) => c.id);
    const { data: msgs } = await supabase
      .from("celebration_messages")
      .select("id, celebrant_id, author_id, event_type, event_year, kind, parent_id, body, created_at")
      .in("celebrant_id", celebrantIds)
      .order("created_at", { ascending: true });

    const authorIds = Array.from(new Set((msgs ?? []).map((m) => m.author_id)));
    // Use the masked public view — `profiles` RLS only lets a user read
    // their own row, so coworker names wouldn't come back from there.
    const { data: authors } = authorIds.length
      ? await supabase
          .from("profiles_celebrations_public")
          .select("id, full_name, nickname")
          .in("id", authorIds)
      : { data: [] as { id: string; full_name: string | null; nickname: string | null }[] };
    const nameOf = new Map(
      (authors ?? [])
        .filter((a) => a.id)
        .map((a) => [
          a.id as string,
          pickDisplayName(a.full_name ?? "", a.nickname ?? null),
        ])
    );

    today = todayCelebrants.map((c) => ({
      ...c,
      messages: (msgs ?? [])
        .filter(
          (m) =>
            m.celebrant_id === c.id &&
            m.event_type === c.kind &&
            m.event_year === c.eventYear
        )
        .map((m) => ({
          id: m.id,
          celebrantId: m.celebrant_id,
          authorId: m.author_id,
          authorName: nameOf.get(m.author_id) ?? "Seseorang",
          eventType: m.event_type as CelebrationKind,
          eventYear: m.event_year,
          kind: m.kind as CelebrationMessage["kind"],
          parentId: m.parent_id,
          body: m.body,
          createdAt: m.created_at,
        })),
    }));
  }

  return { today, upcoming, mySelfCelebration: selfToday };
}

/**
 * Post a greeting / reply / broadcast to an active celebration. Window
 * enforcement lives here (not in RLS) so thresholds can evolve freely.
 */
export async function postCelebrationMessage(input: {
  celebrantId: string;
  eventType: CelebrationKind;
  eventYear: number;
  kind: "greeting" | "reply" | "broadcast";
  parentId?: string | null;
  body: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const body = input.body.trim();
  if (body.length < 1 || body.length > 500) {
    return { ok: false, error: "Message must be 1–500 characters" };
  }

  // Kind/author/celebrant consistency (defense-in-depth; RLS also enforces).
  if (input.kind === "greeting" && input.celebrantId === user.id) {
    return { ok: false, error: "Use broadcast for your own celebration" };
  }
  if (input.kind === "broadcast" && input.celebrantId !== user.id) {
    return { ok: false, error: "Only the celebrant can broadcast" };
  }
  if (input.kind === "reply" && input.celebrantId !== user.id) {
    return { ok: false, error: "Only the celebrant can reply" };
  }
  if (input.kind === "reply" && !input.parentId) {
    return { ok: false, error: "Reply needs a parent message" };
  }

  const settings = await getCachedAttendanceSettings();
  const tz = settings?.timezone ?? "Asia/Jakarta";
  const now = new Date();

  // Compute the actual occurrence date to validate the window.
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("profiles_celebrations_public")
    .select("id, full_name, dob_month_day, first_day_of_work")
    .eq("id", input.celebrantId)
    .maybeSingle();

  if (!row) return { ok: false, error: "Celebrant not found" };

  let occursOn: string | null = null;
  if (input.eventType === "birthday" && row.dob_month_day) {
    occursOn = `${input.eventYear}-${row.dob_month_day}`;
  } else if (input.eventType === "anniversary" && row.first_day_of_work) {
    const parts = row.first_day_of_work.split("-").map(Number);
    const fm = parts[1];
    const fd = parts[2];
    occursOn = `${input.eventYear}-${String(fm).padStart(2, "0")}-${String(fd).padStart(2, "0")}`;
  }

  if (!occursOn) return { ok: false, error: "No celebration for this date" };
  if (!isWithinActiveWindow(occursOn, now, tz)) {
    return { ok: false, error: "Outside active window" };
  }

  const { error } = await supabase.from("celebration_messages").insert({
    celebrant_id: input.celebrantId,
    author_id: user.id,
    event_type: input.eventType,
    event_year: input.eventYear,
    kind: input.kind,
    parent_id: input.parentId ?? null,
    body,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard");

  // Fire-and-forget: notify the celebrant on WhatsApp that a new greeting
  // landed. Only for `greeting` — broadcasts/replies are authored BY the
  // celebrant, notifying them of their own messages would be noise.
  if (input.kind === "greeting") {
    const celebrantId = input.celebrantId;
    const authorId = user.id;
    const eventKind = input.eventType;
    const bodySnapshot = body;
    after(async () => {
      try {
        await notifyCelebrantOfGreeting({
          celebrantId,
          authorId,
          eventKind,
          body: bodySnapshot,
        });
      } catch (err) {
        console.error("[celebrations] greeting WA notify failed", err);
      }
    });
  }

  return { ok: true };
}

/**
 * Sends a WhatsApp nudge to the celebrant telling them a new greeting
 * has arrived, with a short preview. Uses the service-role client so it
 * can read whatsapp_number across profiles regardless of the caller's
 * RLS scope. Silently skips if the celebrant has no whatsapp_number set.
 */
async function notifyCelebrantOfGreeting(args: {
  celebrantId: string;
  authorId: string;
  eventKind: CelebrationKind;
  body: string;
}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn("[celebrations] missing SERVICE_ROLE key — skip greeting notify");
    return;
  }
  const admin = createAdminClient<Database>(url, key);

  const [{ data: celebrant }, { data: author }] = await Promise.all([
    admin
      .from("profiles")
      .select("full_name, nickname, whatsapp_number")
      .eq("id", args.celebrantId)
      .maybeSingle(),
    admin
      .from("profiles")
      .select("full_name, nickname")
      .eq("id", args.authorId)
      .maybeSingle(),
  ]);

  if (!celebrant?.whatsapp_number) return;
  const phone = normalizePhone(celebrant.whatsapp_number);
  if (!phone) return;

  const celebrantName = pickDisplayName(celebrant.full_name, celebrant.nickname);
  const authorName = pickDisplayName(author?.full_name, author?.nickname);

  const eventKindLabel = args.eventKind === "birthday" ? "ulang tahun" : "anniversary";
  const message = await renderWaTemplate("celebration_greeting_notification", {
    celebrantName,
    authorName,
    eventKind: eventKindLabel,
  });
  await sendWhatsApp(phone, message);
}

/**
 * Edit an existing message body. Author-only (enforced by RLS + a
 * defense-in-depth eq on author_id). Used by the celebrant to tweak their
 * broadcast after posting without having to delete + repost.
 */
export async function updateCelebrationMessage(
  id: string,
  rawBody: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const body = rawBody.trim();
  if (body.length < 1 || body.length > 500) {
    return { ok: false, error: "Message must be 1–500 characters" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("celebration_messages")
    .update({ body })
    .eq("id", id)
    .eq("author_id", user.id); // RLS also enforces this

  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteCelebrationMessage(id: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const supabase = await createClient();
  await supabase
    .from("celebration_messages")
    .delete()
    .eq("id", id)
    .eq("author_id", user.id); // extra belt; RLS already enforces
  revalidatePath("/dashboard");
}

/**
 * Fire-and-forget dispatcher. Finds today's celebrants, atomically claims
 * each via an UPDATE ... RETURNING, and sends at most one WA per celebrant
 * per day regardless of how many dashboards are being loaded in parallel.
 *
 * Guarded to only run when local hour >= 6 so users don't get a 03:00 WA
 * from an early-bird coworker loading the dashboard overnight.
 */
export async function dispatchTodaysGreetings(): Promise<void> {
  try {
    const settings = await getCachedAttendanceSettings();
    const tz = settings?.timezone ?? "Asia/Jakarta";
    const now = new Date();

    // Local-hour gate via Intl.
    const hourStr = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hour12: false,
      timeZone: tz,
    }).format(now);
    const hour = Number(hourStr);
    if (!Number.isFinite(hour) || hour < 6) return;

    const todayIso = zonedDateString(now, tz);
    const [yearStr, monthStr, dayStr] = todayIso.split("-");
    const mmdd = `${monthStr}-${dayStr}`;

    // Service-role client so we can read whatsapp_number across profiles
    // and run the atomic claim even outside the user's RLS scope.
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      console.warn("[celebrations] missing SERVICE_ROLE key — skipping dispatch");
      return;
    }
    const admin = createAdminClient<Database>(url, key);

    // Birthday candidates: anyone whose DOB MM-DD matches today.
    const { data: bCandidates } = await admin
      .from("profiles")
      .select("id, full_name, nickname, whatsapp_number, date_of_birth, birthday_last_greeted")
      .not("date_of_birth", "is", null);

    for (const p of bCandidates ?? []) {
      if (!p.date_of_birth) continue;
      const [, pm, pd] = p.date_of_birth.split("-").map(Number);
      const pmmdd = `${String(pm).padStart(2, "0")}-${String(pd).padStart(2, "0")}`;
      const effective = normalizeMmddToToday(pmmdd, Number(yearStr));
      if (effective !== todayIso) continue;
      if (p.birthday_last_greeted === todayIso) continue;

      // Atomic claim.
      const { data: claimed } = await admin
        .from("profiles")
        .update({ birthday_last_greeted: todayIso })
        .eq("id", p.id)
        .or(`birthday_last_greeted.is.null,birthday_last_greeted.lt.${todayIso}`)
        .select("id, full_name, nickname, whatsapp_number")
        .maybeSingle();

      if (!claimed) continue;
      const phone = normalizePhone(claimed.whatsapp_number ?? "");
      if (!phone) continue;
      const waName = pickDisplayName(claimed.full_name, claimed.nickname);
      try {
        const message = await renderWaTemplate("celebration_birthday_morning", {
          name: waName,
        });
        await logAndSendWhatsApp(admin, {
          recipientProfileId: claimed.id,
          phone,
          eventType: "birthday",
          body: message,
        });
      } catch (err) {
        console.error("[celebrations] birthday WA failed", err);
      }
    }

    // Anniversary candidates: first_day_of_work with the same MM-DD as today
    // and years > 0.
    const { data: aCandidates } = await admin
      .from("profiles")
      .select(
        "id, full_name, nickname, whatsapp_number, first_day_of_work, anniversary_last_greeted"
      )
      .not("first_day_of_work", "is", null);

    for (const p of aCandidates ?? []) {
      if (!p.first_day_of_work) continue;
      const [fy, fm, fd] = p.first_day_of_work.split("-").map(Number);
      const pmmdd = `${String(fm).padStart(2, "0")}-${String(fd).padStart(2, "0")}`;
      if (pmmdd !== mmdd) continue;
      const years = Number(yearStr) - fy;
      if (years <= 0) continue;
      if (p.anniversary_last_greeted === todayIso) continue;

      const { data: claimed } = await admin
        .from("profiles")
        .update({ anniversary_last_greeted: todayIso })
        .eq("id", p.id)
        .or(`anniversary_last_greeted.is.null,anniversary_last_greeted.lt.${todayIso}`)
        .select("id, full_name, nickname, whatsapp_number")
        .maybeSingle();

      if (!claimed) continue;
      const phone = normalizePhone(claimed.whatsapp_number ?? "");
      if (!phone) continue;
      const waName = pickDisplayName(claimed.full_name, claimed.nickname);
      try {
        const message = await renderWaTemplate(
          "celebration_anniversary_morning",
          { name: waName, years }
        );
        await logAndSendWhatsApp(admin, {
          recipientProfileId: claimed.id,
          phone,
          eventType: "anniversary",
          body: message,
        });
      } catch (err) {
        console.error("[celebrations] anniversary WA failed", err);
      }
    }
  } catch (err) {
    console.error("[celebrations] dispatcher threw", err);
  }
}

/** Apply Feb-29 fallback for the current year in a single-line helper. */
function normalizeMmddToToday(mmdd: string, year: number): string {
  const [m, d] = mmdd.split("-").map(Number);
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  if (m === 2 && d === 29 && !isLeap) {
    return `${year}-02-28`;
  }
  return `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

