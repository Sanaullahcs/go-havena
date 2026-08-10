import ExpoModulesCore
import Foundation

public class AppLocaleModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AppLocale")

    /**
     * Prefers the given language for this app so iOS is more likely to
     * present the matching keyboard when a text field is focused.
     * Takes full effect after the next app reload.
     */
    Function("setAppLocale") { (languageTag: String) -> Bool in
      let tag = languageTag.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !tag.isEmpty else { return false }

      // Primary language only (e.g. "ar" from "ar-SA") for AppleLanguages.
      let languageCode = String(tag.split(separator: "-").first ?? Substring(tag))

      UserDefaults.standard.set([languageCode, "en"], forKey: "AppleLanguages")
      UserDefaults.standard.set(tag, forKey: "AppleLocale")
      UserDefaults.standard.synchronize()
      return true
    }

    Function("getAppLocale") { () -> String? in
      if let languages = UserDefaults.standard.array(forKey: "AppleLanguages") as? [String],
         let first = languages.first {
        return first
      }
      return Locale.preferredLanguages.first
    }
  }
}
