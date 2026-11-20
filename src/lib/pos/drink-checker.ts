/**
 * Checker minuman: slip kecil per GELAS untuk bartender, ditempel ke gelas lalu
 * ikut ke customer. Tanpa harga. Pencocok ke nota utama: nama pemesan + `#id`
 * 8 karakter yang sama dengan footer struk.
 *
 * Penanda minuman = `ReceiptItem.drink` (item dengan tingkat gula). Le Mineral tak
 * ber-gula, jadi otomatis tak masuk. Printer tanpa pemotong: tiap slip ditutup
 * garis putus-putus untuk disobek/digunting.
 */

import { EscPosBuilder } from "./escpos";
import { fulfillmentLabel, wrapText, type ReceiptData } from "./receipt";
import { DEFAULT_LABELS } from "./receipt-settings";

/** Lebar baris untuk teks ukuran "double" (2x lebar) pada kertas 32 kolom. */
const DOUBLE_COLS = 16;

export interface DrinkCup {
  name: string;
  sugar: string | null;
}

/** "Drinks — Matcha Latte" → "Matcha Latte": awalan nama produk induk tak berguna di gelas. */
function cupName(name: string): string {
  return name.replace(/^drinks\s*[—–-]\s*/i, "").trim() || name;
}

/** Satu entri per gelas (qty 3 → 3 entri), urut seperti di nota. */
export function drinkCups(data: ReceiptData): DrinkCup[] {
  const cups: DrinkCup[] = [];
  for (const it of data.items) {
    if (!it.drink) continue;
    for (let i = 0; i < it.qty; i++) {
      cups.push({ name: cupName(it.name), sugar: it.note ?? null });
    }
  }
  return cups;
}

export function buildDrinkCheckerBytes(data: ReceiptData): Uint8Array {
  const cups = drinkCups(data);
  const L = data.labels ?? DEFAULT_LABELS;
  const mode = fulfillmentLabel(data.fulfillment ?? null, L);
  const customer = data.customerName?.trim();
  const b = new EscPosBuilder();
  b.init();

  cups.forEach((cup, i) => {
    b.align("center").size("normal").bold(true).textLine(`MINUMAN ${i + 1}/${cups.length}`);

    // Bagian untuk bartender: apa yang dibuat.
    b.size("tall").bold(true);
    for (const l of wrapText(cup.name)) b.textLine(l);
    if (cup.sugar) b.textLine(cup.sugar);
    b.size("normal").bold(false).line();

    // Bagian pencocok: siapa pemiliknya.
    if (customer) {
      b.size("double").bold(true);
      for (const l of wrapText(customer, DOUBLE_COLS)) b.textLine(l);
      b.size("normal");
    }
    if (mode) b.bold(true).textLine(mode.toUpperCase());
    b.bold(false);
    if (data.saleShortId) b.textLine(`#${data.saleShortId}`);
    b.textLine(data.datetime);

    // Garis sobek antar slip.
    b.align("left").textLine("- ".repeat(16).trimEnd()).feed(2);
  });

  b.feed(2);
  return b.build();
}
