import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

/* eslint-disable @typescript-eslint/no-explicit-any -- mock batas database dan pengiriman, jalankan server actions asli */
const require = createRequire(import.meta.url);
const ts = require("typescript");
const owner = "00000000-0000-4000-8000-000000000001";
const worker = "00000000-0000-4000-8000-000000000002";
const boss = "00000000-0000-4000-8000-000000000003";
const branch = "00000000-0000-4000-8000-000000000004";

function setup(options: { actor?: string; row?: Record<string, any>; changed?: boolean; push?: () => Promise<void>; blocked?: boolean } = {}) {
  const actor = options.actor ?? owner;
  const row = {
    id: "ticket", title: "Perbaiki lampu", branch: "Semarang", branch_id: branch,
    direction: "down", handler_level: 0, handler_id: null, assignee_id: worker,
    created_by: owner, status: "open", verifier_ids: [], ...options.row,
  };
  const sent: { id: string; payload: any }[] = [];
  const writes: any[] = [];
  const db = { from(table: string) {
    let patch: any;
    let insert: any;
    let ids: string[] = [];
    const result = () => {
      if (patch) {
        writes.push(patch);
        return { data: options.changed === false ? [] : [{ id: row.id }], error: null };
      }
      if (insert) return { data: { id: row.id }, error: null };
      if (table === "profiles") return { data: ids.map(id => ({ id, role: id === owner ? "admin" : "employee" })), error: null };
      return { data: [row], error: null };
    };
    const q: any = {
      select() { return q; },
      update(value: any) { patch = value; return q; },
      insert(value: any) { insert = value; return q; },
      eq() { return q; }, is() { return q; }, not() { return q; },
      lte() { return q; }, order() { return q; }, limit() { return q; },
      in(key: string, value: string[]) { if (key === "id") ids = value; return q; },
      maybeSingle: async () => ({ data: row, error: null }),
      single: async () => result(),
      then(resolve: any, reject: any) { return Promise.resolve(result()).then(resolve, reject); },
    };
    return q;
  } };
  const modules: Record<string, any> = {
    "server-only": {},
    "next/cache": { revalidatePath() {} },
    "./_supabase-admin": { createAdminClient: () => db },
    "@/lib/actions/_supabase-admin": { createAdminClient: () => db },
    "@/lib/supabase/cached": { getCurrentUser: async () => ({ id: actor }), getCurrentRole: async () => actor === owner ? "admin" : "employee" },
    "./_gates": { requireAdmin: async () => ({ ok: true, userId: actor }) },
    "@/lib/push/web-push": {
      sendPushToUser: async (id: string, payload: any) => { sent.push({ id, payload }); await options.push?.(); },
      sendPushToAdmins: async (payload: any) => { sent.push({ id: owner, payload }); },
    },
    "@/lib/whatsapp/templates": { renderWaTemplate: async () => "Pesan tiket" },
    "@/lib/verification/logic": { MAX_VERIFIERS: 10, dedupeVerifierIds: (ids: string[] = []) => [...new Set(ids)] },
    "@/lib/verification/server": {
      loadRound: async () => options.blocked ? [{ round: 1 }] : [],
      blockingReason: async () => options.blocked ? "Menunggu verifikasi" : null,
      namesOf: async () => ["Karyawan"],
    },
    "@/lib/tickets/types": { TICKET_CATEGORY_LABELS: { lainnya: "Lainnya" } },
    "@/lib/tickets/chain": {
      OWNER_LEVEL: 99, PERSON_LEVEL: 1,
      employeesOfBranch: async () => [worker, boss],
      holderRecipients: async (level: number, id: string) => level >= 99 ? [owner] : id ? [id] : [],
      superiorsOf: async () => [boss],
      resolveTarget: () => ({ ok: true, target: { kind: "owner" } }),
      getTicketBranch: async () => ({ id: branch, label: "Semarang", branch: "Semarang", businessUnit: "Yeobo", isActive: true }),
    },
  };
  function load(path: string) {
    const source = readFileSync(path, "utf8");
    const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
    const exports = {};
    runInNewContext(outputText, { exports, require: (id: string) => {
      if (id in modules) return modules[id];
      if (id === "zod") return require(id);
      throw new Error(`Unexpected dependency: ${id}`);
    }, console: { error() {} } }, { filename: path });
    return exports as any;
  }
  return { actions: load("src/lib/actions/tickets.actions.ts"), auto: load("src/lib/tickets/auto-confirm.ts"), sent, writes };
}

