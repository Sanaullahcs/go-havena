import {
  Nunito_400Regular,
  Nunito_500Medium,
  Nunito_600SemiBold,
  Nunito_700Bold,
} from "@expo-google-fonts/nunito";
import {
  NotoSansArabic_400Regular,
  NotoSansArabic_500Medium,
  NotoSansArabic_600SemiBold,
  NotoSansArabic_700Bold,
} from "@expo-google-fonts/noto-sans-arabic";
import { isArabicLanguage } from "../constants/font";

/**
 * Register Nunito (LTR) or Noto Sans Arabic (RTL) under the Fonts.* family names.
 */
export function fontMapForLanguage(lang) {
  if (isArabicLanguage(lang)) {
    return {
      "Nunito-Regular": NotoSansArabic_400Regular,
      "Nunito-Medium": NotoSansArabic_500Medium,
      "Nunito-SemiBold": NotoSansArabic_600SemiBold,
      "Nunito-Bold": NotoSansArabic_700Bold,
    };
  }

  return {
    "Nunito-Regular": Nunito_400Regular,
    "Nunito-Medium": Nunito_500Medium,
    "Nunito-SemiBold": Nunito_600SemiBold,
    "Nunito-Bold": Nunito_700Bold,
  };
}
