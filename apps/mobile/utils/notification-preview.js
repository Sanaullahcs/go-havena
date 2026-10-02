/** Max characters shown on notification list cards (full body opens on click). */
export const NOTIFICATION_BODY_PREVIEW_MAX = 150;

export function notificationPreviewText(text, max = NOTIFICATION_BODY_PREVIEW_MAX) {
  const raw = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  if (raw.length <= max) return raw;

  const slice = raw.slice(0, max).trimEnd();
  const wordTrimmed = slice.replace(/\s+\S*$/, "");
  const base = wordTrimmed.length >= Math.floor(max * 0.55) ? wordTrimmed : slice;
  return `${base}...`;
}
