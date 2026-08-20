import Constants from "expo-constants";
import * as Linking from "expo-linking";

const BILLING_RETURN_PATH = "screens/complete-billing";

function getPackagerHostUri() {
  return (
    Constants.expoConfig?.hostUri ??
    Constants.manifest2?.extra?.expoGo?.debuggerHost ??
    Constants.manifest?.debuggerHost ??
    null
  );
}

/**
 * Deep link that brings the user back to complete-billing after web checkout.
 * Expo Go requires exp:// — the production havena:// scheme does not open Expo Go.
 */
export function createBillingReturnUrl() {
  if (__DEV__) {
    const hostUri = getPackagerHostUri();
    if (hostUri) {
      const [host, port = "8081"] = String(hostUri).split(":");
      if (host) {
        return `exp://${host}:${port}/--/${BILLING_RETURN_PATH}`;
      }
    }
  }

  return Linking.createURL(BILLING_RETURN_PATH, { scheme: "havena" });
}
