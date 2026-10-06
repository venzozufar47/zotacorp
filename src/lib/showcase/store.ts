/**
 * Mode Showcase — saklar global "sembunyikan semua angka" untuk presentasi.
 *
 * State disimpan di localStorage supaya bertahan saat reload / pindah tab
 * (kalau tidak, angka sempat muncul lagi di tengah presentasi). Modul ini
 * sengaja tidak menyentuh `window` di top-level agar aman diimpor dari server
 * component (layout memakai `SHOWCASE_STORAGE_KEY`).
 */

export const SHOWCASE_STORAGE_KEY = "zota-showcase";

const listeners = new Set<() => void>();
let memoryValue = false;
let storageListenerAttached = false;

function readStored(): boolean {
  try {
    return window.localStorage.getItem(SHOWCASE_STORAGE_KEY) === "1";
  } catch {
    // Storage diblokir (private window dll) → pakai nilai di memori.
    return memoryValue;
  }
}

function emit() {
  listeners.forEach((l) => l());
}

export function getShowcase(): boolean {
  return readStored();
}

export function getShowcaseServerSnapshot(): boolean {
  return false;
}

export function setShowcase(next: boolean) {
  memoryValue = next;
  try {
    if (next) window.localStorage.setItem(SHOWCASE_STORAGE_KEY, "1");
    else window.localStorage.removeItem(SHOWCASE_STORAGE_KEY);
  } catch {
    // ignore — memoryValue tetap menjaga state selama sesi.
  }
  emit();
}

function onStorage(e: StorageEvent) {
  // key === null → localStorage.clear() dari tab lain.
  if (e.key === null || e.key === SHOWCASE_STORAGE_KEY) emit();
}

export function subscribeShowcase(listener: () => void): () => void {
  listeners.add(listener);
  if (!storageListenerAttached) {
    window.addEventListener("storage", onStorage);
    storageListenerAttached = true;
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && storageListenerAttached) {
      window.removeEventListener("storage", onStorage);
      storageListenerAttached = false;
    }
  };
}
