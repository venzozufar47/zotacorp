/**
 * Foto produk POS. File ada di public/pos-products/ (WebP 512×512,
 * latar transparan), diberi nama sesuai nama produk di POS. Dicocokkan lewat
 * nama produk (huruf kecil, spasi dirapikan) sehingga satu foto berlaku
 * untuk produk bernama sama di semua cabang.
 */
const IMAGES: Record<string, string> = {
  "tres leches": "tres-leches",
  "mille crepes": "mille-crepes",
  "fudgy brownies": "fudgy-brownies",
  "matcha strawberry cake": "matcha-strawberry-cake",
  "dubai chewy cookie": "dubai-chewy-cookie",
  tiramisu: "tiramisu",
  "red velvet": "red-velvet",
  "cheesecake (burnt)": "cheesecake-burnt",
  bcb: "bcb", // Burnt Cheesecake Brownies
  "bcb matcha": "bcb-matcha", // Burnt Cheesecake Brownies Matcha
  "black forest": "black-forest",
  "soft cookies": "soft-cookies",
  "cranberry walnut sourdough": "cranberry-walnut-sourdough",
  "salt bread": "salt-bread",
  "banana strudel": "banana-strudel",
  "swirl puff": "swirl-puff",
  "fruit puff": "fruit-puff",
  croissant: "croissant",
};

function norm(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function productImageSrc(name: string): string | null {
  const file = IMAGES[norm(name)];
  return file ? `/pos-products/${file}.webp` : null;
}
