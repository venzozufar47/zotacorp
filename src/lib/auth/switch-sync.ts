/**
 * Sinkronisasi antar-tab saat ganti akun. Cookie sesi dipakai bersama SEMUA tab
 * di browser, jadi setelah pindah akun di satu tab, tab lain yang masih
 * menampilkan akun lama diam-diam bertindak sebagai akun baru (mis. absen /
 * kirim form atas nama orang yang salah). Tab yang berpindah menulis kunci ini;
 * tab lain (event `storage` hanya terpicu di tab LAIN) memuat ulang dirinya.
 */
export const ACCOUNT_SWITCH_KEY = "zota:account-switched";

export function announceAccountSwitch(): void {
  try {
    localStorage.setItem(ACCOUNT_SWITCH_KEY, String(Date.now()));
  } catch {
    // Storage diblokir (mode privat dsb.) — tab lain cukup tidak ikut reload.
  }
}
