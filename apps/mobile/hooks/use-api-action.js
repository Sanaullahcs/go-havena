import { useCallback } from "react";
import i18n from "../i18n";
import { useAppDialog } from "../providers/app-dialog-provider";
import { showApiFailure, showApiSuccess } from "../utils/auth-errors";

/**
 * Wrap user-initiated API calls with consistent success/error popups.
 */
export function useApiAction() {
  const dialog = useAppDialog();

  const runAction = useCallback(
    async ({
      action,
      successTitle = i18n.t("apiAction.success"),
      successMessage = i18n.t("apiAction.doneSuccessfully"),
      errorTitle = i18n.t("apiAction.actionFailed"),
      silentSuccess = false,
      onSuccess,
    }) => {
      try {
        const result = await action();
        if (!silentSuccess) {
          const message =
            typeof successMessage === "function" ? successMessage(result) : successMessage;
          await showApiSuccess(dialog, successTitle, message);
        }
        if (onSuccess) {
          await onSuccess(result);
        }
        return result;
      } catch (error) {
        await showApiFailure(dialog, errorTitle, error);
        return null;
      }
    },
    [dialog],
  );

  const showSuccess = useCallback(
    (title, message) => showApiSuccess(dialog, title, message),
    [dialog],
  );

  const showFailure = useCallback(
    (title, error, field) => showApiFailure(dialog, title, error, field),
    [dialog],
  );

  return { dialog, runAction, showSuccess, showFailure };
}
