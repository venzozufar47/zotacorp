import ts from "typescript";
import fs from "fs";
import path from "path";
import url from "url";

const tmpdir = path.resolve(".claude/tmp");
const src = fs.readFileSync("src/lib/cashflow/parsers/jago.ts", "utf8");
const sharedSrc = fs.readFileSync("src/lib/cashflow/parsers/shared.ts", "utf8");
const types = `export interface ParsedTransaction { date: string; time?: string; sourceDestination?: string; transactionDetails?: string; notes?: string; description: string; debit: number; credit: number; runningBalance?: number }; export interface ParsedStatement { periodMonth: number; periodYear: number; openingBalance: number; closingBalance: number; transactions: ParsedTransaction[]; warnings: string[] }`;

function compile(s) {
  return ts.transpileModule(s, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
}

const sharedClean = sharedSrc.replace(
  /import \{ sortChronologicalAsc \} from "..\/chronological";/,
  "function sortChronologicalAsc(a){return a;}"
);
const sharedJs = compile(sharedClean);
const jagoClean = src
  .replace(/import type \{ ParsedStatement, ParsedTransaction \} from "..\/types";/, types)
  .replace(/from "\.\/shared"/, `from "${path.join(tmpdir, "shared.cjs").replace(/\\/g, "/")}"`);
const jagoJs = compile(jagoClean);

fs.writeFileSync(path.join(tmpdir, "shared.cjs"), sharedJs);
fs.writeFileSync(path.join(tmpdir, "jago.cjs"), jagoJs);

const { parseJagoStatement } = await import(url.pathToFileURL(path.join(tmpdir, "jago.cjs")).href);
const buf = fs.readFileSync("C:/Users/venzo/Downloads/Jago_Haengbocake_History_24042026.csv");
const r = await parseJagoStatement(new Uint8Array(buf));
console.log("parsed count:", r.transactions.length);
// Check the specific problematic rows
for (const d of ["2025-02-04", "2025-02-05", "2025-02-06", "2025-03-02"]) {
  const tx = r.transactions.find((t) => t.date === d);
  if (tx) console.log(d, JSON.stringify(tx));
}
// End-to-end check: opening + sum - sum = closing
const asc = [...r.transactions].sort((a,b)=>a.date<b.date?-1:1);
const first = asc[0], last = asc[asc.length-1];
const opening = (first.runningBalance ?? 0) - first.credit + first.debit;
const closing = last.runningBalance ?? 0;
const sumC = r.transactions.reduce((s,t)=>s+t.credit,0);
const sumD = r.transactions.reduce((s,t)=>s+t.debit,0);
console.log("opening:", opening, "computed closing:", opening+sumC-sumD, "actual closing:", closing, "diff:", opening+sumC-sumD-closing);

// Chain integrity check
const sorted = [...r.transactions].sort((a,b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
let prev = sorted[0].runningBalance - sorted[0].credit + sorted[0].debit;
const breaks = [];
for (let i=0;i<sorted.length;i++) {
  const t = sorted[i];
  const expected = prev + t.credit - t.debit;
  if (t.runningBalance !== expected) {
    breaks.push({i, date:t.date, time:t.time, desc:t.description.slice(0,60), debit:t.debit, credit:t.credit, balance:t.runningBalance, expected});
  }
  prev = t.runningBalance;
}
console.log("chain breaks:", breaks.length);
for (const b of breaks.slice(0,15)) console.log(JSON.stringify(b));
