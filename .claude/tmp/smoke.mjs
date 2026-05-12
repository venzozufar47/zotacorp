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
  .replace(/from "\.\/shared"/, `from "${path.join(tmpdir, "shared.js").replace(/\\/g, "/")}"`);
const jagoJs = compile(jagoClean);

fs.writeFileSync(path.join(tmpdir, "shared.cjs"), sharedJs);
fs.writeFileSync(path.join(tmpdir, "jago.cjs"), jagoJs.replace(/shared\.js/g, "shared.cjs"));

const { parseJagoStatement } = await import(url.pathToFileURL(path.join(tmpdir, "jago.cjs")).href);
const buf = fs.readFileSync("C:/Users/venzo/Downloads/Jago_History.csv");
const r = await parseJagoStatement(new Uint8Array(buf));
console.log("parsed count:", r.transactions.length);
console.log("warnings:", r.warnings);
console.log("first 3:");
for (const t of r.transactions.slice(0, 3)) console.log(JSON.stringify(t));
console.log("last 2:");
for (const t of r.transactions.slice(-2)) console.log(JSON.stringify(t));
