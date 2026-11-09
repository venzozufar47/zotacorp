/**
 * Tes regresi SM-6 (profil) dan SM-7 (absensi) — docs/STATE_MACHINES.md.
 *
 * Setelah migrasi 324 karyawan tidak lagi punya hak tulis langsung ke
 * attendance_logs / attendance_break_logs / overtime_requests, dan hanya data
 * diri dasar di profiles. Tes ini menjalankan server action & route ASLI dengan
 * klien karyawan yang MENOLAK semua tulisan ke tabel itu (meniru produksi
 * pasca-324): jalur absensi karyawan harus tetap berhasil lewat service role,
 * dengan filter yang meniru RLS lama.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { createFakeDb, type FakeDb } from "./fake-db.ts";
import * as editPolicy from "../profile/edit-policy.ts";

/* eslint-disable @typescript-eslint/no-explicit-any -- mock batas modul, jalankan kode asli */
const require = createRequire(import.meta.url);
const ts = require("typescript");
const EMP = "00000000-0000-4000-8000-0000000000e1";
const OTHER = "00000000-0000-4000-8000-0000000000e2";
const ADMIN = "00000000-0000-4000-8000-0000000000a1";
const TODAY = "2026-11-09";
const GUARDED = ["attendance_logs", "attendance_break_logs", "overtime_requests", "profiles"];

function load(path: string, modules: Record<string, any>) {
  const { outputText } = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  runInNewContext(
    outputText,
    {
      exports,
      process: { env: {} },
      Buffer,
      console: { error() {}, warn() {}, log() {} },
      require: (id: string) => {
        if (id in modules) return modules[id];
        throw new Error(`Unexpected dependency: ${id}`);
      },
    },
    { filename: path }
  );
  return exports as any;
}

/** Klien karyawan pasca-324: baca boleh, tulis ke tabel terjaga ditolak RLS. */
function employeeClient(db: FakeDb, denied: string[]) {
  const deniedResult = { data: null, error: { code: "42501", message: "new row violates row-level security policy" } };
  const deniedQuery = (): any => {
    const q: any = new Proxy({}, { get: (_t, p) => (p === "then" ? (res: any, rej: any) => Promise.resolve(deniedResult).then(res, rej) : p === "single" || p === "maybeSingle" ? async () => deniedResult : () => q) });
    return q;
  };
  return {
    from(table: string) {
      const q = db.from(table);
      if (!GUARDED.includes(table)) return q;
      return new Proxy(q, {
        get(target, p) {
          if (p === "update" || p === "insert" || p === "upsert" || p === "delete") {
            return () => (denied.push(`${table}.${String(p)}`), deniedQuery());
          }
          return target[p];
        },
      });
    },
  };
}

// ─── SM-7: absensi ──────────────────────────────────────────────────────────

