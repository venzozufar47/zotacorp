import { AccountTabs } from "@/components/account/AccountTabs";

/**
 * Kerangka bersama Profil, Kontrak, Tes DISC, dan Pengaturan. Rute tetap
 * `/profile`, `/kontrak`, `/disc`, `/settings` (grup rute `(akun)` tidak
 * mengubah URL); tab di atas menyatukan navigasinya.
 */
export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 animate-fade-up">
      <h1 className="sr-only">Akun</h1>
      <AccountTabs />
      {children}
    </div>
  );
}
