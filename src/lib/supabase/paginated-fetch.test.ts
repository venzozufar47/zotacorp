import { test } from "node:test";
import assert from "node:assert/strict";
import { createPaginatedFetch } from "./paginated-fetch.ts";

/** Server tiruan: `total` baris, paling banyak 1.000 per respons, seperti Data API. */
function fakeServer(total: number, opts: { hasId?: boolean; failAtOffset?: number } = {}) {
  const calls: URL[] = [];
  const fetchFn = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    calls.push(url);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    if (opts.hasId === false && /(^|,)id\./.test(url.searchParams.get("order") ?? "")) {
      return new Response(JSON.stringify({ message: "column id does not exist" }), { status: 400 });
    }
    if (opts.failAtOffset === offset) return new Response("{}", { status: 500 });
    const limit = Math.min(1000, Number(url.searchParams.get("limit") ?? 1000));
    const rows = Array.from({ length: Math.max(0, Math.min(limit, total - offset)) }, (_, i) => ({ n: offset + i }));
    return new Response(JSON.stringify(rows), {
      headers: { "content-range": rows.length ? `${offset}-${offset + rows.length - 1}/*` : "*/*" },
    });
  }) as typeof fetch;
  return { calls, run: createPaginatedFetch(fetchFn) };
}

const BASE = "https://x.supabase.co/rest/v1/t?select=*";
const rowsOf = async (res: Response) => (await res.json()) as { n: number }[];

test("query tanpa batas mengambil semua halaman, urut dan tanpa duplikat", async () => {
  const s = fakeServer(2500);
  const rows = await rowsOf(await s.run(BASE));
  assert.equal(rows.length, 2500);
  assert.equal(new Set(rows.map((r) => r.n)).size, 2500);
  assert.equal(s.calls.at(-1)!.searchParams.get("order"), "id.asc");
});

test("tepat 1.000 baris tetap benar", async () => {
  assert.equal((await rowsOf(await fakeServer(1000).run(BASE))).length, 1000);
});

test("limit di atas 1.000 dihormati", async () => {
  assert.equal((await rowsOf(await fakeServer(9000).run(`${BASE}&limit=2500`))).length, 2500);
});

test("range berawal di tengah mulai dari offset yang diminta", async () => {
  const rows = await rowsOf(await fakeServer(3000).run(`${BASE}&offset=500&limit=200000`));
  assert.equal(rows[0].n, 500);
  assert.equal(rows.length, 2500);
});

test("limit <= 1.000, hasil kecil, dan tulis tidak memicu permintaan tambahan", async () => {
  for (const [total, url, init] of [
    [5000, `${BASE}&limit=1000`, undefined],
    [20, BASE, undefined],
    [5000, BASE, { method: "PATCH" }],
  ] as const) {
    const s = fakeServer(total);
    await s.run(url, init);
    assert.equal(s.calls.length, 1);
  }
});

test("order yang sudah ada diberi pemecah seri id", async () => {
  const s = fakeServer(1500);
  await s.run(`${BASE}&order=created_at.desc`);
  assert.equal(s.calls.at(-1)!.searchParams.get("order"), "created_at.desc,id.asc");
});

test("tabel tanpa kolom id memakai urutan aslinya", async () => {
  const s = fakeServer(1500, { hasId: false });
  assert.equal((await rowsOf(await s.run(`${BASE}&order=slip_id.asc`))).length, 1500);
  assert.equal(s.calls.at(-1)!.searchParams.get("order"), "slip_id.asc");
});

test("galat di halaman lanjutan dikembalikan sebagai galat, bukan hasil sebagian", async () => {
  const res = await fakeServer(2500, { failAtOffset: 1000 }).run(BASE);
  assert.equal(res.status, 500);
});
