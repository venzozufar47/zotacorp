"use client";

import { bytesToBase64 } from "./escpos";
import { printReceipt as printViaRawbt } from "./rawbt";
import type { PrintMethod } from "./receipt-settings";

/**
 * Lapisan transport: satu isi struk (byte ESC/POS), banyak jalur kirim.
 * `sendToPrinter(bytes, method)` memilih jalur sesuai setelan kasir.
 *
 *   - rawbt        → app RawBT via Android intent (Classic + LE).
 *   - webbluetooth → langsung dari Chrome, TANPA app. Hanya printer BLE.
 *   - native       → plugin Capacitor (app native, belum dirilis).
 */

export async function sendToPrinter(
  bytes: Uint8Array,
  method: PrintMethod
): Promise<void> {
  switch (method) {
    case "webbluetooth":
      return printViaWebBluetooth(bytes);
    case "native":
      return printViaNative(bytes);
    case "rawbt":
    default:
      printViaRawbt(bytes);
      return;
  }
}

// ─────────────────────────────────────────────────────────────────────
//  Web Bluetooth (BLE) — tanpa app
// ─────────────────────────────────────────────────────────────────────

// Web Bluetooth belum ada di lib.dom standar TS — deklarasi minimal
// secukupnya supaya type-safe tanpa dependency @types/web-bluetooth.
interface BleCharacteristic {
  properties: { write: boolean; writeWithoutResponse: boolean };
  writeValueWithoutResponse?: (data: Uint8Array) => Promise<void>;
  writeValue: (data: Uint8Array) => Promise<void>;
}
interface BleService {
  getCharacteristics: () => Promise<BleCharacteristic[]>;
}
interface BleServer {
  connect: () => Promise<BleServer>;
  getPrimaryServices: () => Promise<BleService[]>;
}
interface BleDevice {
  gatt?: BleServer;
}
interface BluetoothLike {
  requestDevice: (opts: {
    acceptAllDevices?: boolean;
    optionalServices?: string[];
  }) => Promise<BleDevice>;
}

/** UUID service yang umum dipakai printer thermal ESC/POS BLE murah. */
const BLE_PRINTER_SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb", // ESC/POS umum (char 0x2af1)
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb", // modul HM-10
  "49535343-fe7d-4ae5-8fa9-9fafd205e455", // modul ISSC / Microchip
  "6e400001-b5a3-f393-e0a9-e50e24dcca9e", // Nordic UART
];

function getBluetooth(): BluetoothLike | null {
  const nav = navigator as unknown as { bluetooth?: BluetoothLike };
  return nav.bluetooth ?? null;
}

/** Printer BLE yang sudah dipilih di sesi ini (biar tak minta ulang). */
let cachedDevice: BleDevice | null = null;

async function findWritableCharacteristic(
  server: BleServer
): Promise<BleCharacteristic> {
  const services = await server.getPrimaryServices();
  for (const svc of services) {
    const chars = await svc.getCharacteristics();
    for (const c of chars) {
      if (c.properties.writeWithoutResponse || c.properties.write) return c;
    }
  }
  throw new Error("Printer tak punya kanal tulis BLE yang cocok.");
}

async function printViaWebBluetooth(bytes: Uint8Array): Promise<void> {
  const bt = getBluetooth();
  if (!bt) {
    throw new Error(
      "Browser ini tak mendukung Web Bluetooth. Pakai Chrome Android, atau metode RawBT."
    );
  }

  // requestDevice WAJIB dari gesture user (tombol) saat pertama kali.
  if (!cachedDevice) {
    cachedDevice = await bt.requestDevice({
      acceptAllDevices: true,
      optionalServices: BLE_PRINTER_SERVICES,
    });
  }
  const device = cachedDevice;
  if (!device.gatt) {
    cachedDevice = null;
    throw new Error("Perangkat tak punya GATT (kemungkinan bukan BLE).");
  }

  const server = await device.gatt.connect();
  const ch = await findWritableCharacteristic(server);

  // BLE punya batas MTU — tulis per potongan kecil dengan jeda supaya
  // buffer printer tak overflow.
  const CHUNK = 180;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, i + CHUNK);
    if (ch.properties.writeWithoutResponse && ch.writeValueWithoutResponse) {
      await ch.writeValueWithoutResponse(slice);
    } else {
      await ch.writeValue(slice);
    }
    await new Promise((r) => setTimeout(r, 20));
  }
}

/** Lupakan printer BLE tersimpan (mis. saat ganti perangkat). */
export function forgetBleDevice(): void {
  cachedDevice = null;
}

// ─────────────────────────────────────────────────────────────────────
//  Native (plugin Capacitor) — menyusul saat app native dirilis
// ─────────────────────────────────────────────────────────────────────

interface NativePrinterPlugin {
  print: (opts: { base64: string }) => Promise<void>;
}

/**
 * Jalur native lewat plugin Capacitor. Saat ini app native adalah WebView
 * tipis tanpa plugin printer, jadi ini otomatis mendeteksi ketiadaan
 * plugin dan memberi pesan jelas. Untuk mengaktifkan: pasang plugin
 * Bluetooth-serial/thermal di app native (expose sebagai
 * `Capacitor.Plugins.ThermalPrinter` dengan `print({ base64 })`) lalu
 * rilis ulang.
 */
async function printViaNative(bytes: Uint8Array): Promise<void> {
  const cap = (window as unknown as {
    Capacitor?: { Plugins?: Record<string, unknown> };
  }).Capacitor;
  const plugin = cap?.Plugins?.ThermalPrinter as NativePrinterPlugin | undefined;
  if (!plugin?.print) {
    throw new Error(
      "Metode Native belum tersedia di app ini. Butuh update app native. Sementara pakai RawBT atau Web Bluetooth."
    );
  }
  await plugin.print({ base64: bytesToBase64(bytes) });
}
