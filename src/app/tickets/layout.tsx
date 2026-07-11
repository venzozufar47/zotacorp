/**
 * Standalone shell for /tickets — Ticketing System (Yeobo Space Studio).
 * Mirror pola /cake-orders: halaman single-purpose yang dibuka staf tanpa
 * sidebar; header halaman punya back-link ke /dashboard sendiri.
 */
export default function TicketsLayout({
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
