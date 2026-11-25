const ELLIPSIS = "...";

/** Max characters shown where a measured card width is not available. */
export const NOTIFICATION_BODY_PREVIEW_MAX = 150;

/** Collapse newlines and extra spaces so a long notice stays one preview paragraph. */
export function flattenNotificationText(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Short preview that fits about `lines` rows in the measured text width.
 * Wider screens keep more characters; narrower screens cut sooner.
 */
export function previewNotificationText(text, { width = 0, fontSize = 12, lines = 3 } = {}) {
  const flat = flattenNotificationText(text);
  if (!flat) return "";

  const usable = Number(width);
  const size = Number(fontSize);
  if (!Number.isFinite(usable) || usable <= 0 || !Number.isFinite(size) || size <= 0) {
    return flat;
  }

  const charsPerLine = Math.max(8, Math.floor(usable / (size * 0.48)));
  const maxChars = charsPerLine * lines;
  if (flat.length <= maxChars) return flat;

  const budget = Math.max(1, maxChars - ELLIPSIS.length);
  let cut = flat.slice(0, budget).trimEnd();
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > budget * 0.55) {
    cut = cut.slice(0, lastSpace).trimEnd();
  }
  if (!cut) cut = flat.slice(0, budget).trimEnd();
  return `${cut}${ELLIPSIS}`;
}

/** Fixed-length preview for surfaces that do not measure the text width. */
export function notificationPreviewText(text, max = NOTIFICATION_BODY_PREVIEW_MAX) {
  const raw = flattenNotificationText(text);
  if (!raw) return "";
  if (raw.length <= max) return raw;

  const slice = raw.slice(0, max).trimEnd();
  const wordTrimmed = slice.replace(/\s+\S*$/, "");
  const base = wordTrimmed.length >= Math.floor(max * 0.55) ? wordTrimmed : slice;
  return `${base}${ELLIPSIS}`;
}
