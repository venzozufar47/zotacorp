import type { MetadataRoute } from "next";

/**
 * Internal HR app — disallow all crawlers. Auth gates every route except
 * /login and /register, and there's nothing here a search engine should
 * surface. Returning a valid robots.txt also clears the "robots.txt is
 * not valid" Lighthouse audit (previously the route was hijacked by the
 * auth middleware and returned an HTML redirect).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
