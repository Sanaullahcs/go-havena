/** Shared horizontal carousel tuning for home sections */
export const CAROUSEL = {
  gap: 10,
  peek: 20,
  deceleration: "fast",
};

/** Exactly 2 cards visible + small peek (Wellness, Property) */
export function twoUpCardWidth(screenWidth, gutter, gap = CAROUSEL.gap, peek = CAROUSEL.peek) {
  const content = screenWidth - gutter * 2;
  return Math.floor((content - gap - peek) / 2);
}

/** ~3 deal cards visible */
export function threeUpCardWidth(screenWidth, gutter, gap = CAROUSEL.gap, peek = 14) {
  const content = screenWidth - gutter * 2;
  return Math.floor((content - gap * 2 - peek) / 3);
}

/** One primary card + peek (Community Feed) */
export function feedCardWidth(screenWidth, gutter, peek = CAROUSEL.peek, ratio = 0.84) {
  const content = screenWidth - gutter * 2;
  return Math.floor(content * ratio);
}

export function snapInterval(cardWidth, gap = CAROUSEL.gap) {
  return cardWidth + gap;
}
