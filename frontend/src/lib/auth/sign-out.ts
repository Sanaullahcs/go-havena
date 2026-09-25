import { confirmAction } from "@/lib/alert";
import { logout } from "@/lib/api/auth";
import { clearSession } from "@/lib/auth/session";

export const COMPLETE_PROFILE_SIGN_OUT_MESSAGE =
  "Are you sure you want to sign out? Any unsaved changes will be lost.";

export async function confirmAdminSignOut(opts?: {
  text?: string;
}): Promise<boolean> {
  const result = await confirmAction({
    title: "Sign out?",
    text:
      opts?.text ??
      "Are you sure you want to sign out?",
    confirmText: "Sign out",
    icon: "question",
    color: "red",
  });

  if (!result.isConfirmed) return false;

  await logout();
  clearSession();
  return true;
}

export async function confirmAdminSignOutAndRedirect(
  router: { replace: (path: string) => void },
  loginPath = "/login",
  opts?: { text?: string },
) {
  const signedOut = await confirmAdminSignOut(opts);
  if (signedOut) router.replace(loginPath);
}
