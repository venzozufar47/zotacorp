import type { MetadataRoute } from "next";

/**
 * Web App Manifest — makes Zota Corp installable to the home screen on
 * Android (Chrome) and iOS (Safari "Add to Home Screen"). Phase 1 of the
 * mobile-app plan; Phase 2 wraps this same site in Capacitor for the
 * Play Store / App Store.
 *
 * `#005a66` is sampled from the zota-favicon artwork (deeper than the
 * UI's --primary #117a8c) so the splash screen matches the icon exactly.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Zota Corp",
    short_name: "Zota Corp",
    description: "Zota Corp — employee operations",
    id: "/",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#005a66",
    orientation: "portrait",
    lang: "id",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      // Maskable variants keep the lettering inside the safe zone so
      // Android's round/squircle launcher masks don't clip it.
      {
        src: "/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
