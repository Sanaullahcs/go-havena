import Foundation
import ObjectiveC

enum AppLocaleBundle {
  static let prefsKey = "havena_app_language_tag"

  private static var didSwizzleMainBundle = false

  /// System sheets (Photos, camera) read `Bundle.main.preferredLocalizations`
  /// when presenting. Swizzle so they see the in-app language before restart.
  static func installIfNeeded() {
    guard !didSwizzleMainBundle else { return }
    didSwizzleMainBundle = true
    object_setClass(Bundle.main, AppLocaleMainBundle.self)
  }

  static func preferredTagsFromStorage() -> [String]? {
    guard let tag = UserDefaults.standard.string(forKey: prefsKey), !tag.isEmpty else {
      return nil
    }
    let languageCode = tag.split(separator: "-").first.map(String.init) ?? tag
    if languageCode != tag {
      return [tag, languageCode]
    }
    return [tag]
  }

  static func refreshRuntimeLocale(_ languageTag: String) {
    installIfNeeded()

    let languageCode = languageTag.split(separator: "-").first.map(String.init) ?? languageTag
    var preferred = [languageTag]
    if languageCode != languageTag {
      preferred.append(languageCode)
    }

    UserDefaults.standard.set(preferred, forKey: "AppleLanguages")
    UserDefaults.standard.set(languageTag, forKey: "AppleLocale")
    UserDefaults.standard.set(languageTag, forKey: prefsKey)
    UserDefaults.standard.synchronize()

    NotificationCenter.default.post(
      name: NSLocale.currentLocaleDidChangeNotification,
      object: nil
    )
  }
}

private final class AppLocaleMainBundle: Bundle, @unchecked Sendable {
  override var preferredLocalizations: [String] {
    if let tags = AppLocaleBundle.preferredTagsFromStorage() {
      return tags
    }
    return super.preferredLocalizations
  }
}