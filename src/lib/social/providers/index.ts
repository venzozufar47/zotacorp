import "server-only";
import type { ProviderId } from "@/lib/social/types";
import type { SocialProvider } from "@/lib/social/providers/types";
import { manualProvider } from "@/lib/social/providers/manual";

/**
 * Registry adapter.
 *
 * Provider dipilih PER AKUN dari kolom social_accounts.provider, jadi Yeobo
 * Space bisa memakai Instagram Graph API sementara Haengbocake masih 'manual',
 * tanpa deploy dan tanpa percabangan kode di tempat lain.
 *
 * Adapter resmi (instagram_graph, tiktok_display) menyusul di Fase 2-3; sampai
 * saat itu semuanya menunjuk provider inert supaya nilai kolom yang sudah sah
 * di database tidak pernah membuat mesin sync melempar.
 */
const REGISTRY: Record<ProviderId, SocialProvider> = {
  manual: manualProvider,
  instagram_graph: manualProvider,
  tiktok_display: manualProvider,
  ayrshare: manualProvider,
  phyllo: manualProvider,
  scrape_generic: manualProvider,
};

/**
 * Selalu mengembalikan sesuatu yang bisa dipakai.
 *
 * Nilai tak dikenal (baris lama, salah ketik manual di SQL, provider yang
 * dihapus) jatuh ke provider inert alih-alih melempar: cron memproses banyak
 * akun dalam satu jalan, dan satu baris rusak tidak boleh menjatuhkan sync
 * seluruh perusahaan.
 */
export function getProvider(id: string | null | undefined): SocialProvider {
  if (!id) return manualProvider;
  return REGISTRY[id as ProviderId] ?? manualProvider;
}

/** Apakah provider ini benar-benar bisa mengambil data (bukan inert). */
export function isLiveProvider(id: string | null | undefined): boolean {
  return getProvider(id).id !== "manual";
}
