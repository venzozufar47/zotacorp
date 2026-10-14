/**
 * Standalone shell untuk /sop-saya — halaman pemilik SOP. Mirror pola
 * /sim-cards: single-purpose tanpa sidebar; back-link disediakan halamannya.
 */
export default function SopOwnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[900px] mx-auto px-4 py-5 md:px-6">{children}</div>
    </div>
  );
}
