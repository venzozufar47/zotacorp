import { AdminSidebar } from "@/components/layout/AdminSidebar";
import { AdminMobileNav } from "@/components/layout/AdminMobileNav";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-background">
      <AdminMobileNav />
      <AdminSidebar />
      <main className="flex-1 min-w-0">
        {/* Fluid width with a ceiling at ~1700px so the admin data tables
            breathe on 1440p / 1920p monitors instead of hitting a narrow
            6xl cap, while still keeping line lengths readable on ultra-
            wide displays. `min-w-0` on <main> above lets this grow past
            its flex sibling's intrinsic width. */}
        <div className="max-w-[1700px] mx-auto px-4 pt-16 pb-6 md:px-6 md:pt-6">{children}</div>
      </main>
    </div>
  );
}
