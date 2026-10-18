/**
 * Membaca sisa token/kWh dari foto layar meteran listrik prabayar dengan Google Gemini
 * (free tier). Modul biasa (bukan "use server"): dipanggil dari server action.
 *
 * Env:
 *  - GEMINI_API_KEY (disarankan: key dari project tanpa penagihan agar benar-benar free tier).
 *    Bila kosong, jatuh ke GOOGLE_GENAI_API_KEY (project berbayar yang sudah ada).
 *  - GEMINI_MODEL   (opsional; default di bawah — ganti bila model itu dipensiunkan)
 *
 * Hasilnya sengaja tiga keadaan, bukan benar/salah: "tak terbaca" dan "AI gagal" harus bisa
 * dibedakan dari "jelas di bawah batas", karena hanya yang terakhir boleh memblokir karyawan.
 */

const DEFAULT_MODEL = "gemini-2.5-flash";
const TIMEOUT_MS = 20_000;

export type MeterReading =
  | { status: "ok"; kwh: number }
  | { status: "unreadable" }
  | { status: "error"; error: string };

// Prompt sengaja pendek: tiap token input dibayar di setiap foto. Diuji pada foto asli — hasil sama
// akuratnya dengan versi panjang (3 kali lebih sedikit token input).
const PROMPT = `Foto meteran listrik prabayar PLN. Salin semua digit yang tampil di layar LCD (kiri ke kanan, tanpa titik/koma/spasi). Dua digit terakhir adalah desimal; jangan membagi sendiri. is_meter=false bila bukan meteran listrik; digits="" bila ragu atau tidak jelas. Abaikan nomor meter, tegangan, tanggal.`;

interface GeminiBody {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  error?: { message?: string };
}

export async function readMeterKwh(bytes: ArrayBuffer, mime: string): Promise<MeterReading> {
  // GEMINI_API_KEY (key project TANPA penagihan = free tier, tak pernah tertagih) didahulukan;
  // GOOGLE_GENAI_API_KEY (project berbayar yang sudah ada) hanya cadangan bila yang pertama kosong.
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
  if (!key) return { status: "error", error: "GEMINI_API_KEY belum diatur" };
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
              { text: PROMPT },
              { inline_data: { mime_type: mime, data: Buffer.from(bytes).toString("base64") } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          // Membaca angka di layar adalah OCR, bukan penalaran: "thinking" bawaan 2.5 Flash menambah
          // ratusan token output tersembunyi per foto tanpa mengubah hasil (diuji pada foto asli).
          thinkingConfig: { thinkingBudget: 0 },
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              is_meter: { type: "BOOLEAN" },
              digits: { type: "STRING" },
            },
            required: ["is_meter", "digits"],
          },
        },
      }),
    });
    const body = (await res.json().catch(() => ({}))) as GeminiBody;
    if (!res.ok) return { status: "error", error: body.error?.message ?? `HTTP ${res.status}` };
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return { status: "error", error: "Jawaban AI kosong" };
    const parsed = JSON.parse(text) as { is_meter?: boolean; digits?: string };
    // Format layar token tetap: dua digit terakhir = desimal. Pembagiannya dilakukan DI SINI, bukan oleh
    // model, supaya "8068" tidak pernah terbaca 8068 atau 806,8 hanya karena titik desimalnya kecil.
    const digits = (parsed.digits ?? "").replace(/\s/g, "");
    if (!parsed.is_meter || !/^\d{1,8}$/.test(digits)) {
      return { status: "unreadable" };
    }
    return { status: "ok", kwh: Number(digits) / 100 };
  } catch (e) {
    return { status: "error", error: e instanceof Error ? e.message : "AI gagal" };
  } finally {
    clearTimeout(timer);
  }
}
