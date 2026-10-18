/**
 * Membaca sisa token/kWh dari foto layar meteran listrik prabayar dengan Google Gemini
 * (free tier). Modul biasa (bukan "use server"): dipanggil dari server action.
 *
 * Env:
 *  - GOOGLE_GENAI_API_KEY (wajib; key Gemini yang sudah dipakai proyek ini). GEMINI_API_KEY diterima sebagai alias.
 *  - GEMINI_MODEL   (opsional; default di bawah — ganti bila model itu dipensiunkan)
 *
 * Hasilnya sengaja tiga keadaan, bukan benar/salah: "tak terbaca" dan "AI gagal" harus bisa
 * dibedakan dari "jelas di bawah batas", karena hanya yang terakhir boleh memblokir karyawan.
 */

const DEFAULT_MODEL = "gemini-2.5-flash";
const TIMEOUT_MS = 20_000;

export type MeterReading =
  | { status: "ok"; kwh: number }
  | { status: "unreadable"; note: string }
  | { status: "error"; error: string };

const PROMPT = `Ini foto layar atau meteran listrik prabayar (token PLN).
Layar menampilkan SISA token/saldo dalam kWh. FORMATNYA TETAP: DUA ANGKA TERAKHIR adalah desimal
(selalu ada ",00"). Contoh: layar "8068" berarti 80,68 kWh; "1466" berarti 14,66 kWh; "10000" berarti
100,00 kWh. Tanda desimalnya sering kecil atau tidak terlihat — jangan bergantung padanya.
Tugasmu: salin SEMUA digit yang tampil di layar, urut dari kiri ke kanan, TANPA titik/koma/spasi.
Jawab HANYA JSON: {"is_meter": boolean, "digits": string, "note": string singkat}.
Aturan:
- digits hanya berisi angka 0-9 (contoh "8068"). Jangan membagi atau menambahkan desimal sendiri.
- is_meter=false bila foto bukan layar/meteran listrik.
- digits="" bila angka tidak jelas, terpotong, buram, atau ragu-ragu. Jangan menebak.
- Ambil angka SISA kWh di layar, bukan nomor meter, tegangan, daya, atau tanggal.`;

interface GeminiBody {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  error?: { message?: string };
}

export async function readMeterKwh(bytes: ArrayBuffer, mime: string): Promise<MeterReading> {
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
              { text: PROMPT },
              { inline_data: { mime_type: mime, data: Buffer.from(bytes).toString("base64") } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              is_meter: { type: "BOOLEAN" },
              digits: { type: "STRING" },
              note: { type: "STRING" },
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
    const parsed = JSON.parse(text) as { is_meter?: boolean; digits?: string; note?: string };
    // Format layar token tetap: dua digit terakhir = desimal. Pembagiannya dilakukan DI SINI, bukan oleh
    // model, supaya "8068" tidak pernah terbaca 8068 atau 806,8 hanya karena titik desimalnya kecil.
    const digits = (parsed.digits ?? "").replace(/\s/g, "");
    if (!parsed.is_meter || !/^\d{1,8}$/.test(digits)) {
      return { status: "unreadable", note: parsed.note?.slice(0, 200) ?? "" };
    }
    return { status: "ok", kwh: Number(digits) / 100 };
  } catch (e) {
    return { status: "error", error: e instanceof Error ? e.message : "AI gagal" };
  } finally {
    clearTimeout(timer);
  }
}
