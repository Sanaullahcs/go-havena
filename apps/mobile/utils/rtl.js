/**
 * Layout stays left-to-right for every language.
 * Arabic changes the copy and the typeface, not row direction, so a language
 * switch does not flip icons or shift menus.
 */
export function isAppRtl() {
  return false;
}

export function chevronForward() {
  return isAppRtl() ? "chevron-left" : "chevron-right";
}

export function chevronBack() {
  return isAppRtl() ? "chevron-right" : "chevron-left";
}

export function arrowForward() {
  return isAppRtl() ? "arrow-left" : "arrow-right";
}

export function arrowBack() {
  return isAppRtl() ? "arrow-right" : "arrow-left";
}

export function ionChevronForward() {
  return isAppRtl() ? "chevron-back" : "chevron-forward";
}
