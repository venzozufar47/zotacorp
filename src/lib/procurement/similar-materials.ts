/**
 * Nama bahan yang mirip dengan ketikan petugas — dipakai di "Ajukan bahan baru" supaya bahan yang sebenarnya sudah ada
 * (beda ejaan, urutan kata, atau kemasan) tidak terdaftar ganda. Modul murni (aman untuk client).
 */

const STOPWORDS = new Set(["dan", "untuk", "dengan", "uk", "ukuran", "cm", "gr", "gram", "kg", "ml", "pcs", "pack", "isi"]);

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** 1 = kata sama, 0.8 = salah satu memuat yang lain, 0.7 = salah ketik kecil, 0 = tak mirip. */
function tokenSimilarity(q: string, c: string): number {
  if (q === c) return 1;
  if (q.length >= 3 && c.length >= 3 && (c.includes(q) || q.includes(c))) return 0.8;
  const maxEdits = Math.max(q.length, c.length) > 5 ? 2 : 1;
  if (q.length >= 4 && c.length >= 4 && levenshtein(q, c) <= maxEdits) return 0.7;
  return 0;
}

/** Bahan paling mirip dengan `query`, terbaik dulu. Kosong bila ketikan terlalu pendek atau tak ada yang mirip. */
export function findSimilarMaterials<T extends { name: string }>(query: string, materials: T[], limit = 5): T[] {
  const qTokens = tokens(query);
  if (qTokens.length === 0) return [];
  const qJoined = qTokens.join("");
  const scored: { m: T; score: number }[] = [];
  for (const m of materials) {
    const cTokens = tokens(m.name);
    if (cTokens.length === 0) continue;
    let sum = 0;
    for (const q of qTokens) sum += Math.max(...cTokens.map((c) => tokenSimilarity(q, c)));
    let score = sum / qTokens.length;
    // Ejaan tanpa spasi ("sarimurni" vs "sari murni") dan kebalikannya.
    const cJoined = cTokens.join("");
    if (qJoined.length >= 4 && cJoined.length >= 4 && (cJoined.includes(qJoined) || qJoined.includes(cJoined))) {
      score = Math.max(score, 0.85);
    }
    if (score >= 0.5) scored.push({ m, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.m.name.length - b.m.name.length).slice(0, limit).map((x) => x.m);
}
