import { permanentRedirect } from "next/navigation";

/**
 * Legacy alias — the login form moved to `/` to drop a redirect hop.
 * Keep this 308 so external bookmarks, OAuth callback URLs, and any
 * stragglers still resolve. Plain `permanentRedirect` preserves the
 * query string.
 */
export default function LegacyLoginAlias(): never {
  permanentRedirect("/");
}
