import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Native app shell (phase 2 of the mobile plan). The app is a thin
 * WebView pointed at production — the Next.js app stays server-rendered
 * on Vercel, so the native binary almost never needs re-publishing:
 * every `git push` to main updates the app content instantly.
 *
 * appId is the Android package name / iOS bundle id — it can NEVER
 * change after the first Play Store / App Store upload.
 */
const config: CapacitorConfig = {
  appId: "com.zotacorp.team",
  appName: "Zota Corp",
  // Required by `cap sync` but unused at runtime — server.url below means
  // the WebView loads production, not these bundled files.
  webDir: "capacitor-shell",
  server: {
    url: "https://team.zotacorp.com",
    // Hosts the WebView may navigate to in-app. Anything else (wa.me,
    // OAuth providers, etc.) opens in the system browser.
    allowNavigation: ["team.zotacorp.com"],
  },
  android: {
    backgroundColor: "#005a66",
  },
  ios: {
    backgroundColor: "#005a66",
  },
};

export default config;
