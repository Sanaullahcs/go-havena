import { useCallback, useState } from "react";
import i18n from "../i18n";
import { pickImage } from "../utils/pickImage";
import { fetchMe, uploadAvatar } from "../services/profile-api";
import { useAppDialog } from "../providers/app-dialog-provider";

export function useProfilePhoto({ onUpdated } = {}) {
  const dialog = useAppDialog();
  const [uploading, setUploading] = useState(false);

  const changePhoto = useCallback(async () => {
    try {
      const picked = await pickImage(undefined, {
        allowCamera: true,
        promptTitle: i18n.t("profile.profilePhoto"),
        promptMessage: i18n.t("profile.takeOrChoose"),
        showError: (title, message) =>
          dialog.showError(title, message),
      });
      if (!picked?.uri) return null;

      setUploading(true);
      await uploadAvatar(picked.uri, picked);
      const data = await fetchMe();
      onUpdated?.(data);

      await dialog.showDialog({
        type: "success",
        title: i18n.t("profile.photoUpdated"),
        message: i18n.t("profile.photoSaved"),
        actions: [{ label: i18n.t("common.ok"), variant: "primary" }],
      });

      return data;
    } catch (err) {
      await dialog.showDialog({
        type: "error",
        title: i18n.t("profile.uploadFailed"),
        message: err?.message ?? i18n.t("profile.couldNotUpdatePhoto"),
        actions: [{ label: i18n.t("common.ok"), variant: "primary" }],
      });
      return null;
    } finally {
      setUploading(false);
    }
  }, [dialog, onUpdated]);

  return { changePhoto, uploading };
}
