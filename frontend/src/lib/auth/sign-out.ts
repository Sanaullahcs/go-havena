import { confirmAction } from "@/lib/alert";
import { logout } from "@/lib/api/auth";
import { clearSession } from "@/lib/auth/session";

export async function confirmAdminSignOut(opts?: {
  text?: string;
}): Promise<boolean> {
  const result = await confirmAction({
    title: "Sign out?",
    text:
      opts?.text ??
      "You will be returned to the login screen. Any unsaved progress will be lost.",
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
