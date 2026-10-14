import { subscribeToPush } from "@/lib/actions/push.actions";

/**
 * Satu endpoint push browser = satu user (`push_subscriptions.endpoint` UNIQUE).
 * Setelah ganti akun, langganan push browser ini masih tercatat atas akun
 * LAMA — panggil ini (setelah cookie sesi berganti) supaya notifikasi pindah
 * ke akun yang sekarang aktif. Tidak meminta izin baru: bila izin belum
 * diberikan atau belum ada langganan, tidak melakukan apa pun.
 */
export async function rebindPushToCurrentUser(): Promise<void> {
  try {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    // getRegistration (bukan `.ready`) supaya tidak menggantung bila SW belum terpasang.
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    const json = JSON.parse(JSON.stringify(sub)) as {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    };
    await subscribeToPush({ endpoint: json.endpoint, keys: json.keys }, navigator.userAgent);
  } catch {
    // Best-effort: gagal rebind tidak boleh menghalangi pindah akun.
  }
}