function attendanceActions(db: FakeDb, denied: string[], deferred: (() => unknown)[] = []) {
  const user = employeeClient(db, denied);
  return load("src/lib/actions/attendance.actions.ts", {
    "next/cache": { revalidatePath() {} },
    "next/server": { after: (fn: () => unknown) => void deferred.push(fn) },
    "@/lib/supabase/server": { createClient: async () => user },
    "@/lib/supabase/cached": {
      getCurrentUser: async () => ({ id: EMP }),
      getCurrentRole: async () => "employee",
      getCachedAttendanceSettings: async () => ({ timezone: "Asia/Jakarta" }),
    },
    "@/lib/utils/jakarta": { jakartaDateString: () => TODAY, jakartaDateMinusDays: () => "2026-11-07" },
    "@/lib/attendance/selfie-gate": { isSoftSelfieIssueSet: () => false },
    "@/lib/utils/workdays": { isWorkdayFor: () => true, jakartaDayOfWeek: () => 1 },
    "@/lib/whatsapp/attendance-notify": { notifyAdminAttendance: async () => {} },
    "@/lib/location/enforce": {
      evaluateCheckIn: async () => ({ ok: true, matchedLocationId: null }),
      evaluateCheckOut: async () => ({ ok: true, requiresNote: false }),
    },
    "@/lib/utils/attendance-overtime": {
      isEarlyArrival: () => false,
      getEffectiveWorkEnd: () => null,
      hhmmToInstant: () => new Date(),
      resolveCheckoutInstant: (checkin: Date) => ({ ok: true, instant: new Date(checkin.getTime() + 9 * 3600_000) }),
      computeOvertimeMinutes: () => 60,
    },
    "@/lib/utils/streak": { computeStreak: () => ({ personalBest: 9, milestoneHitNow: 0 }) },
    "@/lib/utils/break-windows": {
      parseBreakWindows: () => [{ start: "12:00", end: "13:00" }],
      activeBreakWindow: () => ({ start: "12:00", end: "13:00" }),
      localHhmm: () => "12:30",
    },
    "@/lib/celebrations/push-log": { sendCelebrationPush: async () => {} },
    "@/lib/whatsapp/templates": { renderWaTemplate: async () => "" },
    "@/lib/actions/cleaning.actions": { getBlockingCleaning: async () => [], hasPendingCleaningRedo: async () => false },
    "@/lib/attendance/stock-opname-gate": { guardCheckoutByStockOpname: async () => ({ ok: true }) },
    "@/lib/tasks/blocking": { getBlockingTasks: async () => [] },
    "@/lib/tasks/gate": { taskGateMessage: () => "" },
    "@/lib/actions/_supabase-admin": { createAdminClient: () => db },
    "@/lib/push/web-push": { sendPushToAdmins: async () => {} },
    "@/lib/push/checkout-gate": { checkoutPushGate: async () => ({ ready: true, attemptedAt: null }) },
    "@/lib/attendance/selfie-gate-db": {
      looseDb: (c: unknown) => c,
      effectiveCheckInTime: (now: Date) => now,
      SELFIE_SESSION_WINDOW_MS: 20 * 60_000,
    },
  });
}

const profile = (over: Record<string, unknown> = {}) => ({
  id: EMP, full_name: "Ani", is_flexible_schedule: false, work_start_time: "09:00:00", work_end_time: "18:00:00",
  grace_period_min: 15, workday_check_enabled: false, workdays: 126, holiday_bonus_enabled: false,
  break_enabled: true, break_windows: [], streak_personal_best: 0, streak_last_milestone: 0, ...over,
});
const openLog = (over: Record<string, unknown> = {}) => ({
  id: "log1", user_id: EMP, date: TODAY, checked_in_at: "2026-11-09T01:00:00.000Z", checked_out_at: null,
  total_break_minutes: 0, matched_location_id: null, status: "on_time", late_minutes: 0, ...over,
});
const selfie = { latitude: -7.8, longitude: 112.1, selfie_path: `${EMP}/in.webp` };

test("absensi: check-in tetap jalan tanpa hak tulis karyawan, status dihitung server", async () => {
  const db = createFakeDb({ profiles: [profile()], push_subscriptions: [{ id: "s", user_id: EMP }] });
  const denied: string[] = [];
  const deferred: (() => unknown)[] = [];
  const res = await attendanceActions(db, denied, deferred).checkIn(selfie);
  assert.equal(res.error, undefined, res.error);
  assert.deepEqual(denied, []);
  const row = db.tables.attendance_logs[0];
  assert.equal(row.user_id, EMP);
  assert.equal(row.date, TODAY);
  assert.ok(["on_time", "late", "unknown"].includes(row.status));
  assert.equal(row.overtime_status, null);
  // Streak (after()) juga ditulis server, bukan klien karyawan.
  for (const fn of deferred) await fn();
  assert.deepEqual(denied, []);
  assert.equal(db.tables.profiles[0].streak_personal_best, 9);
});

test("absensi: re-check-in setelah pulang tetap ditolak seperti sebelum migrasi", async () => {
  const db = createFakeDb({
    profiles: [profile()],
    push_subscriptions: [{ id: "s", user_id: EMP }],
    attendance_logs: [openLog({ checked_out_at: "2026-11-09T10:00:00.000Z" })],
  });
  const res = await attendanceActions(db, []).checkIn(selfie);
  assert.ok(res.error);
  assert.equal(db.tables.attendance_logs[0].checked_out_at, "2026-11-09T10:00:00.000Z");
});

