import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { blockUser, unblockUser } from "../services/user-blocks-api";
import { getBlockableUserId } from "../utils/block-target";
import { useApiAction } from "./use-api-action";
import { useAppDialog } from "../providers/app-dialog-provider";

export function useBlockUser() {
  const { t } = useTranslation();
  const dialog = useAppDialog();
  const { runAction } = useApiAction();

  const confirmAndBlock = useCallback(
    async (userId, meta = {}) => {
      const targetId = getBlockableUserId({ ...meta, userId, id: userId }, meta.currentUserId);
      if (!targetId) return false;

      const choice = await dialog.showConfirm(
        t("blocks.blockUser"),
        t("blocks.confirmMessage"),
        {
          confirmLabel: t("blocks.blockAction"),
          cancelLabel: t("common.cancel"),
          destructive: true,
        },
      );
      if (choice !== "confirm") return false;

      const result = await runAction({
        action: () => blockUser(targetId),
        successTitle: t("blocks.blockedTitle"),
        successMessage: t("blocks.blockedMessage"),
        silentSuccess: false,
      });

      return result !== null;
    },
    [dialog, runAction, t],
  );

  const confirmAndUnblock = useCallback(
    async (userId) => {
      if (!userId) return false;

      const result = await runAction({
        action: () => unblockUser(userId),
        successTitle: t("blocks.unblockedTitle"),
        successMessage: t("blocks.unblockedMessage"),
        silentSuccess: false,
      });

      return result !== null;
    },
    [runAction, t],
  );

  return { confirmAndBlock, confirmAndUnblock };
}
