import { useLanguage } from "../providers/language-provider";

const LOCALE_MAP = {
  en: "en-US",
  es: "es-ES",
  ar: "ar-SA",
};

export function useAppLocale() {
  const { language } = useLanguage();
  return LOCALE_MAP[language] ?? "en-US";
}

export function getLocaleForLang(lang) {
  return LOCALE_MAP[lang] ?? "en-US";
}
