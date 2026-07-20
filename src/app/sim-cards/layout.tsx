/**
 * Standalone shell for /sim-cards — halaman penanggung jawab kartu SIM.
 * Mirror pola /tickets: single-purpose tanpa sidebar; back-link ke
 * /dashboard disediakan halamannya sendiri.
 */
export default function SimCardsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1100px] mx-auto px-4 py-5 md:px-6">{children}</div>
    </div>
  );
}
