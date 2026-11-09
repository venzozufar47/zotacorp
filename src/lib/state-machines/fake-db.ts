/**
 * Fake Supabase/PostgREST untuk tes mesin status (lihat docs/STATE_MACHINES.md).
 *
 * Berbeda dengan mock lain di repo ini, filter BENAR-BENAR dievaluasi
 * terhadap baris di memori, sehingga tes bisa membuktikan bahwa sebuah
 * UPDATE hanya mengenai baris yang masih berada di status asal. Balapan
 * "baca → (orang lain menulis) → tulis" disimulasikan lewat `onRead`:
 * callback dijalankan sekali tepat setelah SELECT pada tabel itu selesai,
 * sebelum aksi sempat menulis.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- batas database tiruan */

export type Row = Record<string, any>;
type Filter = (row: Row) => boolean;

export interface FakeDb {
  tables: Record<string, Row[]>;
  /** Jalankan `fn` sekali, tepat setelah SELECT berikutnya pada `table`. */
  onRead(table: string, fn: () => void): void;
  /** Gagalkan sekali operasi `op` berikutnya pada `table` (tanpa menulis apa pun). */
  failOn(table: string, op: "insert" | "update" | "delete" | "upsert", message: string): void;
  from(table: string): any;
  /** Riwayat tulisan, untuk memastikan efek samping tidak dobel. */
  log: { table: string; op: "insert" | "update" | "delete" | "upsert"; rows: Row[] }[];
}

let seq = 0;

function parseValue(raw: string): unknown {
  if (raw === "null") return null;
  if (raw === "true") return true;
  if (raw === "false") return false;
  return raw;
}

function compare(op: string, actual: any, expected: any): boolean {
  switch (op) {
    case "eq":
      return actual === expected;
    case "neq":
      return actual !== expected;
    case "is":
      return expected === null ? actual === null || actual === undefined : actual === expected;
    case "lt":
      return actual !== null && actual !== undefined && actual < expected;
    case "lte":
      return actual !== null && actual !== undefined && actual <= expected;
    case "gt":
      return actual !== null && actual !== undefined && actual > expected;
    case "gte":
      return actual !== null && actual !== undefined && actual >= expected;
    default:
      throw new Error(`fake-db: operator tidak didukung: ${op}`);
  }
}

/** `a.is.null,a.lt.2026-01-01T00:00:00.000Z` → OR dari tiap klausa. */
function parseOr(expr: string): Filter {
  const clauses = expr.split(",").map((c) => {
    const [col, op, ...rest] = c.split(".");
    const value = parseValue(rest.join("."));
    return (row: Row) => compare(op, row[col], value);
  });
  return (row) => clauses.some((f) => f(row));
}

