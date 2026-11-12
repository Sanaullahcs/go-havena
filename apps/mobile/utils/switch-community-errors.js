import i18n from "../i18n";
import { goToJoinCommunityUnits } from "../constants/onboarding-routes";
import { getApiErrorMessage } from "./api-error-core";
import { showApiFailure } from "./auth-errors";

export function isSwitchNeedsUnitsError(error) {
  const fieldMessage = error?.errors?.community_id?.[0];
  const message = String(
    fieldMessage || getApiErrorMessage(error, "community_id") || "",
  ).toLowerCase();

  return (
    message.includes("add your unit details") ||
    message.includes("unit details for this community")
  );
}

/**
 * Accepted invite with no unit yet. Cancel stays put; OK opens the unit form, then switches.
 */
export async function promptAddUnitsBeforeSwitch(
  dialog,
  router,
  { communityId, communityName, returnTo = "my-community", title } = {},
) {
  if (!communityId) return;

  const name = communityName || i18n.t("community.myCommunity");

  await dialog.showDialog({
    type: "warning",
    title: title || i18n.t("nav.switchNeedsUnitsTitle"),
    message: i18n.t("nav.switchNeedsUnitsBody", { name }),
    actions: [
      {
        key: "cancel",
        label: i18n.t("common.cancel"),
        variant: "secondary",
        onPress: () => {},
      },
      {
        key: "ok",
        label: i18n.t("common.ok"),
        variant: "primary",
        onPress: () => {
          goToJoinCommunityUnits(router, {
            communityId,
            communityName: name,
            returnTo,
            switchAfter: true,
          });
        },
      },
    ],
  });
}

/**
 * Switch blocked until the resident enrolls units in the target community.
 * @returns {Promise<boolean>} true when handled (dialog shown)
 */
export async function handleSwitchCommunityError(
  dialog,
  router,
  error,
  { communityId, communityName, title, returnTo = "my-community" } = {},
) {
  if (!isSwitchNeedsUnitsError(error) || !communityId) {
    return false;
  }

  const name = communityName || i18n.t("community.myCommunity");

  await promptAddUnitsBeforeSwitch(dialog, router, {
    communityId,
    communityName: name,
    returnTo,
    title,
  });

  return true;
}

export async function showSwitchCommunityFailure(
  dialog,
  router,
  title,
  error,
  context = {},
) {
  const handled = await handleSwitchCommunityError(dialog, router, error, {
    ...context,
    title,
  });
  if (handled) {
    return;
  }
  await showApiFailure(dialog, title, error);
}