test("tiket baru owner menunggu push selesai, penerima dan atasan menerima", async () => {
  let release!: () => void;
  const delivery = new Promise<void>(resolve => { release = resolve; });
  const { actions, sent } = setup({ push: () => delivery });
  let completed = false;
  const action = actions.createDownTicket({ branchId: branch, assigneeId: worker, category: "lainnya", title: "Perbaiki lampu" }).then((r: any) => { completed = true; return r; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(completed, false);
  assert.equal(sent[0]?.id, worker);
  release();
  assert.equal((await action).ok, true);
  assert.deepEqual(sent.map(s => s.id), [worker, boss]);
});

test("tiket owner untuk seluruh cabang dan prioritas mendesak", async () => {
  const { actions, sent } = setup();
  assert.equal((await actions.createDownTicket({ branchId: branch, category: "lainnya", title: "Perbaiki lampu", priority: "urgent" })).ok, true);
  assert.deepEqual(sent.map(s => s.id), [worker, boss]);
  assert.ok(sent.every(s => s.payload.title === "Tiket mendesak dari owner"));
});

test("tiket naik ke owner tidak mengirim push admin dua kali", async () => {
  const { actions, sent } = setup();
  assert.equal((await actions.createTicket({ branchId: branch, category: "lainnya", title: "Perbaiki lampu" })).ok, true);
  assert.deepEqual(sent.map(s => s.id), [owner]);
});

test("mulai tiket memberi tahu owner dan koordinator tanpa mengirim ke pelaku", async () => {
  const { actions, sent } = setup({ actor: worker, row: { delegated_from_id: boss } });
  assert.equal((await actions.startTicket("ticket")).ok, true);
  assert.deepEqual(sent.map(s => [s.id, s.payload.url]), [[owner, "/admin/tickets"], [boss, "/tickets"]]);
});

test("pembatalan cabang memberi tahu semua penerima sekali saja", async () => {
  const { actions, sent } = setup({ row: { assignee_id: null, delegated_from_id: boss } });
  assert.equal((await actions.cancelTicket("ticket")).ok, true);
  assert.deepEqual(sent.map(s => s.id).sort(), [worker, boss].sort());
});

test("eskalasi diterima memberi tahu pelapor dan pengaju", async () => {
  const { actions, sent } = setup({ row: { status: "escalated", direction: "up", handler_level: 99, created_by: worker, escalated_by: boss } });
  assert.equal((await actions.ownerDecideTicket("ticket", "accept")).ok, true);
  assert.deepEqual(sent.map(s => s.id), [worker, boss]);
  assert.ok(sent.every(s => s.payload.title === "Eskalasi diterima"));
});

test("konfirmasi manual memberi tahu penyelesai sekali tanpa notifikasi diri sendiri", async () => {
  const { actions, sent } = setup({ row: { status: "resolved", resolved_by: worker } });
  assert.equal((await actions.confirmTicketResolution("ticket", "confirm")).ok, true);
  assert.deepEqual(sent.map(s => s.id), [worker]);
});

for (const action of ["startTicket", "cancelTicket", "ownerDecideTicket", "confirmTicketResolution"]) {
  test(`${action}: perubahan bersamaan tidak mengirim notifikasi palsu`, async () => {
    const status = action === "ownerDecideTicket" ? "escalated" : action === "confirmTicketResolution" ? "resolved" : "open";
    const { actions, sent } = setup({ changed: false, row: { status, handler_level: 99, resolved_by: worker } });
    assert.equal((await actions[action]("ticket", action === "ownerDecideTicket" ? "accept" : "confirm")).ok, false);
    assert.equal(sent.length, 0);
  });
}

test("gagal push tidak menggagalkan tiket owner atau pembatalan", async () => {
  const { actions, sent } = setup({ push: async () => { throw new Error("Push unavailable"); } });
  assert.equal((await actions.createDownTicket({ branchId: branch, assigneeId: worker, category: "lainnya", title: "Perbaiki lampu" })).ok, true);
  assert.equal((await actions.cancelTicket("ticket")).ok, true);
  assert.ok(sent.some(s => s.id === boss));
});

test("konfirmasi otomatis memberi tahu pembuat dan penyelesai", async () => {
  const { auto, sent } = setup({ row: { status: "resolved", resolved_by: worker } });
  assert.equal((await auto.autoConfirmStaleTickets()).confirmed, 1);
  assert.deepEqual(sent.map(s => [s.id, s.payload.url]), [[owner, "/admin/tickets"], [worker, "/tickets"]]);
});

test("konfirmasi otomatis tidak mengirim saat update kalah balapan atau verifikasi tertunda", async () => {
  for (const options of [{ changed: false }, { blocked: true }]) {
    const { auto, sent } = setup(options);
    assert.equal((await auto.autoConfirmStaleTickets()).confirmed, 0);
    assert.equal(sent.length, 0);
  }
});
