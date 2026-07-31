import { useCallback, useState } from "react";
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
        promptTitle: "Profile photo",
        promptMessage: "Take a new photo or choose one from your library.",
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
        title: "Profile photo updated",
        message: "Your profile photo has been saved.",
        actions: [{ label: "OK", variant: "primary" }],
      });

      return data;
    } catch (err) {
      await dialog.showDialog({
        type: "error",
        title: "Upload failed",
        message: err?.message ?? "Could not update your profile photo.",
        actions: [{ label: "OK", variant: "primary" }],
      });
      return null;
    } finally {
      setUploading(false);
    }
  }, [dialog, onUpdated]);

  return { changePhoto, uploading };
}
