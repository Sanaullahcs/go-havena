import { StyleSheet } from "react-native";

/**
 * React Native Text defaults to `overflow: 'hidden'`. Combined with Inter-tuned
 * lineHeights and `includeFontPadding: false`, Noto Sans Arabic glyphs get
 * clipped from the top on small phones.
 *
 * Patch StyleSheet.create so text-like styles always get enough vertical room.
 * Must be imported before screen modules (see apps/mobile/index.js).
 */

const MIN_LINE_HEIGHT_RATIO = 1.5;
const MIN_LINE_HEIGHT_FLOOR = 16;

let installed = false;
let arabicActive = false;

function isTextLikeStyle(style) {
  if (!style || typeof style !== "object" || Array.isArray(style)) return false;
  return (
    style.fontFamily != null ||
    style.fontSize != null ||
    style.includeFontPadding != null ||
    (style.fontWeight != null && style.lineHeight != null)
  );
}

function fixTextStyle(style) {
  const next = { ...style };

  // Android: keep font padding so Arabic ascenders aren't cropped.
  next.includeFontPadding = true;

  // Override RN Text's default overflow:'hidden' which clips tall Arabic glyphs.
  if (next.overflow == null || next.overflow === "hidden") {
    next.overflow = "visible";
  }

  // Tracking designed for Latin often chops Arabic.
  if (arabicActive && typeof next.letterSpacing === "number" && next.letterSpacing !== 0) {
    next.letterSpacing = 0;
  }

  if (typeof next.fontSize === "number" && Number.isFinite(next.fontSize)) {
    const ratio = arabicActive ? 1.55 : MIN_LINE_HEIGHT_RATIO;
    const floor = arabicActive ? MIN_LINE_HEIGHT_FLOOR : Math.ceil(next.fontSize * ratio);
    const minLh = Math.max(floor, Math.ceil(next.fontSize * ratio));
    if (typeof next.lineHeight !== "number" || next.lineHeight < minLh) {
      next.lineHeight = minLh;
    }
  }

  // A fixed text box shorter than the line height crops ascenders and descenders.
  if (typeof next.height === "number" && typeof next.lineHeight === "number" && next.height < next.lineHeight) {
    next.minHeight = Math.max(typeof next.minHeight === "number" ? next.minHeight : 0, next.lineHeight);
    delete next.height;
  }

  return next;
}

function patchStyles(styles) {
  if (!styles || typeof styles !== "object") return styles;
  const out = {};
  for (const key of Object.keys(styles)) {
    const value = styles[key];
    out[key] = isTextLikeStyle(value) ? fixTextStyle(value) : value;
  }
  return out;
}

/** Install once at process start (before screen StyleSheets are created). */
export function installTextClipFixes() {
  if (installed) return;
  installed = true;

  const originalCreate = StyleSheet.create.bind(StyleSheet);
  StyleSheet.create = (styles) => originalCreate(patchStyles(styles));
}

/**
 * Prefer stronger Arabic metrics on the next StyleSheet.create calls.
 * Call before reload when switching to Arabic; also safe at boot after language resolves
 * (already-created sheets keep prior values — reload applies fully).
 */
export function setArabicTextMetricsEnabled(enabled) {
  arabicActive = Boolean(enabled);
  installTextClipFixes();
}

/**
 * Merge Arabic-safe metrics into an inline / array style (for non-StyleSheet usage).
 */
export function withArabicTextStyle(style) {
  if (!arabicActive) return style;
  const flat = StyleSheet.flatten(style) || {};
  if (!isTextLikeStyle(flat) && flat.fontSize == null) {
    return [style, { includeFontPadding: true, overflow: "visible" }];
  }
  return [style, fixTextStyle(flat)];
}
