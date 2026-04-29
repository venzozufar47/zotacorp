/**
 * Avatar resolution: uploaded photo → DiceBear (adventurer-neutral)
 * → letter fallback (rendered separately by the Avatar primitive).
 *
 * DiceBear is fetched as an SVG via their public CDN. Free, cached,
 * no install. We pass `seed` deterministically so the same person
 * always gets the same face — until they regenerate (which writes a
 * fresh `avatar_seed` to profiles).
 */

const DICEBEAR_BASE = "https://api.dicebear.com/9.x/adventurer-neutral/svg";

export interface AvatarSubject {
  id?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  avatar_seed?: string | null;
}

export function resolveAvatarSrc(p: AvatarSubject): string {
  if (p.avatar_url) return p.avatar_url;
  const seed = p.avatar_seed?.trim() || p.full_name?.trim() || p.id || "anon";
  return `${DICEBEAR_BASE}?seed=${encodeURIComponent(seed)}`;
}

/** Generate a fresh random seed when user clicks "Regenerate". */
export function newAvatarSeed(): string {
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 8)
  );
}
