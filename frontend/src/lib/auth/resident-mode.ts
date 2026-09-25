import { meToSessionUser, switchActiveContext } from "@/lib/api/profile";
import { applyPortalForActiveContext, canSwitchModes, getToken, type WebUser } from "@/lib/auth/session";

export async function switchToResidentMode(communityId?: number): Promise<WebUser> {
  if (!canSwitchModes()) {
    throw new Error("Only a Community Admin can switch modes.");
  }
  const me = await switchActiveContext("resident", communityId);
  const user = meToSessionUser(me) as WebUser;
  const token = getToken();
  if (token) applyPortalForActiveContext(token, user);
  return user;
}

export async function switchToAdminMode(communityId?: number): Promise<WebUser> {
  if (!canSwitchModes()) {
    throw new Error("Only a Community Admin can switch modes.");
  }
  const me = await switchActiveContext("community_admin", communityId);
  const user = meToSessionUser(me) as WebUser;
  const token = getToken();
  if (token) applyPortalForActiveContext(token, user);
  return user;
}
