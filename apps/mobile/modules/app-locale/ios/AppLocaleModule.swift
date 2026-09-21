import ExpoModulesCore
import Foundation
import UIKit

public class AppLocaleModule: Module {
  private static let prefsKey = "havena_app_language_tag"

  public static func applySavedLocale() {
    guard let tag = UserDefaults.standard.string(forKey: prefsKey), !tag.isEmpty else {
      return
    }
    applyLocale(tag)
  }

  private static func applyLocale(_ languageTag: String) {
    // iOS does not allow apps to programmatically switch the system keyboard.
    // Updating AppleLanguages only influences preferred language order / dictation
    // after process restart — and only if the user has that keyboard enabled.
    let languageCode = languageTag.split(separator: "-").first.map(String.init) ?? languageTag
    var preferred = [languageTag]
    if languageCode != languageTag {
      preferred.append(languageCode)
    }

    UserDefaults.standard.set(preferred, forKey: "AppleLanguages")
    UserDefaults.standard.set(languageTag, forKey: "AppleLocale")
    UserDefaults.standard.synchronize()
  }

  public func definition() -> ModuleDefinition {
    Name("AppLocale")

    Function("isAvailable") { () -> Bool in
      true
    }

    Function("setAppLocale") { (languageTag: String) -> Bool in
      UserDefaults.standard.set(languageTag, forKey: Self.prefsKey)
      Self.applyLocale(languageTag)
      return true
    }

    // No-op on iOS — kept so JS can call one API on both platforms.
    Function("setImeHintLocales") { (_ languageTag: String) -> Bool in
      false
    }

    Function("getAppLocale") { () -> String? in
      UserDefaults.standard.string(forKey: Self.prefsKey)
    }

    Function("openInputMethodPicker") { () -> Bool in
      // Open iOS keyboard settings so the user can enable Arabic/Spanish keyboards.
      guard let url = URL(string: UIApplication.openSettingsURLString) else {
        return false
      }
      DispatchQueue.main.async {
        UIApplication.shared.open(url, options: [:], completionHandler: nil)
      }
      return true
    }
  }
}
