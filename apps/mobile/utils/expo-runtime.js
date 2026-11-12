import Constants from "expo-constants";
import { isRunningInExpoGo } from "expo";

/** True when running inside Expo Go, not a standalone or development build. */
export function isExpoGo() {
  try {
    if (isRunningInExpoGo()) return true;
  } catch {
    // Fall back to the manifest fields below.
  }

  return (
    Constants.appOwnership === "expo" ||
    Constants.executionEnvironment === "storeClient"
  );
}
