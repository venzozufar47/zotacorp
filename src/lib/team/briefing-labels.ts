/** Label tanggal/jam briefing — murni (tanpa "use client") supaya bisa dipanggil dari server component maupun klien. */

/** "2026-10-19" → "Sen, 19 Okt". Tanggal murni tanpa jam, jadi aman di SSR. */
export function briefingDateLabel(ymd: string): string {
  return new Date(`${ymd}T00:00:00`).toLocaleDateString("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** Jam dicatat, selalu WIB supaya sama di server dan di perangkat mana pun. */
export function briefingTimeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}
