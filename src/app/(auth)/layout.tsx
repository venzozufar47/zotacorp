import Image from "next/image";
import { getDictionary } from "@/lib/i18n/server";
import { AuthLanguageSwitcher } from "@/components/auth/AuthLanguageSwitcher";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t } = await getDictionary();
  return (
    <main className="relative min-h-screen flex items-center justify-center bg-background bg-dots-light px-4 py-12 overflow-hidden">
      {/* Language toggle — lets users flip ID/EN before signing in */}
      <AuthLanguageSwitcher />

      {/* Oceanic Editorial — soft teal radial glows */}
      <div className="auth-decor auth-decor-oceanic">
        <div aria-hidden className="auth-glow auth-glow-tl" />
        <div aria-hidden className="auth-glow auth-glow-br" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        {/* Brand mark — tosca logo reads well on the light surface of
            all three themes. The decorative Z-badge that lived here
            previously is replaced with the official wordmark.
            Entrance animations intentionally omitted: the bounce-up
            keyframe starts at opacity:0, which would push LCP past
            1.2s on this otherwise-tiny page. */}
        <div className="text-center mb-8">
          <Image
            src="/zota-corp-full-logo-tosca.png"
            alt="Zota Corp"
            width={80}
            height={80}
            priority
            sizes="80px"
            className="h-16 md:h-20 w-auto mx-auto mb-2 select-none"
          />
          <p className="text-muted-foreground text-sm mt-3 font-medium">
            {t.authLayout.tagline}
          </p>
        </div>
        <div>{children}</div>
      </div>
    </main>
  );
}
