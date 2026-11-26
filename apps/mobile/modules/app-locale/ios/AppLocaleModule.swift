import ExpoModulesCore
import Foundation
import UIKit

public class AppLocaleModule: Module {
  public static func applySavedLocale() {
    guard let tag = UserDefaults.standard.string(forKey: AppLocaleBundle.prefsKey), !tag.isEmpty else {
      return
    }
    applyLocale(tag)
  }

  private static func applyLocale(_ languageTag: String) {
    // iOS cannot switch the system keyboard language. Photo/camera sheets follow
    // AppleLanguages + Bundle.main.preferredLocalizations — refresh both at runtime.
    AppLocaleBundle.refreshRuntimeLocale(languageTag)
  }

  public func definition() -> ModuleDefinition {
    Name("AppLocale")

    Function("isAvailable") { () -> Bool in
      true
    }

    Function("setAppLocale") { (languageTag: String) -> Bool in
      Self.applyLocale(languageTag)
      return true
    }

    Function("prepareSystemLocaleUI") { (languageTag: String) -> Bool in
      Self.applyLocale(languageTag)
      return true
    }

    // No-op on iOS — kept so JS can call one API on both platforms.
    Function("setImeHintLocales") { (_ languageTag: String) -> Bool in
      false
    }

    Function("getAppLocale") { () -> String? in
      UserDefaults.standard.string(forKey: AppLocaleBundle.prefsKey)
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
