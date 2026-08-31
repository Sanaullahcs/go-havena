/**
 * Font family keys used across StyleSheets / NativeWind.
 * LTR loads Nunito (Havena brand) under these keys; Arabic loads Noto Sans
 * Arabic so every `Fonts.*` / `font-regular` usage stays readable.
 */
export const Fonts = {
  regular: "Inter-Regular",
  bold: "Inter-Bold",
  medium: "Inter-Medium",
  semiBold: "Inter-SemiBold",
};

export function isArabicLanguage(lang) {
  return lang === "ar";
}