test("absensi: istirahat keluar & masuk tetap jalan, total istirahat dihitung ulang server", async () => {
  const db = createFakeDb({ profiles: [profile()], attendance_logs: [openLog()] });
  const denied: string[] = [];
  const actions = attendanceActions(db, denied);
  assert.equal((await actions.breakOut(selfie)).error, undefined);
  // Mundurkan mulai istirahat supaya ada durasinya.
  db.tables.attendance_break_logs[0].break_out_at = new Date(Date.now() - 30 * 60_000).toISOString();
  const back = await actions.breakIn(selfie);
  assert.equal(back.error, undefined, back.error);
  assert.deepEqual(denied, []);
  assert.ok(db.tables.attendance_break_logs[0].break_in_at);
  assert.equal(db.tables.attendance_logs[0].total_break_minutes, 30);
});

test("absensi: check-out + lembur tetap jalan; lembur masuk sebagai pending, bukan disetujui", async () => {
  const db = createFakeDb({ profiles: [profile()], attendance_logs: [openLog()] });
  const denied: string[] = [];
  const res = await attendanceActions(db, denied).checkOut({ isOvertime: true, overtimeReason: "stok", latitude: -7.8, longitude: 112.1 });
  assert.equal(res.error, undefined, res.error);
  assert.deepEqual(denied, []);
  const row = db.tables.attendance_logs[0];
  assert.ok(row.checked_out_at);
  assert.equal(row.overtime_status, "pending");
  assert.equal(db.tables.overtime_requests.length, 1);
  assert.equal(db.tables.overtime_requests[0].user_id, EMP);
});

test("absensi: lupa check-out diisi lewat lateCheckout tetap jalan; log orang lain ditolak", async () => {
  const db = createFakeDb({
    profiles: [profile()],
    attendance_logs: [openLog({ id: "old", date: "2026-11-08" }), openLog({ id: "theirs", user_id: OTHER })],
  });
  const denied: string[] = [];
  const actions = attendanceActions(db, denied);
  const mine = await actions.lateCheckout({ attendanceLogId: "old", checkoutTime: "18:00", reason: "lupa" });
  assert.equal(mine.error, undefined, mine.error);
  assert.ok(db.tables.attendance_logs[0].checked_out_at);
  const theirs = await actions.lateCheckout({ attendanceLogId: "theirs", checkoutTime: "18:00", reason: "x" });
  assert.ok(theirs.error);
  assert.equal(db.tables.attendance_logs[1].checked_out_at, null);
  assert.deepEqual(denied, []);
});

// ─── SM-6: profil ──────────────────────────────────────────────────────────

test("kebijakan profil: karyawan hanya data diri; kolom admin dibuang; onboarding sekali", () => {
  const { filterProfilePatch } = editPolicy;
  const patch = { nickname: "Ani", grace_period_min: 999, payslip_excluded: true, work_start_time: "13:00", business_unit: "Pare" };
  const emp = filterProfilePatch(patch, { isAdmin: false, stored: { business_unit: null } });
  assert.deepEqual(emp, { ok: true, patch: { nickname: "Ani", business_unit: "Pare" } });
  const locked = filterProfilePatch(patch, { isAdmin: false, stored: { business_unit: "Semarang" } });
  assert.equal(locked.ok, false);
  const same = filterProfilePatch({ business_unit: "Semarang", job_role: "Kasir" }, { isAdmin: false, stored: { business_unit: "Semarang", job_role: "Kasir" } });
  assert.deepEqual(same, { ok: true, patch: {} });
  const admin = filterProfilePatch(patch, { isAdmin: true, stored: {} });
  assert.deepEqual(admin, { ok: true, patch });
});

