/**
 * The checkout return can reach the result screen twice (deep link + our own
 * navigation). The screen records itself here so the second push is skipped.
 */
const shown = new Map();

export function markPaymentResultShown(id) {
  if (id) shown.set(String(id), Date.now());
}

export function wasPaymentResultShown(id, withinMs = 4000) {
  const at = shown.get(String(id));
  return at != null && Date.now() - at < withinMs;
}
