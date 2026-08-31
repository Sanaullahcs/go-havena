/**
 * Font family keys used across StyleSheets / NativeWind.
 * LTR loads Nunito (Havena brand) under these keys; Arabic loads Noto Sans
 * Arabic so every `Fonts.*` / `font-regular` usage stays readable.
 */
export const Fonts = {
  regular: "Nunito-Regular",
  bold: "Nunito-Bold",
  medium: "Nunito-Medium",
  semiBold: "Nunito-SemiBold",
};

export function isArabicLanguage(lang) {
  return lang === "ar";
}
