import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

/* eslint-disable @typescript-eslint/no-explicit-any -- uji action asli dengan sesi dan database yang dimock */
const require = createRequire(import.meta.url);
const ts = require("typescript");

function setup(options: { signedIn?: boolean; branches?: string[]; fail?: boolean } = {}) {
  const calls: { method: string; args: any[] }[] = [];
  const raw = { id: "review", branch: "Pare", rating: 4, aspects: ["rasa"], comment: "Enak", product_wish: null, created_at: "2026-11-01T00:00:00Z" };
  const query: any = {};
  for (const method of ["select", "in", "eq", "gte", "order", "range"]) {
    query[method] = (...args: any[]) => {
      calls.push({ method, args });
      return query;
    };
  }
  query.then = (resolve: any) => resolve(options.fail ? { error: { message: "private database error" } } : { data: [raw] });
  const modules: Record<string, any> = {
    "@/lib/supabase/cached": { getCurrentUser: async () => options.signedIn === false ? null : { id: "current-user" } },
    "@/lib/branches/user-branches": { resolveUserBranches: async (id: string) => {
      assert.equal(id, "current-user");
      return options.branches ?? ["Pare"];
    } },
    "./_supabase-admin": { createAdminClient: () => ({ from: (table: string) => {
      calls.push({ method: "from", args: [table] });
      return query;
    } }) },
    "@/lib/utils/jakarta": { jakartaDateString: () => "2026-11-03" },
    "@/lib/feedback/store": { wibDayStart: (day: string) => `${day}T00:00:00+07:00` },
    "@/lib/feedback/constants": { ASPECT_ALL_GOOD: "sudah_bagus" },
  };
  const actions: any = {};
  const { outputText } = ts.transpileModule(readFileSync("src/lib/actions/employee-feedback.actions.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  runInNewContext(outputText, { exports: actions, require: (id: string) => {
    if (!(id in modules)) throw new Error(`Unexpected dependency ${id}`);
    return modules[id];
  } });
  return { actions, calls };
}

test("feedback karyawan tanpa sesi atau cabang tidak mengakses database", async () => {
  for (const options of [{ signedIn: false }, { branches: [] }]) {
    const { actions, calls } = setup(options);
    await actions.getMyCustomerFeedback();
    assert.equal(calls.length, 0);
  }
});

test("feedback dibatasi cabang server, hanya tampil, dan jendela 30 hari WIB", async () => {
  const { actions, calls } = setup();
  const result = await actions.getMyCustomerFeedback({ branch: "Semarang" });
  assert.equal(result.ok, true);
  assert.equal(JSON.stringify(calls.find((c) => c.method === "in")?.args), '["branch",["Pare"]]');
  assert.equal(JSON.stringify(calls.find((c) => c.method === "eq")?.args), '["hidden",false]');
  assert.equal(calls.find((c) => c.method === "gte")?.args[1], "2026-10-05T00:00:00+07:00");
  assert.equal(result.data[0].count, 1);
  assert.equal(result.data[0].average, 4);
  assert.equal(result.data[0].topAspects[0].key, "rasa");
  const selected = calls.find((c) => c.method === "select")?.args[0];
  for (const privateField of ["device_id", "ip_hash", "aspect_order", "visit_type"]) assert.ok(!selected.includes(privateField));
});

test("kegagalan database tidak ditampilkan sebagai nol ulasan atau membocorkan pesan internal", async () => {
  const { actions } = setup({ fail: true });
  const result = await actions.getMyCustomerFeedback();
  assert.equal(result.ok, false);
  assert.ok(result.error);
  assert.ok(!result.error.includes("private database error"));
});
