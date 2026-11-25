import { useCallback, useMemo } from "react";
import { Platform } from "react-native";
import { useLanguage } from "../providers/language-provider";
import { getLanguageTag, syncKeyboardForFocusedInput } from "../utils/native-app-locale";

/**
 * Locale-aware TextInput helpers tied to LanguageProvider (en / es / ar).
 *
 * - Arabic → RTL writing direction + right alignment
 * - English / Spanish → LTR + left alignment
 *
 * Soft-keyboard language switching uses the native `app-locale` module
 * (Android AppCompat application locales / iOS AppleLanguages). That requires
 * a rebuilt native app — Expo Go cannot force the system keyboard language.
 *
 * Prefer `LocaleTextInput` for automatic focus sync.
 */
export function useInputLocale({ forceLtr = false } = {}) {
  const { language, isRTL } = useLanguage();

  const syncKeyboardLocale = useCallback(() => {
    syncKeyboardForFocusedInput(language);
  }, [language]);

  const textInputProps = useMemo(() => {
    const rtl = !forceLtr && isRTL;
    const writingDirection = rtl ? "rtl" : "ltr";
    const textAlign = rtl ? "right" : "left";
    const languageTag = getLanguageTag(language);

    return {
      writingDirection,
      textAlign,
      accessibilityLanguage: languageTag,
      style: {
        writingDirection,
        textAlign,
      },
      ...(Platform.OS === "web" ? { lang: language } : null),
    };
  }, [language, isRTL, forceLtr]);

  return {
    ...textInputProps,
    textInputProps,
    syncKeyboardLocale,
  };
}

/** Pure helper when a component cannot use hooks. */
export function getInputLocaleProps(lang, { forceLtr = false } = {}) {
  const rtl = !forceLtr && lang === "ar";
  const writingDirection = rtl ? "rtl" : "ltr";
  const textAlign = rtl ? "right" : "left";
  return {
    writingDirection,
    textAlign,
    accessibilityLanguage: getLanguageTag(lang),
    style: { writingDirection, textAlign },
    ...(Platform.OS === "web" ? { lang } : null),
  };
}
