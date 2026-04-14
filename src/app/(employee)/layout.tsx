import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";

export default function EmployeeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-[#f5f5f7]">
      <Sidebar className="hidden md:flex" />
      <main className="flex-1 min-w-0">
        <div className="max-w-2xl mx-auto px-4 py-6 pb-20 md:pb-6">
          {children}
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
