import { NextResponse } from "next/server";

/**
 * Proxy for wilayah.id public API. Browser requests to wilayah.id are
 * blocked by CORS (no Access-Control-Allow-Origin header on the response),
 * so we fetch server-side and relay the JSON. Usage from the client:
 *
 *   /api/wilayah/regencies/31.json
 *   /api/wilayah/districts/31.01.json
 *   /api/wilayah/villages/31.01.01.json
 */

const BASE = "https://wilayah.id/api";

// Cache upstream responses for 24h — admin area codes change rarely.
export const revalidate = 86400;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const safe = path.filter((seg) => /^[\w.-]+$/.test(seg));
  if (safe.length === 0 || safe.length !== path.length) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const url = `${BASE}/${safe.join("/")}`;
  try {
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream ${res.status}` },
        { status: res.status }
      );
    }
    const json = await res.json();
    return NextResponse.json(json);
  } catch (err) {
    console.error("wilayah proxy error:", err);
    return NextResponse.json({ error: "Proxy failed" }, { status: 502 });
  }
}
