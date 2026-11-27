/**
 * Data API Supabase memotong setiap respons di 1.000 baris tanpa galat. Fetch ini mendeteksi pemotongan itu pada query
 * baca dan mengambil halaman sisanya, sehingga pemanggil menerima hasil lengkap.
 *
 * Dilewati apa adanya: query yang memang meminta <= 1.000 baris (`.limit()` / `.range()` / paginasi manual), tulis
 * (POST/PATCH/DELETE, termasuk RPC), HEAD, dan permintaan non-REST.
 *
 * Tidak tercakup: relasi tertanam (`select("*, anak(*)")`) yang satu induknya punya > 1.000 anak.
 */

/** Harus sama dengan "Max rows" di pengaturan API project Supabase. */
export const SERVER_MAX_ROWS = 1000;
/** Pengaman memori: lebih dari ini dikembalikan sebagai galat, bukan hasil yang diam-diam terpotong. */
export const MAX_ROWS_PER_QUERY = 200_000;

type FetchFn = typeof fetch;

function parseContentRange(header: string | null): { count: number; total: string } | null {
  const m = /^(\d+)-(\d+)\/(\d+|\*)$/.exec(header ?? "");
  return m ? { count: Number(m[2]) - Number(m[1]) + 1, total: m[3] } : null;
}

export function createPaginatedFetch(baseFetch: FetchFn = (input, init) => fetch(input, init)): FetchFn {
  return async (input, init) => {
    const first = await baseFetch(input, init);
    if ((init?.method ?? "GET").toUpperCase() !== "GET" || !first.ok) return first;
    if (typeof input !== "string" && !(input instanceof URL)) return first;

    const url = new URL(input);
    if (!url.pathname.includes("/rest/v1/")) return first;
    const limit = url.searchParams.get("limit");
    const wanted = limit === null ? Infinity : Number(limit);
    if (wanted <= SERVER_MAX_ROWS) return first;
    const range = parseContentRange(first.headers.get("content-range"));
    if (!range || range.count < SERVER_MAX_ROWS) return first;

    const start = Number(url.searchParams.get("offset") ?? 0);
    const order = url.searchParams.get("order");
    // Tanpa urutan yang unik, halaman boleh tumpang tindih atau melompati baris. Tambahkan `id` sebagai pemecah seri;
    // tabel yang tidak punya kolom `id` menolaknya (400) dan memakai urutan aslinya.
    let stableOrder: string | null = order && /(^|,)id(\.|,|$)/.test(order) ? order : order ? `${order},id.asc` : "id.asc";

    const rows: unknown[] = [];
    while (rows.length < wanted) {
      const size = Math.min(SERVER_MAX_ROWS, wanted - rows.length);
      const page = new URL(url);
      page.searchParams.set("offset", String(start + rows.length));
      page.searchParams.set("limit", String(size));
      if (stableOrder) page.searchParams.set("order", stableOrder);

      const res = await baseFetch(page.toString(), init);
      if (!res.ok) {
        if (res.status === 400 && rows.length === 0 && stableOrder !== order) {
          stableOrder = order;
          continue;
        }
        return res;
      }
      const batch = (await res.json()) as unknown[];
      rows.push(...batch);
      if (batch.length < size) break;
      if (rows.length >= MAX_ROWS_PER_QUERY && wanted > rows.length) {
        return new Response(
          JSON.stringify({ message: `Query melebihi ${MAX_ROWS_PER_QUERY} baris; persempit filternya.` }),
          { status: 400, headers: { "content-type": "application/json" } }
        );
      }
    }

    const headers = new Headers(first.headers);
    headers.delete("content-length");
    headers.delete("content-encoding");
    headers.set("content-range", `${start}-${start + rows.length - 1}/${range.total}`);
    return new Response(JSON.stringify(rows), { status: 200, headers });
  };
}

export const paginatedFetch = createPaginatedFetch();
