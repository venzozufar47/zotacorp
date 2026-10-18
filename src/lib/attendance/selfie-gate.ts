/**
 * Pemeriksa selfie check-in dengan Google Gemini. Modul biasa (bukan "use server"), dipanggil dari
 * server action. AI hanya MENGAMATI (enum/boolean); keputusan lolos/tolak dan kalimat pesannya
 * dibuat di sini oleh kode, jadi output model sangat pendek (hemat biaya) dan hasilnya konsisten.
 *
 * AI tidak pernah memblokir absen: penolakan hanya memunculkan dialog "foto ulang / tetap absen".
 */

export type SelfieIssue =
  | "outdoor"
  | "unclear_bg"
  | "helmet"
  | "face_cropped"
  | "face_angled"
  | "face_blurry"
  | "mask"
  | "no_apron"
  | "no_head_cover";

export interface SelfieFilters {
  indoor: boolean;
  face_full: boolean;
  no_mask: boolean;
  apron: boolean;
}

export interface SelfieRuleSet {
  filters: SelfieFilters;
  /** Wajib penutup kepala (aturan per orang, mis. rambut panjang tanpa hijab). */
  headCover: boolean;
}

/** Apa yang diamati AI. Field yang filternya mati tidak diminta, jadi bernilai undefined. */
export interface SelfieObservation {
  location?: "indoor" | "outdoor" | "unclear";
  helmet?: boolean;
  face?: "full" | "cropped" | "angled" | "blurry";
  mask?: "none" | "covering" | "clear_shield";
  apron?: boolean;
  head_cover?: boolean;
}

export type SelfieJudgement =
  | { status: "ok" }
  | { status: "reject"; issues: SelfieIssue[]; message: string }
  | { status: "error"; error: string };

const DEFAULT_MODEL = "gemini-2.5-flash";
const TIMEOUT_MS = 10_000;

const ISSUE_MESSAGE: Record<SelfieIssue, string> = {
  outdoor: "Latar belakang terlihat di luar ruangan. Absen dari dalam toko, ya.",
  unclear_bg: "Latar belakang belum jelas. Pastikan dinding atau ruangan di belakangmu ikut terlihat.",
  helmet: "Helm masih dipakai. Lepas helm sebelum foto.",
  face_cropped:
    "Wajah belum terlihat penuh. Pastikan seluruh kepala, dari dahi atau tepi hijab sampai dagu, masuk bingkai.",
  face_angled: "Wajah belum menghadap kamera. Hadap lurus ke kamera dengan kedua mata terlihat jelas.",
  face_blurry: "Foto buram atau kurang terang. Pegang ponsel dengan stabil dan cari tempat yang lebih terang.",
  mask: "Masker menutupi hidung atau mulut. Lepas masker saat foto absen.",
  no_apron: "Apron belum terlihat. Pakai apron, dan pastikan tali atau bagian atasnya terlihat di bahu atau dada.",
  no_head_cover: "Penutup kepala (kupluk atau topi yang menutupi rambut) belum terlihat.",
};

/** Urutan tampil pesan: yang paling mudah diperbaiki karyawan lebih dulu. */
const ISSUE_ORDER: SelfieIssue[] = [
  "helmet",
  "outdoor",
  "unclear_bg",
  "mask",
  "face_cropped",
  "face_angled",
  "face_blurry",
  "no_apron",
  "no_head_cover",
];

/** Murni: amatan AI + aturan → daftar masalah. Hanya filter yang menyala yang dihitung. */
export function issuesFromObservation(obs: SelfieObservation, rules: SelfieRuleSet): SelfieIssue[] {
  const found = new Set<SelfieIssue>();
  const f = rules.filters;
  if (f.indoor) {
    if (obs.location === "outdoor") found.add("outdoor");
    // Latar tak jelas = ditolak (keputusan: "latar harus jelas indoor").
    else if (obs.location !== "indoor") found.add("unclear_bg");
    if (obs.helmet) found.add("helmet");
  }
  if (f.face_full) {
    if (obs.face === "cropped") found.add("face_cropped");
    else if (obs.face === "angled") found.add("face_angled");
    else if (obs.face === "blurry") found.add("face_blurry");
  }
  // Face shield bening yang wajahnya tetap terlihat BOLEH; hanya penutup hidung/mulut yang ditolak.
  if (f.no_mask && obs.mask === "covering") found.add("mask");
  if (f.apron && obs.apron !== true) found.add("no_apron");
  if (rules.headCover && obs.head_cover !== true) found.add("no_head_cover");
  return ISSUE_ORDER.filter((i) => found.has(i));
}

/** Murni: satu baris per masalah, dipisah "\n". */
export function messageFromIssues(issues: SelfieIssue[]): string {
  return issues.map((i) => ISSUE_MESSAGE[i]).join("\n");
}

