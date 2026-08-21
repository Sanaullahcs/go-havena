import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import {
  NotoSansArabic_400Regular,
  NotoSansArabic_500Medium,
  NotoSansArabic_600SemiBold,
  NotoSansArabic_700Bold,
} from "@expo-google-fonts/noto-sans-arabic";
import { isArabicLanguage } from "../constants/font";

/**
 * Map the shared Inter-* keys to either Inter (LTR) or Noto Sans Arabic (RTL).
 * Keeping the same keys means StyleSheet / NativeWind don't need per-screen changes.
 */
export function fontMapForLanguage(lang) {
  if (isArabicLanguage(lang)) {
    return {
      "Inter-Regular": NotoSansArabic_400Regular,
      "Inter-Medium": NotoSansArabic_500Medium,
      "Inter-SemiBold": NotoSansArabic_600SemiBold,
      "Inter-Bold": NotoSansArabic_700Bold,
    };
  }

  return {
    "Inter-Regular": Inter_400Regular,
    "Inter-Medium": Inter_500Medium,
    "Inter-SemiBold": Inter_600SemiBold,
    "Inter-Bold": Inter_700Bold,
  };
}
