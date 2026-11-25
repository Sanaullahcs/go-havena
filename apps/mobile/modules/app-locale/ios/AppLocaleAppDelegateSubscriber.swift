import ExpoModulesCore
import UIKit

/**
 Applies the persisted in-app language as early as possible on cold start.
 Lives inside the AppLocale pod so AppDelegate does not need to import this module.
 */
public class AppLocaleAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    AppLocaleModule.applySavedLocale()
    return true
  }
}
