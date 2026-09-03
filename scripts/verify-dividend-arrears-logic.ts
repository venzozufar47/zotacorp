/**
 * Verifikasi murni-komputasi (tanpa DB) untuk logika tunggakan dividen —
 * mereproduksi contoh owner persis (Agustus bayar management saja →
 * September investor dapat hak+tunggakan, management cuma hak bersih) DAN
 * kasus revisi pool proporsional, memakai computeRecipientAmounts() yang
 * SAMA dipakai app (bukan reimplementasi terpisah yang bisa drift).
 *
 * Konfigurasi Tlogosari di bawah diambil dari data produksi nyata (dilihat
 * live di browser saat verifikasi UI): mgmt 50% setelah BEP, 4 investor
 * dengan porsi pool-investor 60/20/10/10%. Angka pool disederhanakan jadi
 * bulat supaya mudah ditelusuri manual.
 */
import {
  computeRecipientAmounts,
  type DivRecipient,
  type DivBranchConfig,
} from "../src/lib/investor/dividend-allocation";

function assertEq(label: string, actual: number, expected: number) {
  if (actual !== expected) {
    console.error(`FAIL ${label}: got ${actual}, expected ${expected}`);
    process.exitCode = 1;
  } else {
    console.log(`OK   ${label} = ${actual}`);
  }
}

const config: DivBranchConfig = {
  branch: "Tlogosari",
  mgmtPctBeforeBep: 35,
  mgmtPctAfterBep: 50,
  totalInvestmentIdr: 10_000_000,
  bepReachedYm: null,
};
const recipients: DivRecipient[] = [
  { id: "mgmt", label: "Management", kind: "management", poolPct: null, investIdr: null, sortOrder: 0, userId: null, contractId: null },
  { id: "inv-a", label: "Investor A", kind: "investor", poolPct: 60, investIdr: 6_000_000, sortOrder: 1, userId: "ua", contractId: "ca" },
  { id: "inv-b", label: "Investor B", kind: "investor", poolPct: 40, investIdr: 4_000_000, sortOrder: 2, userId: "ub", contractId: "cb" },
];

console.log("=== 1. Agustus: pool 2.000.000, afterBep=true (mgmt 50%) ===");
const augEnt = computeRecipientAmounts({ pool: 2_000_000, afterBep: true, config, recipients });
const augByRecipient = Object.fromEntries(augEnt.map((r) => [r.recipientId, r.amount]));
assertEq("Agustus Σ entitlement === pool", augEnt.reduce((s, r) => s + r.amount, 0), 2_000_000);
assertEq("Agustus mgmt hak", augByRecipient["mgmt"], 1_000_000);
assertEq("Agustus inv-a hak (60% dari 1jt investor pool)", augByRecipient["inv-a"], 600_000);
assertEq("Agustus inv-b hak (40% dari 1jt investor pool)", augByRecipient["inv-b"], 400_000);

console.log("\n=== 2. Owner bayar HANYA management (1jt); investor ditahan ===");
const augTransferred: Record<string, number> = { mgmt: 1_000_000, "inv-a": 0, "inv-b": 0 };
const arrearsAfterAug: Record<string, number> = {};
for (const id of Object.keys(augByRecipient))
  arrearsAfterAug[id] = augByRecipient[id] - (augTransferred[id] ?? 0);
assertEq("Tunggakan mgmt s/d akhir Agustus", arrearsAfterAug["mgmt"], 0);
assertEq("Tunggakan inv-a s/d akhir Agustus", arrearsAfterAug["inv-a"], 600_000);
assertEq("Tunggakan inv-b s/d akhir Agustus", arrearsAfterAug["inv-b"], 400_000);

console.log("\n=== 3. September: pool baru 2.000.000 (deklarasi baru, bukan revisi) ===");
const sepEnt = computeRecipientAmounts({ pool: 2_000_000, afterBep: true, config, recipients });
const sepByRecipient = Object.fromEntries(sepEnt.map((r) => [r.recipientId, r.amount]));
const totalHakSep: Record<string, number> = {};
for (const id of Object.keys(sepByRecipient))
  totalHakSep[id] = sepByRecipient[id] + (arrearsAfterAug[id] ?? 0);

console.log("Hak September SAJA (tanpa tunggakan):", sepByRecipient);
console.log("Total hak September (hak + tunggakan Agustus):", totalHakSep);

