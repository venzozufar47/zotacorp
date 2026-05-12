import path from "path";
import url from "url";
import fs from "fs";

const tmpdir = path.resolve(".claude/tmp");
const mod = await import(url.pathToFileURL(path.join(tmpdir, "jago.cjs")).href);
const buf = fs.readFileSync("C:/Users/venzo/Downloads/Jago_Haengbocake_History_24042026.csv");
const r = await mod.parseJagoStatement(new Uint8Array(buf));
const sorted = [...r.transactions].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
const target = sorted.findIndex((t) => t.date === "2024-06-01" && t.time === "12:55");
for (let i = Math.max(0, target - 5); i <= Math.min(sorted.length - 1, target + 2); i++) {
  const t = sorted[i];
  console.log(i, t.date, t.time, "d:", t.debit, "c:", t.credit, "b:", t.runningBalance, "|", t.description.slice(0, 50));
}
console.log("---2025-06-01---");
const target2 = sorted.findIndex((t) => t.date === "2025-06-01" && t.time === "09:55");
for (let i = Math.max(0, target2 - 3); i <= Math.min(sorted.length - 1, target2 + 2); i++) {
  const t = sorted[i];
  console.log(i, t.date, t.time, "d:", t.debit, "c:", t.credit, "b:", t.runningBalance, "|", t.description.slice(0, 50));
}
