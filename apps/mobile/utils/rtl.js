import { I18nManager } from "react-native";

export function chevronForward() {
  return I18nManager.isRTL ? "chevron-left" : "chevron-right";
}

export function chevronBack() {
  return I18nManager.isRTL ? "chevron-right" : "chevron-left";
}

export function arrowForward() {
  return I18nManager.isRTL ? "arrow-left" : "arrow-right";
}

export function arrowBack() {
  return I18nManager.isRTL ? "arrow-right" : "arrow-left";
}

export function ionChevronForward() {
  return I18nManager.isRTL ? "chevron-back" : "chevron-forward";
}
