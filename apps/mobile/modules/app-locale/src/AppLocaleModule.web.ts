import { NativeModule, registerWebModule } from "expo";

class AppLocaleModule extends NativeModule {
  isAvailable(): boolean {
    return false;
  }

  setAppLocale(languageTag: string): boolean {
    if (typeof document !== "undefined") {
      const lang = String(languageTag || "en").split("-")[0];
      document.documentElement.lang = lang;
      document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    }
    return false;
  }

  prepareSystemLocaleUI(languageTag: string): boolean {
    return this.setAppLocale(languageTag);
  }

  setImeHintLocales(_languageTag: string): boolean {
    return false;
  }

  getAppLocale(): string | null {
    return null;
  }

  openInputMethodPicker(): boolean {
    return false;
  }
}

export default registerWebModule(AppLocaleModule, "AppLocale");