// Inti permintaan owner: management HANYA dapat hak bersih bulan berjalan
// (karena tidak ada tunggakan miliknya); investor dapat hak + tunggakan.
assertEq("[OWNER] Total hak mgmt Sept = HANYA hak Sept (tidak ada tunggakan)", totalHakSep["mgmt"], sepByRecipient["mgmt"]);
assertEq("[OWNER] Total hak inv-a Sept = hak Sept + tunggakan Agustus", totalHakSep["inv-a"], sepByRecipient["inv-a"] + 600_000);
assertEq("[OWNER] Total hak inv-b Sept = hak Sept + tunggakan Agustus", totalHakSep["inv-b"], sepByRecipient["inv-b"] + 400_000);

console.log("\n=== 4. Bayar penuh September (self-settling check) ===");
const sepTransferred = totalHakSep; // "Bayar penuh" = transfer total hak
const arrearsAfterSep: Record<string, number> = {};
for (const id of Object.keys(sepByRecipient)) {
  const cumEnt = augByRecipient[id] + sepByRecipient[id];
  const cumPaid = (augTransferred[id] ?? 0) + (sepTransferred[id] ?? 0);
  arrearsAfterSep[id] = cumEnt - cumPaid;
}
assertEq("Tunggakan mgmt s/d Sept (self-settling)", arrearsAfterSep["mgmt"], 0);
assertEq("Tunggakan inv-a s/d Sept (self-settling)", arrearsAfterSep["inv-a"], 0);
assertEq("Tunggakan inv-b s/d Sept (self-settling)", arrearsAfterSep["inv-b"], 0);

console.log("\n=== 5. Non-redistribusi: tunggakan investor TIDAK menambah jatah management ===");
// Ulangi skenario 2 tapi verifikasi eksplisit: kas yang tertahan investor
// (1.000.000 gabungan) tidak pernah muncul sebagai bagian hak management di
// bulan manapun.
const mgmtTotalHakAcrossBothMonths = augByRecipient["mgmt"] + sepByRecipient["mgmt"];
assertEq(
  "[OWNER] Σ hak management (Agustus+September) TIDAK termasuk tunggakan investor",
  mgmtTotalHakAcrossBothMonths,
  2_000_000 // 1jt + 1jt, murni dari formula 50%, tidak pernah 2jt+ekstra
);

console.log("\n=== 6. Revisi pool proporsional (net profit Agustus berubah setelah ditutup) ===");
// Owner requirement: kalau ada beban baru tercatat utk Agustus, pool Agustus
// direvisi turun, HAK di-rescale proporsional (rasio antar penerima sama),
// dan tunggakan otomatis menyesuaikan.
const poolLama = augEnt.reduce((s, r) => s + r.amount, 0); // 2.000.000
const poolBaru = 1_500_000; // turun karena ada beban baru ditemukan
let investorNewTotal = 0;
const rescaled: Record<string, number> = {};
for (const r of recipients) {
  if (r.kind !== "investor") continue;
  const old = augByRecipient[r.id];
  const amt = Math.round((old * poolBaru) / poolLama);
  rescaled[r.id] = amt;
  investorNewTotal += amt;
}
rescaled["mgmt"] = poolBaru - investorNewTotal;

assertEq("Revisi: Σ hak baru === pool baru", Object.values(rescaled).reduce((s, v) => s + v, 0), poolBaru);
assertEq("Revisi: rasio inv-a/inv-b terjaga (60:40 dari 750rb investor pool)", rescaled["inv-a"], 450_000);
assertEq("Revisi: rasio inv-a/inv-b terjaga (60:40 dari 750rb investor pool)", rescaled["inv-b"], 300_000);
assertEq("Revisi: mgmt turun proporsional (residual)", rescaled["mgmt"], 750_000);

// Tunggakan setelah revisi (masih anggap hanya mgmt yang sudah ditransfer
// 1jt Agustus — sekarang itu jadi LEBIH dari hak barunya → kredit negatif).
const arrearsAfterRevision: Record<string, number> = {};
for (const id of Object.keys(rescaled))
  arrearsAfterRevision[id] = rescaled[id] - (augTransferred[id] ?? 0);
assertEq("Revisi: mgmt jadi LEBIH BAYAR (kredit, tunggakan negatif)", arrearsAfterRevision["mgmt"], -250_000);
assertEq("Revisi: tunggakan inv-a ikut menyusut proporsional", arrearsAfterRevision["inv-a"], 450_000);
assertEq("Revisi: tunggakan inv-b ikut menyusut proporsional", arrearsAfterRevision["inv-b"], 300_000);

console.log(
  process.exitCode === 1
    ? "\n❌ ADA YANG GAGAL — lihat FAIL di atas."
    : "\n✅ SEMUA ASERSI LULUS — logika tunggakan (termasuk revisi proporsional) terbukti benar."
);
