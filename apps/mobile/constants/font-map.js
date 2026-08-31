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
import { isArabicLanguage } from "../constants/font";

const WORDMARK = {
  "Quicksand-SemiBold": Quicksand_600SemiBold,
  "Quicksand-Bold": Quicksand_700Bold,
};

/** Register Poppins (LTR) or Noto Sans Arabic (RTL), plus Quicksand for the Havena wordmark. */
export function fontMapForLanguage(lang) {
  if (isArabicLanguage(lang)) {
    return {
      "Poppins-Regular": NotoSansArabic_400Regular,
      "Poppins-Medium": NotoSansArabic_500Medium,
      "Poppins-SemiBold": NotoSansArabic_600SemiBold,
      "Poppins-Bold": NotoSansArabic_700Bold,
      ...WORDMARK,
    };
  }

  return {
    "Poppins-Regular": Poppins_400Regular,
    "Poppins-Medium": Poppins_500Medium,
    "Poppins-SemiBold": Poppins_600SemiBold,
    "Poppins-Bold": Poppins_700Bold,
    ...WORDMARK,
  };
}
