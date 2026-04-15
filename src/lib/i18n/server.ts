import { cookies } from "next/headers";
import { dictionary, type Dictionary, type Language } from "./dictionary";

// Kept in sync with LanguageProvider's bumped key. See the client file for
// the rationale — bumping to `_v2` invalidated every user's previously
// stored preference so the new Indonesian default takes effect for
// everyone, not just first-time visitors.
const COOKIE_KEY = "zota_lang_v2";
const DEFAULT_LANG: Language = "id";

/**
 * Server-side dictionary accessor. Reads the language preference from the
 * `zota_lang_v2` cookie that LanguageProvider keeps in sync with its React
 * state + localStorage. Returns the full dictionary subset for the
 * chosen language.
 *
 * Falls back to Indonesian when no cookie is set (e.g. first visit, or
 * existing users whose v1 preference was wiped) — the client will update
 * the cookie on first mount and a subsequent navigation will flip the
 * server output.
 */
export async function getDictionary(): Promise<{
  lang: Language;
  t: Dictionary;
}> {
  try {
    const store = await cookies();
    const raw = store.get(COOKIE_KEY)?.value;
    const lang: Language = raw === "id" || raw === "en" ? raw : DEFAULT_LANG;
    return { lang, t: dictionary[lang] };
  } catch {
    return { lang: DEFAULT_LANG, t: dictionary[DEFAULT_LANG] };
  }
}
