import { test } from "node:test";
import assert from "node:assert/strict";
import { planDynamicTables, type CatalogRow } from "./dynamic.ts";

const row = (table_name: string, parents: string[] = [], schema_name = "public"): CatalogRow => ({
  schema_name,
  table_name,
  pk_columns: ["id"],
  generated_columns: [],
  parents,
});
const names = (rows: CatalogRow[]) => rows.map((r) => r.table_name);

test("tabel baru ikut otomatis, induk lebih dulu", () => {
  const plan = planDynamicTables(
    [row("anak_baru", ["public.induk_baru"]), row("induk_baru"), row("sudah_ada"), row("lain", [], "yeobo")],
    "public",
    new Set(["sudah_ada"])
  );
  assert.deepEqual(names(plan), ["induk_baru", "anak_baru"]);
});

test("data sementara dan rahasia dikecualikan", () => {
  const catalog = [row("push_send_logs"), row("zz_backup_apa_saja"), row("backup_settings")];
  assert.deepEqual(names(planDynamicTables(catalog, "public", new Set())), ["backup_settings"]);
  assert.deepEqual(planDynamicTables([row("branch_secrets", [], "yeobo")], "yeobo", new Set()), []);
});

test("relasi melingkar tidak membuat tabel hilang", () => {
  const plan = planDynamicTables([row("a", ["public.b"]), row("b", ["public.a"])], "public", new Set());
  assert.equal(plan.length, 2);
});
