import { NativeModule, registerWebModule } from "expo";

class AppLocaleModule extends NativeModule {
  setAppLocale(languageTag: string): boolean {
    if (typeof document !== "undefined") {
      document.documentElement.lang = languageTag.split("-")[0] || languageTag;
    }
    return true;
  }

  getAppLocale(): string | null {
    if (typeof document !== "undefined") {
      return document.documentElement.lang || null;
    }
    return null;
  }
}

export default registerWebModule(AppLocaleModule, "AppLocale");
