import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  const raw = readFileSync(".env.local", "utf8");
  const get = (k: string) => {
    for (const line of raw.split(/\r?\n/)) {
      const m = new RegExp(`^${k}=(.*)$`).exec(line.trim());
      if (m) return m[1].replace(/^["']|["']$/g, "").trim();
    }
    throw new Error(`missing ${k}`);
  };
  return { url: get("NEXT_PUBLIC_SUPABASE_URL"), key: get("SUPABASE_SERVICE_ROLE_KEY") };
}

async function main() {
  const { url, key } = loadEnv();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated types are stale (see feedback_financial_deficit_methodology memory)
  const supabase = createClient(url, key) as any;

  const { data: rows, error } = await supabase
    .from("yeobo_dividend_allocations")
    .select(
      "recipient_id, period_year, period_month, amount_idr, entitlement_idr, yeobo_dividend_recipients!inner(branch, label, kind)"
    )
    .order("period_year", { ascending: true })
    .order("period_month", { ascending: true });
  if (error) throw error;

  const hasEntitlementCol = rows?.[0] ? "entitlement_idr" in rows[0] : false;
  console.log("entitlement_idr column present on rows?", hasEntitlementCol);

  // Running arrears per recipient, treating entitlement = amount (pre-migration baseline).
  const running = new Map<string, number>();
  let totalArrears = 0;
  const perRecipient = new Map<
    string,
    { branch: string; kind: string; label: string; arrears: number }
  >();

  for (const r of rows ?? []) {
    const rec = r.yeobo_dividend_recipients;
    const key = r.recipient_id as string;
    const entitlement = hasEntitlementCol ? Number(r.entitlement_idr) : Number(r.amount_idr);
    const transferred = Number(r.amount_idr);
    const delta = entitlement - transferred;
    const prev = running.get(key) ?? 0;
    const next = prev + delta;
    running.set(key, next);
    perRecipient.set(key, { branch: rec.branch, kind: rec.kind, label: rec.label, arrears: next });
  }

  for (const [, v] of perRecipient) totalArrears += v.arrears;

  console.log("\n=== Baseline (pre-migration): tunggakan per penerima s/d bulan terakhir ===");
  for (const [, v] of perRecipient) {
    console.log(` ${v.branch} | ${v.kind.padEnd(9)} | ${v.label.padEnd(35)} | arrears=${v.arrears}`);
  }
  console.log("\nΣ tunggakan seluruh penerima (harus 0):", totalArrears);
  console.log("Total baris alokasi diperiksa:", rows?.length ?? 0);

  const { data: lastPeriod } = await supabase
    .from("yeobo_dividend_allocations")
    .select("period_year, period_month")
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false })
    .limit(1);
  console.log("\nBulan alokasi terakhir yang tersimpan:", lastPeriod);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
