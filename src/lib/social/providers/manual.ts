import "server-only";
import {
  fail,
  NO_CAPABILITIES,
  type SocialProvider,
} from "@/lib/social/providers/types";

/**
 * Provider inert — akun yang belum tersambung ke API mana pun.
 *
 * Ini yang membuat seluruh fitur bisa dipakai SEBELUM app review Meta/TikTok
 * lolos: akun bisa didaftarkan, kreator default ditetapkan, target KPI disusun,
 * dan halaman admin berjalan penuh, sementara mesin sync sekadar melewatinya.
 *
 * Tidak pernah melempar dan tidak pernah memanggil jaringan; semua operasi
 * mengembalikan `unsupported` dengan 0 panggilan API. Ini juga jaring pengaman
 * registry: nilai provider yang tak dikenal jatuh ke sini, sehingga satu baris
 * data yang salah ketik tidak bisa menjatuhkan cron untuk semua akun lain.
 */
export const manualProvider: SocialProvider = {
  id: "manual",
  platforms: ["instagram", "tiktok", "youtube", "facebook"],
  capabilities: NO_CAPABILITIES,
  refreshLeadMs: 0,

  estimateCalls() {
    return 0;
  },

  async fetchAccount() {
    return fail("unsupported", "Akun belum tersambung ke API mana pun.");
  },

  async listPosts() {
    return fail("unsupported", "Akun belum tersambung ke API mana pun.");
  },

  async fetchPostMetrics() {
    return fail("unsupported", "Akun belum tersambung ke API mana pun.");
  },
};
