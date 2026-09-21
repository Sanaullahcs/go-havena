import i18n from "../i18n";

const RTL_LANGUAGES = ["ar"];

/** Single source of truth for layout direction — matches LanguageProvider / i18n.language. */
export function isAppRtl() {
  return RTL_LANGUAGES.includes(i18n.language);
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
