/**
 * Kategori baku bahan Haengbocake (12 kategori MECE, migrasi 223) + tebakan kategori dari nama bahan.
 * Dipakai supaya bahan baru dari pengadaan tidak lagi masuk tanpa kategori. Tebakan hanya mengisi awal:
 * petugas/owner tetap bisa mengganti. Urutan aturan penting — yang lebih spesifik harus di atas.
 */
export const MATERIAL_CATEGORIES = [
  "Tepung & Pati",
  "Gula & Pemanis",
  "Susu & Lemak",
  "Telur",
  "Coklat & Kakao",
  "Buah & Kacang",
  "Topping & Isian",
  "Pengembang, Perisa & Garam",
  "Minuman",
  "Bahan Setengah Jadi",
  "Kemasan & Label",
  "Perlengkapan Saji",
] as const;

export type MaterialCategory = (typeof MATERIAL_CATEGORIES)[number];

export function isMaterialCategory(v: string | null | undefined): v is MaterialCategory {
  return !!v && (MATERIAL_CATEGORIES as readonly string[]).includes(v);
}

const RULES: [MaterialCategory, RegExp][] = [
  ["Kemasan & Label", /\b(kemasan|box|kotak|kardus|plastik|thinwal+|thinwall|cup|tutup|sedotan|stiker|label|tatakan|paping|kantong|mika|wrap)\b/],
  ["Perlengkapan Saji", /\b(lilin|pisau|sendok kayu|greeting|baking paper|kertas roti)\b/],
  ["Gula & Pemanis", /\b(gula|sugar|maple|madu|honey|molases|pemanis)s?\b/],
  ["Minuman", /\b(syrup|sirup|kopi|nescafe|juice|jus|minuman|teh|es batu|air|galon|yakult|mineral|minerale)s?\b/],
  ["Pengembang, Perisa & Garam", /\b(pewarna|perisa|essence|esens|vanil+a?|ragi|baking soda|baking powder|garam|salt|sp|emulsifier|kayu manis|cinnamon)s?\b/],
  ["Telur", /\b(telur|egg)s?\b/],
  ["Tepung & Pati", /\b(tepung|maizena|tapioka|pati|terigu|flour|tegral)s?\b/],
  ["Coklat & Kakao", /\b(coklat|cokelat|chocolate|choco|chococip|cocoa|kakao|collata|colatta|compound|nutella)s?\b/],
  ["Bahan Setengah Jadi", /\b(pastry|puff|danish|adonan)s?\b/],
  ["Topping & Isian", /\b(filling|isian|topping|glaze|marshmallow|meses|pocky|beng|crumble|oreo|ladyfinger|kunafa|kataifi|selai)s?\b/],
  ["Susu & Lemak", /\b(susu|milk|butter|mentega|margarin|keju|cheese|creamcheese|cream|krim|yogurt|yoghurt|minyak|whipping|skm)s?\b/],
  ["Buah & Kacang", /\b(almond|walnut|kacang|pisang|strawberry|strawbery|stroberi|anggur|jeruk|lemon|mangga|mango|cranberry|blueberry|buah|kismis|raisin|lychee|leci|pistachio)s?\b/],
];

/** Tebakan kategori dari nama bahan; null bila tak ada aturan yang cocok (petugas diminta memilih). */
export function suggestMaterialCategory(name: string): MaterialCategory | null {
  const n = name.toLowerCase().replace(/[()/,.+-]/g, " ").replace(/\s+/g, " ").trim();
  if (!n) return null;
  for (const [cat, re] of RULES) if (re.test(n)) return cat;
  return null;
}
