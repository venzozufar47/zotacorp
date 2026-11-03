import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

/* eslint-disable @typescript-eslint/no-explicit-any -- jalankan server action asli dengan batas sesi, RPC, dan push yang dimock */
const require = createRequire(import.meta.url);
const ts = require("typescript");
const logId = "00000000-0000-4000-8000-000000000001";
const input = { logId, note: "Pastikan apron terlihat pada foto absen berikutnya.", level: "coaching", repeatConfirmed: false };

function setup(options: { admin?: boolean; rpcError?: string; pushFails?: boolean } = {}) {
  const calls: { name: string; args: any }[] = [];
  const pushes: { userId: string; payload: any }[] = [];
  const revalidated: string[] = [];
  const modules: Record<string, any> = {
    "next/cache": { revalidatePath: (path: string) => revalidated.push(path) },
    "./_gates": { requireAdmin: async () => ({ ok: options.admin !== false }) },
    "./_supabase-admin": { createAdminClient: () => { throw new Error("Unexpected admin database access"); } },
    "@/lib/supabase/server": { createClient: async () => ({ rpc: async (name: string, args: any) => {
      calls.push({ name, args });
      return options.rpcError ? { error: { message: options.rpcError } } : { data: { userId: "employee-from-attendance" } };
    } }) },
    "@/lib/push/web-push": { sendPushToUser: async (userId: string, payload: any) => {
      pushes.push({ userId, payload });
      if (options.pushFails) throw new Error("Push unavailable");
    } },
  };
  const { outputText } = ts.transpileModule(readFileSync("src/lib/actions/attendance-coaching.actions.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const actions: any = {};
  runInNewContext(outputText, { exports: actions, require: (id: string) => {
    if (id === "zod") return require(id);
    if (id in modules) return modules[id];
    throw new Error(`Unexpected dependency ${id}`);
  }, console: { error() {} } });
  return { actions, calls, pushes, revalidated };
}

test("hanya admin dapat membaca riwayat dan mengirim pembinaan", async () => {
  const { actions, calls, pushes } = setup({ admin: false });
  assert.ok((await actions.getAttendanceCoachingHistory(logId)).error);
  assert.ok((await actions.reviewAttendanceWithCoaching(input)).error);
  assert.equal(calls.length, 0);
  assert.equal(pushes.length, 0);
});

test("input tidak valid dan SP ditolak sebelum menyentuh database", async () => {
  for (const patch of [{ logId: "not-uuid" }, { note: "" }, { note: "x".repeat(1501) }, { level: "sp1" }, { level: "teguran", repeatConfirmed: false }]) {
    const { actions, calls } = setup();
    assert.ok((await actions.reviewAttendanceWithCoaching({ ...input, ...patch })).error);
    assert.equal(calls.length, 0);
  }
});

test("catatan dan tinjauan memakai RPC atomik dengan sesi pengguna", async () => {
  const { actions, calls, pushes, revalidated } = setup();
  assert.equal((await actions.reviewAttendanceWithCoaching({ ...input, userId: "forged-target" })).error, undefined);
  assert.equal(calls[0].name, "review_attendance_selfie");
  assert.equal(calls[0].args.p_log_id, logId);
  assert.equal(calls[0].args.p_level, null);
  assert.equal(pushes[0].userId, "employee-from-attendance");
  assert.equal(pushes[0].payload.url, "/dashboard");
  assert.ok(revalidated.includes("/dashboard"));
});

test("teguran keras memerlukan konfirmasi pengulangan dan tetap bukan SP", async () => {
  const { actions, calls, pushes } = setup();
  assert.equal((await actions.reviewAttendanceWithCoaching({ ...input, level: "teguran", repeatConfirmed: true })).error, undefined);
  assert.equal(calls[0].args.p_level, "teguran");
  assert.equal(calls[0].args.p_repeat_confirmed, true);
  assert.equal(pushes[0].payload.title, "Teguran keras terkait absen");
});

test("gagal transaksi atau kasus sudah ditinjau tidak mengirim push", async () => {
  const { actions, pushes, revalidated } = setup({ rpcError: "Absen sudah ditinjau" });
  assert.equal((await actions.reviewAttendanceWithCoaching(input)).error, "Absen sudah ditinjau");
  assert.equal(pushes.length, 0);
  assert.equal(revalidated.length, 0);
});

test("push gagal tidak menghilangkan hasil pembinaan yang sudah tersimpan", async () => {
  const { actions, revalidated } = setup({ pushFails: true });
  assert.equal((await actions.reviewAttendanceWithCoaching(input)).error, undefined);
  assert.ok(revalidated.includes("/admin"));
});
