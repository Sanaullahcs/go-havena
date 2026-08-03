import { File, Paths } from "expo-file-system";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform, Share } from "react-native";

let mediaLibraryPromise = null;

function isExpoGo() {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

async function loadMediaLibrary() {
  if (isExpoGo()) {
    return null;
  }

  if (!mediaLibraryPromise) {
    mediaLibraryPromise = import("expo-media-library")
      .then((mod) => mod)
      .catch((err) => {
        console.warn("[gallery] expo-media-library unavailable", err);
        mediaLibraryPromise = null;
        return null;
      });
  }

  return mediaLibraryPromise;
}

function extensionFromUrl(url) {
  const path = String(url ?? "").split("?")[0];
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext && ["jpg", "jpeg", "png", "webp", "heic", "heif", "gif"].includes(ext)) {
    return ext === "jpeg" ? "jpg" : ext;
  }
  return "jpg";
}

async function saveViaShare(uri, { showSuccess } = {}) {
  await Share.share(
    Platform.OS === "ios"
      ? { url: uri }
      : { title: "Save photo", message: uri, url: uri },
  );
  await showSuccess?.("Photo ready", "Choose Save image or Photos from the share menu.");
  return true;
}

/**
 * Download a remote image and save it to the device photo library.
 * Uses Expo SDK 56 File + MediaLibrary Asset APIs in dev/production builds.
 * In Expo Go, falls back to the system share sheet (ExpoMediaLibraryNext is not bundled).
 */
export async function saveImageToGallery(url, { showError, showSuccess } = {}) {
  const remoteUrl = resolveMediaUrl(url) ?? String(url ?? "").trim();
  if (!remoteUrl) {
    await showError?.("Nothing to save", new Error("This post does not include a downloadable image."));
    return false;
  }

  const ext = extensionFromUrl(remoteUrl);
  const destination = new File(Paths.cache, `havena-feed-${Date.now()}.${ext}`);

  try {
    const downloaded = await File.downloadFileAsync(remoteUrl, destination);
    const mediaLibrary = await loadMediaLibrary();

    if (!mediaLibrary) {
      return saveViaShare(downloaded.uri, { showSuccess });
    }

    const { Asset, requestPermissionsAsync } = mediaLibrary;
    const { status } = await requestPermissionsAsync(true);
    if (status !== "granted") {
      await showError?.(
        "Permission required",
        "Allow Havena to save photos to your gallery.",
      );
      return false;
    }

    await Asset.create(downloaded.uri);
    await showSuccess?.("Saved", "Photo saved to your gallery.");
    return true;
  } catch (err) {
    await showError?.(
      "Download failed",
      err instanceof Error ? err : new Error(String(err?.message ?? "Could not save this photo. Please try again.")),
    );
    return false;
  }
}
