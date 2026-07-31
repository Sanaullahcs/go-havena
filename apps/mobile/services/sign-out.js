import { router } from "expo-router";
import { logout } from "./auth-api";
import { setCurrentRole } from "../constants/role-session";
import { unregisterPushDeviceOnSignOut } from "./push-notifications";

/** Clear auth state and reset navigation to the login screen. */
export async function performSignOut() {
  try {
    await unregisterPushDeviceOnSignOut();
  } catch (err) {
    console.warn("[auth] push unregister failed", err);
  }

  try {
    await logout();
  } catch (err) {
    console.warn("[auth] logout API failed", err);
  }

  setCurrentRole("resident");

  if (router.canDismiss?.()) {
    router.dismissAll();
  }

  router.replace("/screens/login");
}

/** Interactive logout confirmation using app dialog. */
export async function confirmSignOut(dialog) {
  const result = await dialog.showConfirm(
    "Log out?",
    "You can unlock again with fingerprint or Face ID, or sign in with your phone.",
    { confirmLabel: "Log Out", cancelLabel: "Stay signed in", destructive: true },
  );

  if (result === "confirm") {
    await performSignOut();
    await dialog.showSuccess("Logged out", "You have been signed out successfully.");
  }
}
