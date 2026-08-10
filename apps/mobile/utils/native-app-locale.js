import { Platform } from "react-native";
import AppLocale from "../modules/app-locale";

const LANG_TAGS = {
  en: "en-US",
  es: "es-ES",
  ar: "ar-SA",
};

/**
 * Tell the OS which language this app is using so soft keyboards
 * (Gboard, iOS Arabic keyboard, etc.) prefer that language on focus.
 *
 * Requires a native build that includes the local `app-locale` module
 * (`npx expo run:android` / APK). Expo Go returns false.
 */
export function getLanguageTag(lang) {
  return LANG_TAGS[lang] ?? String(lang || "en");
}

export function setNativeAppLocale(lang) {
  const tag = getLanguageTag(lang);

  if (Platform.OS === "web") {
    try {
      if (typeof document !== "undefined") {
        document.documentElement.lang = String(lang || "en");
        document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
      }
      return Boolean(AppLocale?.setAppLocale?.(tag));
    } catch {
      return false;
    }
  }

  try {
    return Boolean(AppLocale?.setAppLocale?.(tag));
  } catch (err) {
    if (__DEV__) {
      console.log(
        "[app-locale] Native locale sync unavailable. Rebuild the app for Arabic/Spanish keyboard matching.",
      );
    }
    return false;
  }
}
