import { useMemo } from "react";
import { Platform } from "react-native";
import { useLanguage } from "../providers/language-provider";
import { getLanguageTag } from "../utils/native-app-locale";

/**
 * TextInput props that align typing with the active app language.
 * Pair with `setNativeAppLocale` (native builds) so the OS keyboard
 * opens in Arabic / Spanish / English to match.
 *
 * Usage:
 *   const inputLocale = useInputLocale();
 *   <TextInput {...inputLocale} style={[styles.input, inputLocale.style]} />
 */
export function useInputLocale() {
  const { language, isRTL } = useLanguage();

  return useMemo(() => {
    const writingDirection = isRTL ? "rtl" : "ltr";
    const textAlign = isRTL ? "right" : "left";
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
  }, [language, isRTL]);
}

export function getInputLocaleProps(lang) {
  const rtl = lang === "ar";
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
