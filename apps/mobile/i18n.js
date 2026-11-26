import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from "expo-localization";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import en from "./locales/en.json";
import es from "./locales/es.json";
import ar from "./locales/ar.json";

const LANG_KEY = "nbr_app_language";
const SUPPORTED = ["en", "es", "ar"];
const FALLBACK = "en";

/** In-memory cache so Fast Refresh / remounts don't briefly lose Arabic. */
let cachedLanguage = null;

function getDeviceLanguage() {
  try {
    const locales = Localization.getLocales?.();
    const code = locales?.[0]?.languageCode ?? "en";
    return SUPPORTED.includes(code) ? code : FALLBACK;
  } catch {
    return FALLBACK;
  }
}

export async function getSavedLanguage() {
  if (cachedLanguage && SUPPORTED.includes(cachedLanguage)) {
    return cachedLanguage;
  }
  try {
    if (Platform.OS === "web") return cachedLanguage;
    const saved = await SecureStore.getItemAsync(LANG_KEY);
    if (saved && SUPPORTED.includes(saved)) {
      cachedLanguage = saved;
      return saved;
    }
    return null;
  } catch {
    return cachedLanguage;
  }
}

export async function saveLanguage(lang) {
  if (!SUPPORTED.includes(lang)) return;
  cachedLanguage = lang;
  try {
    if (Platform.OS === "web") return;
    await SecureStore.setItemAsync(LANG_KEY, lang);
  } catch {
    // Memory cache still holds the choice for this session
  }
}

export async function initI18n() {
  const saved = await getSavedLanguage();
  // Persisted choice always wins on cold start — never infer from community or stale i18n state.
  const lng = saved && SUPPORTED.includes(saved) ? saved : getDeviceLanguage();

  cachedLanguage = lng;

  if (i18n.isInitialized) {
    i18n.addResourceBundle("en", "translation", en, true, true);
    i18n.addResourceBundle("es", "translation", es, true, true);
    i18n.addResourceBundle("ar", "translation", ar, true, true);
    if (i18n.language !== lng) {
      await i18n.changeLanguage(lng);
    }
    return lng;
  }

  await i18n.use(initReactI18next).init({
    lng,
    fallbackLng: FALLBACK,
    supportedLngs: SUPPORTED,
    resources: { en: { translation: en }, es: { translation: es }, ar: { translation: ar } },
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });

  return lng;
}

/**
 * Pick the right translation field from an API object based on the current language.
 * e.g. localizedField(amenity, "name") returns amenity.name_ar when language is "ar",
 * falling back to amenity.name (English).
 *
 * Also handles compound keys like "amenity_name" → "amenity_name_ar".
 */
export function localizedField(obj, field) {
  if (!obj) return "";
  const lang = i18n.language;
  if (lang && lang !== "en") {
    const translated = obj[`${field}_${lang}`];
    if (translated) return translated;
  }
  return obj[field] ?? "";
}

export { SUPPORTED, FALLBACK };
export default i18n;
