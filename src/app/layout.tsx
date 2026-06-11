import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Plus_Jakarta_Sans, Poppins } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { LanguageProvider } from "@/lib/i18n/LanguageProvider";
import { dictionary, type Language } from "@/lib/i18n/dictionary";
import { LazyToaster } from "@/components/ui/LazyToaster";
import { PwaRegister } from "@/components/shared/PwaRegister";
import "./globals.css";

/**
 * Fonts — only ship what the Oceanic Editorial theme needs (Playful &
 * Minimal themes were deleted; Inter + Outfit went with them).
 *  - Plus Jakarta Sans is the body font: 400/500 body, 600/700 for
 *    Tailwind semibold/bold call-sites.
 *  - Poppins is the display font (headings, .clock-display, .eyebrow) —
 *    CSS only references weights 600/700.
 *  - `display: "swap"` makes the browser paint fallback text
 *    immediately instead of holding back FCP while the WOFF streams.
 */
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
});

// Browser tab stays "Zota Corp" for professionalism (users see the tab all
// day — a casual greeting wears out fast). Social/link previews use the
// warm Indonesian greeting so first contact feels human.
export const metadata: Metadata = {
  title: "Zota Corp",
  description: "Zota Corp — employee operations",
  // PWA / home-screen install (manifest: src/app/manifest.ts, apple icon:
  // src/app/apple-icon.png file convention)
  appleWebApp: {
    capable: true,
    title: "Zota Corp",
    statusBarStyle: "default",
  },
  openGraph: {
    title: "Zota Corp",
    description: "Selamat datang orang baik!",
    siteName: "Zota Corp",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Zota Corp",
    description: "Selamat datang orang baik!",
  },
};

// `viewportFit: "cover"` lets the app paint behind the iPhone notch when
// installed to the home screen; theme color matches the app icon teal.
export const viewport: Viewport = {
  themeColor: "#005a66",
  viewportFit: "cover",
};

const COOKIE_KEY = "zota_lang_v2";
const DEFAULT_LANG: Language = "id";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read the language cookie server-side so SSR and hydration start from
  // the same language — no flash. The dictionary subset for the active
  // language is passed as a prop so the client JS only ships ~19KB
  // instead of the full ~38KB (both languages).
  let lang: Language = DEFAULT_LANG;
  try {
    const store = await cookies();
    const raw = store.get(COOKIE_KEY)?.value;
    if (raw === "en" || raw === "id") lang = raw;
  } catch {
    // fallback to default
  }

  // Tema org = Oceanic Editorial, hardcoded — tema lain sudah dihapus
  // sehingga tidak perlu RPC `get_ui_theme` per request lagi. Atribut
  // data-theme dipertahankan karena override komponen di globals.css
  // ter-scope ke [data-theme="oceanic"].
  return (
    <html
      lang={lang}
      data-theme="oceanic"
      className={`${jakarta.variable} ${poppins.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col overflow-x-hidden">
        <LanguageProvider initialLang={lang} initialDictionary={dictionary[lang]}>
          {children}
          <LazyToaster />
          <PwaRegister />
          <Analytics />
          <SpeedInsights />
        </LanguageProvider>
      </body>
    </html>
  );
}