export function createFakeDb(initial: Record<string, Row[]>): FakeDb {
  const tables: Record<string, Row[]> = {};
  for (const [k, rows] of Object.entries(initial)) tables[k] = rows.map((r) => ({ ...r }));
  const readHooks = new Map<string, () => void>();
  const failures = new Map<string, string>();
  const log: FakeDb["log"] = [];

  function from(table: string) {
    tables[table] ??= [];
    const filters: Filter[] = [];
    let op: "select" | "update" | "insert" | "delete" | "upsert" = "select";
    let payload: any = null;
    let upsertOpts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
    let returning = false;
    let single: "one" | "maybe" | null = null;
    let lim: number | null = null;
    let orderBy: { col: string; asc: boolean } | null = null;

    const run = () => {
      const all = tables[table];
      const match = () => all.filter((r) => filters.every((f) => f(r)));
      let data: Row[] | null = null;
      let error: { message: string; code?: string } | null = null;

      const failure = failures.get(`${table}:${op}`);
      if (failure !== undefined) {
        failures.delete(`${table}:${op}`);
        return { data: null, error: { message: failure } };
      }

      if (op === "select") {
        let rows = match();
        if (orderBy) {
          const { col, asc } = orderBy;
          rows = [...rows].sort((a, b) => (a[col] === b[col] ? 0 : (a[col] < b[col]) === asc ? -1 : 1));
        }
        if (lim !== null) rows = rows.slice(0, lim);
        data = rows.map((r) => ({ ...r }));
        const hook = readHooks.get(table);
        if (hook) {
          readHooks.delete(table);
          hook();
        }
      } else if (op === "update") {
        const hit = match();
        for (const r of hit) Object.assign(r, payload);
        log.push({ table, op, rows: hit.map((r) => ({ ...r })) });
        data = returning ? hit.map((r) => ({ ...r })) : null;
      } else if (op === "delete") {
        const hit = match();
        tables[table] = all.filter((r) => !hit.includes(r));
        log.push({ table, op, rows: hit });
        data = returning ? hit : null;
      } else if (op === "insert") {
        const rows = (Array.isArray(payload) ? payload : [payload]).map((r: Row) => ({ id: `${table}-${++seq}`, ...r }));
        all.push(...rows);
        log.push({ table, op, rows });
        data = returning ? rows.map((r: Row) => ({ ...r })) : null;
      } else {
        const keys = (upsertOpts.onConflict ?? "id").split(",");
        const out: Row[] = [];
        for (const r of Array.isArray(payload) ? payload : [payload]) {
          const existing = all.find((e) => keys.every((k) => e[k] === r[k]));
          if (existing) {
            if (upsertOpts.ignoreDuplicates) continue;
            Object.assign(existing, r);
            out.push(existing);
          } else {
            const row = { id: `${table}-${++seq}`, ...r };
            all.push(row);
            out.push(row);
          }
        }
        log.push({ table, op, rows: out.map((r) => ({ ...r })) });
        data = returning ? out.map((r) => ({ ...r })) : null;
      }

      if (single) {
        const rows = data ?? [];
        if (rows.length > 1) error = { message: "multiple rows" };
        if (single === "one" && rows.length === 0) error = { message: "no rows", code: "PGRST116" };
        return { data: rows[0] ?? null, error };
      }
      return { data, error };
    };

    const q: any = {
      select() {
        if (op === "select") return q;
        returning = true;
        return q;
      },
      update(v: Row) {
        op = "update";
        payload = v;
        return q;
      },
      insert(v: Row | Row[]) {
        op = "insert";
        payload = v;
        return q;
      },
      upsert(v: Row | Row[], opts: typeof upsertOpts = {}) {
        op = "upsert";
        payload = v;
        upsertOpts = opts;
        return q;
      },
      delete() {
        op = "delete";
        return q;
      },
      eq: (c: string, v: unknown) => (filters.push((r) => compare("eq", r[c], v)), q),
      neq: (c: string, v: unknown) => (filters.push((r) => compare("neq", r[c], v)), q),
      is: (c: string, v: unknown) => (filters.push((r) => compare("is", r[c], v)), q),
      lt: (c: string, v: unknown) => (filters.push((r) => compare("lt", r[c], v)), q),
      lte: (c: string, v: unknown) => (filters.push((r) => compare("lte", r[c], v)), q),
      gt: (c: string, v: unknown) => (filters.push((r) => compare("gt", r[c], v)), q),
      gte: (c: string, v: unknown) => (filters.push((r) => compare("gte", r[c], v)), q),
      in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), q),
      not: (c: string, o: string, v: unknown) => (filters.push((r) => !compare(o, r[c], v)), q),
      or: (expr: string) => (filters.push(parseOr(expr)), q),
      order: (col: string, opts?: { ascending?: boolean }) => ((orderBy ??= { col, asc: opts?.ascending !== false }), q),
      limit: (n: number) => ((lim = n), q),
      range: () => q,
      maybeSingle: async () => ((single = "maybe"), run()),
      single: async () => ((single = "one"), run()),
      then: (resolve: any, reject: any) => Promise.resolve().then(run).then(resolve, reject),
    };
    return q;
  }

  return {
    tables,
    log,
    onRead: (table, fn) => void readHooks.set(table, fn),
    failOn: (table, op, message) => void failures.set(`${table}:${op}`, message),
    from,
  };
}
