import Constants from "expo-constants";

/** True when running inside Expo Go (store client / eas go), not a standalone build. */
export function isExpoGo() {
  return (
    Constants.appOwnership === "expo" ||
    Constants.executionEnvironment === "storeClient"
  );
}
