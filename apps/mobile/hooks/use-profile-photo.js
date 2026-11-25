import { useCallback, useState } from "react";
import i18n from "../i18n";
import { pickImage, takePhoto } from "../utils/pickImage";
import { promptImageSourceAsync } from "../providers/image-source-picker-provider";
import { fetchMe, uploadAvatar } from "../services/profile-api";
import { useAppDialog } from "../providers/app-dialog-provider";
import ProfilePhotoViewer from "../components/profile/profile-photo-viewer";

export function useProfilePhoto({ onUpdated, avatarUrl } = {}) {
  const dialog = useAppDialog();
  const [uploadState, setUploadState] = useState("idle");
  const [viewerOpen, setViewerOpen] = useState(false);

  const showError = useCallback(
    (title, message) => dialog.showError(title, message),
    [dialog],
  );

  const changePhoto = useCallback(async () => {
    try {
      const source = await promptImageSourceAsync({
        title: i18n.t("profile.profilePhoto"),
        message: i18n.t("profile.takeOrChoose"),
        allowView: Boolean(avatarUrl),
        allowCamera: true,
      });

      if (!source) return null;

      if (source === "view") {
        setViewerOpen(true);
        return null;
      }

      const picked =
        source === "camera"
          ? await takePhoto(undefined, { showError })
          : await pickImage(undefined, { showError, allowCamera: false });

      if (!picked?.uri) return null;

      setUploadState("uploading");
      await uploadAvatar(picked.uri, picked);
      const data = await fetchMe();
      onUpdated?.(data);
      setUploadState("idle");

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
      setUploadState("failed");
      return null;
    }
  }, [avatarUrl, dialog, onUpdated, showError]);

  const ProfilePhotoViewerModal = useCallback(
    () => (
      <ProfilePhotoViewer
        visible={viewerOpen}
        uri={avatarUrl}
        onClose={() => setViewerOpen(false)}
      />
    ),
    [avatarUrl, viewerOpen],
  );

  return {
    changePhoto,
    uploading: uploadState === "uploading",
    uploadFailed: uploadState === "failed",
    ProfilePhotoViewerModal,
  };
}
