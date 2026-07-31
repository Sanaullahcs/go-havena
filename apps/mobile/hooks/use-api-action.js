import { useCallback } from "react";
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
      successTitle = "Success",
      successMessage = "Done successfully.",
      errorTitle = "Action failed",
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
