import { AdminSidebar } from "@/components/layout/AdminSidebar";
import { AdminMobileNav } from "@/components/layout/AdminMobileNav";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-[#f5f5f7]">
      <AdminMobileNav />
      <AdminSidebar />
      <main className="flex-1">
        <div className="max-w-6xl mx-auto px-4 pt-16 pb-6 md:pt-6">{children}</div>
      </main>
    </div>
  );
}
