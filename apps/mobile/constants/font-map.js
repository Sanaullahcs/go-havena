import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from "@expo-google-fonts/poppins";
import {
  Quicksand_600SemiBold,
  Quicksand_700Bold,
} from "@expo-google-fonts/quicksand";
import {
  NotoSansArabic_400Regular,
  NotoSansArabic_500Medium,
  NotoSansArabic_600SemiBold,
  NotoSansArabic_700Bold,
} from "@expo-google-fonts/noto-sans-arabic";

const WORDMARK = {
  "Quicksand-SemiBold": Quicksand_600SemiBold,
  "Quicksand-Bold": Quicksand_700Bold,
};

/**
 * Both families stay registered for the whole session.
 * Swapping Noto in under the Poppins-* names mid-session changes glyph metrics
 * and is what shifts layout after a language change.
 */
export const BRAND_FONTS = {
  "Poppins-Regular": Poppins_400Regular,
  "Poppins-Medium": Poppins_500Medium,
  "Poppins-SemiBold": Poppins_600SemiBold,
  "Poppins-Bold": Poppins_700Bold,
  "NotoSansArabic-Regular": NotoSansArabic_400Regular,
  "NotoSansArabic-Medium": NotoSansArabic_500Medium,
  "NotoSansArabic-SemiBold": NotoSansArabic_600SemiBold,
  "NotoSansArabic-Bold": NotoSansArabic_700Bold,
  ...WORDMARK,
};

/** @deprecated Language no longer picks a single family. Both are loaded at boot. */
export function fontMapForLanguage() {
  return BRAND_FONTS;
}
