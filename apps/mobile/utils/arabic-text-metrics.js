import { StyleSheet } from "react-native";

/**
 * React Native Text defaults to `overflow: 'hidden'`. Combined with tight
 * lineHeights and `includeFontPadding: false`, Arabic glyphs get clipped.
 *
 * Patch StyleSheet.create so text-like styles always get enough vertical room.
 * Metrics stay the same for every language so a switch does not reflow rows.
 * Must be imported before screen modules (see apps/mobile/index.js).
 */

const MIN_LINE_HEIGHT_RATIO = 1.9;
const MIN_LINE_HEIGHT_FLOOR = 20;

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

  // Extra Android font padding plus numberOfLines clips Arabic. A taller line box holds the glyphs.
  next.includeFontPadding = false;

  // Override RN Text's default overflow:'hidden' which clips tall Arabic glyphs.
  if (next.overflow == null || next.overflow === "hidden") {
    next.overflow = "visible";
  }

  if (typeof next.fontSize === "number" && Number.isFinite(next.fontSize)) {
    const minLh = Math.max(MIN_LINE_HEIGHT_FLOOR, Math.ceil(next.fontSize * MIN_LINE_HEIGHT_RATIO));
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

/** Keep one set of text metrics for every language. */
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
