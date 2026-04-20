import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  },
  /**
   * `optimizePackageImports` makes Next.js transform barrel-style imports
   * (`import { X } from "lib"`) into per-module imports at build time so
   * only the code actually used ships to the client. The listed packages
   * are either huge (lucide-react ships ~1,500 icons), use wildcard
   * re-exports (date-fns, date-fns-tz), or bundle every subcomponent
   * together (@base-ui/react). Without this list the client bundle was
   * hauling tens of KB of unused code into every route group.
   */
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "date-fns",
      "date-fns-tz",
      "@base-ui/react",
    ],
  },
  /**
   * `unpdf` (and its transitive `pdfjs-dist` dependency) ships a hefty
   * bundle that's only loaded inside the rekening koran parser route.
   * Mark it external so Next traces it from node_modules instead of
   * trying to bundle via turbopack, which previously broke the worker.
   */
  serverExternalPackages: ["unpdf", "pdfjs-dist"],
};

export default nextConfig;
