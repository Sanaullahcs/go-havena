/** Path fragments where the bottom tab bar should stay hidden (forms, chat, auth). */
const HIDDEN_TAB_PATH_PARTS = [
  "add-business",
  "create-deal",
  "write-review",
  "complete-profile",
  "create-post",
  "createlisting",
  "create-event",
  "create-notice",
  "create-alert",
  "guest-login",
  "invite-code",
  "messages/chat",
  "signup",
  "verify-phone",
  "verifyregistration",
  "marketplace-listings",
];

/** Hide tabs on form/focus screens and while the software keyboard is open. */
export function shouldHideTabBar(pathname, { keyboardVisible = false } = {}) {
  if (keyboardVisible) return true;

  const path = String(pathname ?? "").toLowerCase();
  return HIDDEN_TAB_PATH_PARTS.some((part) => path.includes(part));
}
