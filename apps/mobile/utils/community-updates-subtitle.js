import { isResidentFeatureEnabled } from "../constants/resident-features";
import { getLocaleForLang } from "../hooks/use-app-locale";

const UPDATE_MODULES = [
  { feature: "notices", labelKey: "notices.tabNotice" },
  { feature: "events", labelKey: "notices.tabEvents" },
  { feature: "alerts", labelKey: "notices.tabAlerts" },
];

/** Subtitle under Community Updates — only modules the user can access (matches tabs). */
export function communityUpdatesSubtitle(user, t, language) {
  const labels = UPDATE_MODULES.filter(({ feature }) =>
    isResidentFeatureEnabled(user, feature),
  ).map(({ labelKey }) => t(labelKey));

  if (labels.length === 0) {
    return t("notices.subtitleFallback");
  }

  try {
    const locale = getLocaleForLang(language);
    return new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(labels);
  } catch {
    if (labels.length === 1) return labels[0];
    return `${labels.slice(0, -1).join(", ")} & ${labels[labels.length - 1]}`;
  }
}
