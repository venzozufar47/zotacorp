import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";

export default function EmployeeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar className="hidden md:flex" />
      <main className="flex-1 min-w-0">
        {/* Matches the admin layout's fluid cap so the attendance history
            table gets room to breathe on 1440p / 1920p monitors. Pages
            designed for phone-shaped layouts (profile, dashboard, etc.)
            can still wrap their own content in a narrower `max-w-2xl` if
            they want the original feel on wide screens. */}
        <div className="max-w-[1700px] mx-auto px-4 py-6 pb-24 md:px-6 md:pb-8">
          {children}
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
