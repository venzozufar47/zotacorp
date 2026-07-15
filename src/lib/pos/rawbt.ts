"use client";

import { bytesToBase64 } from "./escpos";

/**
 * Kirim byte ESC/POS ke printer lewat app RawBT (Android).
 *
 * RawBT mendaftarkan skema intent `rawbt`; kita bangun Android intent
 * URL berisi payload base64. Menavigasi ke URL ini membuat Chrome
 * meneruskannya ke RawBT, yang lalu mencetak ke printer Bluetooth yang
 * sudah di-pair di dalam RawBT.
 *
 * Bonus: jika RawBT belum terpasang, Chrome otomatis membuka halaman
 * Play Store aplikasi (fallback `S.browser_fallback_url` tak diperlukan
 * — package resolver Chrome yang menanganinya).
 *
 * Sumber format: rawbt.ru/intents.html.
 */

const RAWBT_PACKAGE = "ru.a402d.rawbtprinter";

/** True kalau kemungkinan besar berjalan di Android (RawBT Android-only). */
export function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android/i.test(navigator.userAgent);
}

/**
 * Bangun intent URL RawBT untuk payload biner base64.
 * `intent:base64,<DATA>#Intent;scheme=rawbt;package=<pkg>;end;`
 */
export function buildRawbtIntentUrl(base64: string): string {
  return `intent:base64,${base64}#Intent;scheme=rawbt;package=${RAWBT_PACKAGE};end;`;
}

/**
 * Cetak byte ESC/POS via RawBT. Melempar bila navigasi gagal (jarang) —
 * pemanggil sebaiknya bungkus dengan toast.
 */
export function printReceipt(bytes: Uint8Array): void {
  const url = buildRawbtIntentUrl(bytesToBase64(bytes));
  // Navigasi lokasi memicu resolver intent Android. Pakai assignment
  // langsung (bukan anchor) supaya konsisten di Chrome Android.
  window.location.href = url;
}