/** Murni: hanya filter yang menyala yang diminta ke model (output & input lebih pendek). */
export function buildPrompt(rules: SelfieRuleSet): string {
  const f = rules.filters;
  const lines = ["Foto selfie absen karyawan toko kue. Jawab JSON sesuai skema; nilai hanya yang benar-benar terlihat."];
  if (f.indoor) {
    lines.push(
      "location: indoor bila latar jelas ruangan (dinding, plafon, lampu, rak, etalase, dapur). outdoor bila terlihat motor/kendaraan, parkiran, jalan, langit, pohon, cahaya matahari langsung, atau teras terbuka (termasuk teras depan toko). unclear bila latar tidak cukup terlihat.",
      "helmet: true bila helm sedang dipakai.",
    );
  }
  if (f.face_full) {
    lines.push(
      "face: full bila seluruh kepala (dahi atau tepi hijab sampai dagu) masuk bingkai, menghadap kamera, kedua mata jelas. cropped bila ada bagian kepala terpotong. angled bila wajah miring/menoleh/menunduk. blurry bila buram.",
    );
  }
  if (f.no_mask) {
    lines.push(
      "mask: covering bila masker atau kain menutupi hidung atau mulut. clear_shield bila hanya pelindung wajah plastik bening dan wajah tetap terlihat. none bila tidak ada. Kacamata, topi, dan hijab bukan masker.",
    );
  }
  if (f.apron) {
    lines.push("apron: true bila apron terlihat, termasuk bila hanya tali atau bagian atasnya di bahu/dada.");
  }
  if (rules.headCover) {
    lines.push("head_cover: true bila kupluk/beanie/topi atau penutup kepala menutupi rambut.");
  }
  return lines.join("\n");
}

function buildSchema(rules: SelfieRuleSet) {
  const f = rules.filters;
  const properties: Record<string, unknown> = {};
  if (f.indoor) {
    properties.location = { type: "STRING", enum: ["indoor", "outdoor", "unclear"] };
    properties.helmet = { type: "BOOLEAN" };
  }
  if (f.face_full) properties.face = { type: "STRING", enum: ["full", "cropped", "angled", "blurry"] };
  if (f.no_mask) properties.mask = { type: "STRING", enum: ["none", "covering", "clear_shield"] };
  if (f.apron) properties.apron = { type: "BOOLEAN" };
  if (rules.headCover) properties.head_cover = { type: "BOOLEAN" };
  return { type: "OBJECT", properties, required: Object.keys(properties) };
}

/** Murni: teks panduan singkat di bawah oval kamera, sesuai filter yang menyala. */
export function guideHint(rules: SelfieRuleSet): string {
  const f = rules.filters;
  const parts: string[] = [];
  if (f.face_full) parts.push("seluruh wajah di dalam oval");
  if (f.apron) parts.push("bahu dan apron terlihat");
  if (f.indoor) parts.push("di dalam ruangan, tanpa helm");
  if (f.no_mask) parts.push("tanpa masker");
  if (rules.headCover) parts.push("pakai penutup kepala");
  if (parts.length === 0) return "";
  const text = parts.join(", ");
  return text[0].toUpperCase() + text.slice(1);
}

/** Ada yang perlu diperiksa? (aturan dengan semua filter mati tidak memanggil AI.) */
export function hasActiveFilters(rules: SelfieRuleSet): boolean {
  const f = rules.filters;
  return f.indoor || f.face_full || f.no_mask || f.apron || rules.headCover;
}

interface GeminiBody {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  error?: { message?: string };
}

export async function judgeSelfie(bytes: ArrayBuffer, mime: string, rules: SelfieRuleSet): Promise<SelfieJudgement> {
  const key = process.env.GOOGLE_GENAI_API_KEY || process.env.GEMINI_API_KEY;
  if (!key) return { status: "error", error: "GOOGLE_GENAI_API_KEY belum diatur" };
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      signal: ctrl.signal,
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: buildPrompt(rules) },
              { inline_data: { mime_type: mime, data: Buffer.from(bytes).toString("base64") } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          // Mengamati isi foto (bukan bernalar panjang): thinking bawaan 2.5 Flash hanya menambah biaya.
          thinkingConfig: { thinkingBudget: 0 },
          responseMimeType: "application/json",
          responseSchema: buildSchema(rules),
        },
      }),
    });
    const body = (await res.json().catch(() => ({}))) as GeminiBody;
    if (!res.ok) return { status: "error", error: body.error?.message ?? `HTTP ${res.status}` };
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return { status: "error", error: "Jawaban AI kosong" };
    const issues = issuesFromObservation(JSON.parse(text) as SelfieObservation, rules);
    if (issues.length === 0) return { status: "ok" };
    return { status: "reject", issues, message: messageFromIssues(issues) };
  } catch (e) {
    return { status: "error", error: e instanceof Error ? e.message : "AI gagal" };
  } finally {
    clearTimeout(timer);
  }
}
