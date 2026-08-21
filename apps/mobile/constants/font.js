/**
 * Font family keys used across StyleSheets / NativeWind.
 * For Arabic we load Noto Sans Arabic under these same keys so every
 * existing `Fonts.*` / `font-regular` usage renders readable Arabic glyphs.
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
