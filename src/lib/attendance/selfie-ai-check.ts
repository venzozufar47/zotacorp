/**
 * Flag anomali foto selfie check-in via Gemini — lihat migrasi 134 untuk
 * alasan desainnya (async, tidak pernah menggagalkan check-in).
 *
 * Dipanggil HANYA dari dalam `after()` di `checkIn()` (attendance.actions.ts),
 * setelah respons check-in sudah dikirim. Modul biasa, bukan `"use server"` —
 * bukan endpoint yang boleh dipanggil klien.
 *
 * FETCH LANGSUNG, BUKAN SDK. Satu panggilan REST sederhana; menambah
 * dependency `@google/genai` untuk satu fungsi ini tidak sepadan. Kalau
 * kelak ada fitur Gemini kedua, saat itu baru masuk akal ditarik jadi SDK
 * bersama.
 *
 * KENAPA thinkingConfig.thinkingBudget=0: ini klasifikasi biner sederhana,
 * bukan penalaran berlapis. Extended thinking (default 2.5 Flash) menambah
 * ~120 token "pikiran" tersembunyi yang tetap kena tarif output TANPA
 * mengubah kualitas jawaban untuk tugas sesederhana ini — diverifikasi
 * langsung lewat panggilan API sebelum kode ini ditulis.
 */

import { createClient } from "@/lib/supabase/server";

const MODEL = "gemini-2.5-flash";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Instruksi SENGAJA longgar. Salah tandai foto normal sebagai "anomaly"
 * (false positive) merusak kepercayaan karyawan terhadap sistem absen —
 * jauh lebih mahal daripada melewatkan satu foto aneh yang sebenarnya
 * (false negative, yang di sini masih bisa ketahuan manual seperti
 * sebelumnya). Prompt eksplisit menyebut kondisi yang TETAP "ok" supaya
 * model tidak over-eager menandai pencahayaan buruk / masker / hijab /
 * sudut kamera aneh sebagai masalah.
 */
const PROMPT = `Kamu memeriksa foto selfie absen kerja karyawan. Tugasmu HANYA menilai apakah foto ini benar-benar foto seseorang, bukan menilai kualitas atau kerapian.

TETAP "ok" meskipun: pencahayaan buram/gelap, sudut kamera aneh, wajah sebagian tertutup masker/hijab/kacamata/topi, ekspresi apa pun, kualitas foto jelek.

Tandai "anomaly" HANYA kalau foto JELAS bukan foto langsung seseorang: layar kosong/hitam/putih polos, foto dari galeri/foto-dari-foto (ada bingkai layar HP lain kelihatan), objek/pemandangan tanpa orang sama sekali, atau gambar acak tidak terkait (dokumen, meme, dsb).

Kalau ragu, pilih "ok" — tugasmu memberi tanda untuk admin, bukan memutuskan.

Balas HANYA JSON sesuai schema. "note" singkat (maks 15 kata) dalam Bahasa Indonesia, jelaskan alasannya HANYA kalau anomaly; kalau ok isi note dengan string kosong.`;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    flag: { type: "STRING", enum: ["ok", "anomaly"] },
    note: { type: "STRING" },
  },
  required: ["flag", "note"],
} as const;

/** Ekstensi dari path storage — dipetakan ke MIME untuk inlineData. */
function mimeFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    heic: "image/heic",
    heif: "image/heif",
  };
  return map[ext] ?? "image/jpeg";
}

export async function runSelfieAiCheck(input: {
  logId: string;
  selfiePath: string;
}): Promise<void> {
  // Seluruh fungsi sengaja satu try/catch besar: dipanggil dari after(),
  // jadi tidak ada apa pun yang menunggu hasilnya — kegagalan di sini
  // TIDAK BOLEH pernah muncul sebagai error ke karyawan. Cukup dicatat.
  try {
    const apiKey = process.env.GOOGLE_GENAI_API_KEY;
    if (!apiKey) return; // Fitur nonaktif diam-diam kalau key belum diset.

    const supabase = await createClient();
    const { data: fileBlob, error: dlErr } = await supabase.storage
      .from("attendance-selfies")
      .download(input.selfiePath);
    if (dlErr || !fileBlob) {
      console.error("[selfie-ai-check] download failed", input.logId, dlErr);
      return;
    }

    const buf = Buffer.from(await fileBlob.arrayBuffer());
    // Batas kasar: foto normal setelah kompresi client ada di kisaran
    // puluhan-ratusan KB. Di atas 4MB kemungkinan bukan selfie wajar —
    // lewati saja daripada kirim payload besar yang mahal ke Gemini.
    if (buf.byteLength > 4 * 1024 * 1024) return;

    const body = {
      contents: [
        {
          role: "user",
          parts: [
            { text: PROMPT },
            {
              inlineData: {
                mimeType: mimeFromPath(input.selfiePath),
                data: buf.toString("base64"),
              },
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        thinkingConfig: { thinkingBudget: 0 },
      },
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/${MODEL}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      console.error("[selfie-ai-check] API error", input.logId, res.status, await res.text().catch(() => ""));
      return;
    }

    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const raw = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) return;

    let parsed: { flag?: string; note?: string };
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error("[selfie-ai-check] unparseable response", input.logId, raw);
      return;
    }
    if (parsed.flag !== "ok" && parsed.flag !== "anomaly") return;

    await supabase
      .from("attendance_logs")
      .update({
        selfie_ai_flag: parsed.flag,
        selfie_ai_note: parsed.flag === "anomaly" ? (parsed.note?.trim() || null) : null,
      })
      .eq("id", input.logId);
  } catch (e) {
    console.error("[selfie-ai-check] unhandled", input.logId, e);
  }
}
