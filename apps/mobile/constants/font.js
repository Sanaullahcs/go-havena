/**
 * Font family keys used across StyleSheets / NativeWind.
 * LTR loads Poppins (Havena brand); Arabic loads Noto Sans Arabic
 * under the same keys so every `Fonts.*` / `font-regular` usage stays readable.
 */
export const Fonts = {
  regular: "Poppins-Regular",
  bold: "Poppins-Bold",
  medium: "Poppins-Medium",
  semiBold: "Poppins-SemiBold",
};

export function isArabicLanguage(lang) {
  return lang === "ar";
}
