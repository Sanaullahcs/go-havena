const ELLIPSIS = "...";

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
