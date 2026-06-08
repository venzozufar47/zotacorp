/**
 * One-off backfill of yeobo_photo_sessions from the per-branch
 * "Live Dash YB - <branch> - PnL" CSVs (the same dashboards used for the
 * 2023–2025 P&L hardcode). Extracts the "Details on Monthly Active
 * Session" breakdown: per studio, per package tier, per month.
 *
 * Run once:  rtk proxy npx -y tsx scripts/backfill-photo-sessions.ts
 * Reads Supabase creds from .env.local. CSV paths are the user's Downloads.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const CSVS: { branch: string; path: string }[] = [
  { branch: "Tlogosari", path: "C:/Users/venzo/Downloads/Live Dash YB - Tlogosari - PnL (1).csv" },
  { branch: "Tembalang", path: "C:/Users/venzo/Downloads/Live Dash YB - Tembalang - PnL.csv" },
  { branch: "Jebres", path: "C:/Users/venzo/Downloads/Live Dash YB - Jebres, Solo - PnL.csv" },
];

const MON: Record<string, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

function loadEnv(): { url: string; key: string } {
  const raw = readFileSync(".env.local", "utf8");
  const get = (k: string) => {
    for (const line of raw.split(/\r?\n/)) {
      const m = new RegExp(`^${k}=(.*)$`).exec(line.trim());
      if (m) return m[1].replace(/^["']|["']$/g, "").trim();
    }
    throw new Error(`missing ${k} in .env.local`);
  };
  return { url: get("NEXT_PUBLIC_SUPABASE_URL"), key: get("SUPABASE_SERVICE_ROLE_KEY") };
}

function parseLine(line: string): string[] {
  const out: string[] = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function parseMon(s: string): { year: number; month: number } | null {
  const m = /^([A-Za-z]{3})-(\d{2})$/.exec((s || "").trim());
  if (!m) return null;
  const mo = MON[m[1]];
  if (!mo) return null;
  return { year: 2000 + Number(m[2]), month: mo };
}

type Row = {
  branch: string; studio: string; package_label: string;
  period_year: number; period_month: number; sessions: number; sort_order: number;
};

function extract(branch: string, text: string): Row[] {
  const rows = text.split(/\r?\n/).map(parseLine);
  // Header row: the one with ≥3 month-like cells.
  let colMap: { c: number; year: number; month: number }[] = [];
  for (const r of rows) {
    const cm: { c: number; year: number; month: number }[] = [];
    for (let c = 0; c < r.length; c++) { const mm = parseMon(r[c]); if (mm) cm.push({ c, ...mm }); }
    if (cm.length >= 3) { colMap = cm; break; }
  }
  // Section bounds.
  let start = -1, end = rows.length;
  for (let i = 0; i < rows.length; i++) {
    const l = (rows[i][1] || "").trim();
    if (l.startsWith("Details on Monthly Active Session")) start = i;
    if (l.startsWith("Details on Total Expenses")) { end = i; break; }
  }
  const out: Row[] = [];
  let curStudio: string | null = null, sort = 0;
  for (let i = start + 1; i < end; i++) {
    const r = rows[i];
    const label = (r[1] || "").trim();
    const unit = (r[2] || "").trim();
    if (!label || unit !== "#") continue;
    if (label.includes("- MoM Growth")) continue;
    if (label === "Monthly Active Session") continue;
    if (label.startsWith("#NAME")) continue; // broken Look Up sub-rows
    let studio: string, pkg: string;
    if (label.startsWith("- ")) {
      if (!curStudio) continue;
      studio = curStudio; pkg = label.slice(2).trim();
    } else if (label === "Self Photo Studio") {
      curStudio = "Self Photo Studio"; sort++; continue; // total row → derive from packages
    } else {
      curStudio = label; studio = label; pkg = "";
    }
    sort++;
    for (const { c, year, month } of colMap) {
      const raw = (r[c] || "").trim().replace(/[, ]/g, "");
      if (raw === "" || raw === "-") continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) continue;
      out.push({ branch, studio, package_label: pkg, period_year: year, period_month: month, sessions: n, sort_order: sort });
    }
  }
  return out;
}

async function main() {
  const { url, key } = loadEnv();
  const sb = createClient(url, key);
  let all: Row[] = [];
  for (const { branch, path } of CSVS) {
    const rows = extract(branch, readFileSync(path, "utf8"));
    all = all.concat(rows);
    // Spot check: earliest month total per branch.
    const months = [...new Set(rows.map((r) => `${r.period_year}-${String(r.period_month).padStart(2, "0")}`))].sort();
    const first = months[0];
    const firstTotal = rows.filter((r) => `${r.period_year}-${String(r.period_month).padStart(2, "0")}` === first).reduce((s, r) => s + r.sessions, 0);
    const studios = [...new Set(rows.map((r) => r.studio))];
    console.log(`${branch}: ${rows.length} rows, ${months.length} months (${months[0]}..${months[months.length - 1]}), studios=[${studios.join(", ")}], total ${first}=${firstTotal}`);
  }
  console.log(`TOTAL rows: ${all.length}`);
  // Upsert in batches.
  for (let i = 0; i < all.length; i += 500) {
    const batch = all.slice(i, i + 500);
    const { error } = await sb
      .from("yeobo_photo_sessions")
      .upsert(batch, { onConflict: "branch,studio,package_label,period_year,period_month" });
    if (error) { console.error("upsert error:", error.message); process.exit(1); }
  }
  console.log("backfill done.");
}

main();
