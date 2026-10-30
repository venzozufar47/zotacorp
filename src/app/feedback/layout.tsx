import type { Viewport } from "next";
import "@/styles/haengbocake.css";

/**
 * Halaman feedback pelanggan (publik, tanpa login). Memakai tema Haengbocake (krem + hijau) supaya terasa sebagai bagian
 * dari toko, bukan aplikasi internal. Zoom sengaja TIDAK dimatikan (aksesibilitas pelanggan).
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function FeedbackLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-haengbocake className="min-h-dvh bg-background text-foreground">
      {children}
    </div>
  );
}
