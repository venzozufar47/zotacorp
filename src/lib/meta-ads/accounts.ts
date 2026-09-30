/**
 * Dua business portfolio Meta yang terpisah (system user "Zota App"
 * dibuat ulang di masing-masing, tidak bisa dipakai lintas portfolio) —
 * jadi kredensialnya juga dua pasang env var terpisah, bukan satu akun
 * dengan banyak ad account. Terpisah dari `meta-ads.actions.ts` karena
 * file "use server" hanya boleh mengekspor async function, bukan objek.
 */
export const META_ADS_ACCOUNTS = {
  yeobo: {
    label: "Yeobo Space",
    tokenEnv: "META_ACCESS_TOKEN",
    accountEnv: "META_AD_ACCOUNT_ID",
  },
  hbc: {
    label: "Haengbocake",
    tokenEnv: "META_ACCESS_TOKEN_HBC",
    accountEnv: "META_AD_ACCOUNT_ID_HBC",
  },
} as const;

export type MetaAdsAccountKey = keyof typeof META_ADS_ACCOUNTS;

/** URL /admin/ads dengan account+period sebagai query param, dipakai
 *  AccountToggle dan PeriodToggle — satu tempat supaya dua toggle itu
 *  tidak masing-masing menulis ulang logika yang sama. */
export function metaAdsHref(
  accountKey: MetaAdsAccountKey,
  period: "this_month" | "last_month"
): string {
  const params = new URLSearchParams();
  if (accountKey !== "yeobo") params.set("account", accountKey);
  if (period !== "this_month") params.set("period", period);
  const qs = params.toString();
  return qs ? `/admin/ads?${qs}` : "/admin/ads";
}
