import { cookies } from "next/headers";
import { dictionary, type Dictionary, type Language } from "./dictionary";

const COOKIE_KEY = "zota_lang";
const DEFAULT_LANG: Language = "en";

/**
 * Server-side dictionary accessor. Reads the language preference from the
 * `zota_lang` cookie that LanguageProvider keeps in sync with its React
 * state + localStorage. Returns the full dictionary subset for the
 * chosen language.
 *
 * Falls back to English when no cookie is set (e.g. first visit) — the
 * client will update the cookie on first mount and a subsequent navigation
 * will flip the server output.
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