test("kebijakan profil: daftar kolom sama dengan trigger DB migrasi 324", () => {
  const sql = readFileSync("supabase/migrations/324_profile_attendance_write_guards.sql", "utf8");
  const list = (name: string) =>
    [...(sql.match(new RegExp(`${name} constant text\\[\\] := array\\[([\\s\\S]*?)\\];`))?.[1] ?? "").matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  const technical = ["avatar_seed", "avatar_url", "pos_pin_hash", "updated_at"];
  assert.deepEqual(list("self_cols").filter((c) => !technical.includes(c)).sort(), [...editPolicy.SELF_EDITABLE_FIELDS].sort());
  assert.deepEqual(list("once_cols").sort(), [...editPolicy.ONBOARDING_ONCE_FIELDS].sort());
});

function profileRoute(db: FakeDb, caller: string) {
  const user = employeeClient(db, []) as any;
  user.auth = { getUser: async () => ({ data: { user: { id: caller } } }) };
  return load("src/app/api/profile/update/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }) } },
    "next/cache": { revalidatePath() {} },
    "@supabase/supabase-js": { createClient: () => db },
    "@/lib/supabase/server": { createClient: async () => user },
    "@/lib/profile/normalize": { cleanProfileFields: (f: Record<string, unknown>) => ({ values: f, errors: {} }) },
    "@/lib/profile/edit-policy": editPolicy,
  });
}
const post = (body: unknown) => ({ json: async () => body });

test("route profil: karyawan tidak bisa mengubah jadwal/gaji, data diri tetap tersimpan", async () => {
  const db = createFakeDb({
    profiles: [
      { id: EMP, role: "employee", nickname: "A", grace_period_min: 15, payslip_excluded: false, business_unit: "Pare", job_role: "Kasir", first_day_of_work: "2025-01-06" },
    ],
  });
  const route = profileRoute(db, EMP);
  // Formulir mengirim seluruh isian; nilai onboarding yang sama tidak menolak simpan.
  const ok = await route.POST(post({ nickname: "Ani", grace_period_min: 999, payslip_excluded: true, holiday_bonus_enabled: true, business_unit: "Pare", job_role: "Kasir", first_day_of_work: "2025-01-06" }));
  assert.equal(ok.status, 200);
  const row = db.tables.profiles[0];
  assert.equal(row.nickname, "Ani");
  assert.equal(row.grace_period_min, 15);
  assert.equal(row.payslip_excluded, false);
  assert.equal(row.holiday_bonus_enabled, undefined);

  const moved = await route.POST(post({ business_unit: "Semarang" }));
  assert.equal(moved.status, 403);
  assert.equal(db.tables.profiles[0].business_unit, "Pare");
});

test("route profil: karyawan baru mengisi unit bisnis & jabatan sekali (onboarding)", async () => {
  const db = createFakeDb({ profiles: [{ id: EMP, role: "employee", business_unit: null, job_role: null, first_day_of_work: null }] });
  const res = await profileRoute(db, EMP).POST(post({ business_unit: "Pare", job_role: "Kasir", first_day_of_work: "2026-11-01" }));
  assert.equal(res.status, 200);
  assert.equal(db.tables.profiles[0].business_unit, "Pare");
  assert.equal(db.tables.profiles[0].job_role, "Kasir");
});

test("route profil: admin tetap bisa mengubah jadwal & gaji karyawan; karyawan tak bisa ubah orang lain", async () => {
  const db = createFakeDb({
    profiles: [{ id: ADMIN, role: "admin" }, { id: EMP, role: "employee", grace_period_min: 15, business_unit: "Pare" }],
  });
  const res = await profileRoute(db, ADMIN).POST(post({ targetId: EMP, grace_period_min: 5, payslip_excluded: true, business_unit: "Semarang" }));
  assert.equal(res.status, 200);
  const emp = db.tables.profiles[1];
  assert.equal(emp.grace_period_min, 5);
  assert.equal(emp.payslip_excluded, true);
  assert.equal(emp.business_unit, "Semarang");

  const forbidden = await profileRoute(db, OTHER).POST(post({ targetId: EMP, nickname: "x" }));
  assert.equal(forbidden.status, 403);
});
