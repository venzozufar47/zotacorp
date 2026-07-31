/**
 * Shell standalone untuk /pengadaan — papan pantau stok bahan baku.
 * Mirror pola /sim-cards & /tickets: single-purpose tanpa sidebar;
 * back-link ke /dashboard disediakan halamannya sendiri.
 *
 * Sengaja DI LUAR /admin: middleware sudah menendang non-admin dari
 * /admin/*, jadi menaruhnya di sini menghindari carve-out ketiga dan
 * sekaligus jadi lapis pertahanan tambahan untuk resep/HPP.
 */
export default function PengadaanLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1400px] mx-auto px-4 py-5 md:px-6">{children}</div>
    </div>
  );
}
