import { Alert, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { promptImageSourceAsync } from "../providers/image-source-picker-provider";
import { persistUploadAsset } from "./upload-form-data";
import { resolveLibraryPicker } from "./gallery-image-options";
import i18n from "../i18n";
import { prepareNativeLocaleForSystemUI } from "./native-app-locale";

async function syncLocaleBeforeNativePicker() {
  prepareNativeLocaleForSystemUI(i18n.language);
  await new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function notifyError(showError, title, message) {
  if (showError) {
    return showError(title, message);
  }
  Alert.alert(title, message);
}

const DEFAULT_PICKER = {
  mediaTypes: ["images"],
  allowsEditing: true,
  quality: 0.9,
  aspect: [1, 1],
};

const DOCUMENT_PICKER = {
  mediaTypes: ["images"],
  allowsEditing: false,
  quality: 0.8,
  exif: false,
  preferredAssetRepresentationMode:
    ImagePicker.UIImagePickerPreferredAssetRepresentationMode?.Compatible ??
    "compatible",
};

function normalizeDocumentAsset(asset) {
  if (!asset?.uri) return asset;

  const rawMime = String(asset.mimeType ?? "").toLowerCase();
  const mimeType =
    rawMime && rawMime !== "application/octet-stream" ? rawMime : "image/jpeg";

  const extByMime = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/heic": "heic",
    "image/heif": "heic",
    "application/pdf": "pdf",
  };
  const ext = extByMime[mimeType] ?? "jpg";
  const baseName = asset.fileName || asset.name || `document-${Date.now()}`;
  const fileName = baseName.includes(".") ? baseName : `${baseName}.${ext}`;

  return {
    ...asset,
    mimeType,
    fileName,
  };
}

async function finalizeDocumentAsset(asset, defaultBaseName, showError) {
  const normalized = normalizeDocumentAsset(asset);
  if (!normalized?.uri) return normalized;

  try {
    return await persistUploadAsset(normalized, defaultBaseName);
  } catch (err) {
    await notifyError(
      showError,
      i18n.t("imagePicker.couldNotSave"),
      err?.message || i18n.t("imagePicker.tryAgainPhoto"),
    );
    return null;
  }
}

/**
 * Native chooser: Camera / Gallery / optional File / Cancel.
 * @returns {Promise<"view"|"camera"|"library"|"file"|null>}
 */
export function promptImageSource(options = {}) {
  return promptImageSourceAsync(options);
}

async function ensureLibraryPermission(showError) {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== "granted") {
    await notifyError(
      showError,
      i18n.t("imagePicker.permissionRequired"),
      i18n.t("imagePicker.allowLibrary"),
    );
    return false;
  }
  return true;
}

async function ensureCameraPermission(showError) {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== "granted") {
    await notifyError(
      showError,
      i18n.t("imagePicker.permissionRequired"),
      i18n.t("imagePicker.allowCamera"),
    );
    return false;
  }
  return true;
}

/**
 * Opens the camera, crops to a square when supported, returns the asset.
 */
export async function takePhoto(onSuccess, options = {}) {
  const { showError, documentPick = false, uploadBaseName = "document" } = options;
  const pickerOptions = documentPick ? DOCUMENT_PICKER : DEFAULT_PICKER;

  try {
    const allowed = await ensureCameraPermission(showError);
    if (!allowed) return null;

    await syncLocaleBeforeNativePicker();

    const result = await ImagePicker.launchCameraAsync({
      ...pickerOptions,
      // Android camera crop UI varies; keep editing on for square avatars.
      allowsEditing: documentPick ? false : Platform.OS !== "web",
    });

    if (!result.canceled && result.assets?.[0]) {
      let asset = { ...result.assets[0], fromCamera: true };
      if (documentPick) {
        asset = await finalizeDocumentAsset(asset, uploadBaseName, showError);
        if (!asset) return null;
      }
      onSuccess?.(asset);
      return asset;
    }

    return null;
  } catch (err) {
    await notifyError(
      showError,
      i18n.t("imagePicker.unableCamera"),
      err?.message || i18n.t("imagePicker.tryAgain"),
    );
    return null;
  }
}

/**
 * Opens Files / Documents and returns an image-shaped asset for uploads.
 */
export async function pickImageFile(onSuccess, options = {}) {
  const { showError, allowPdf = false, uploadBaseName = "document" } = options;

  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: allowPdf ? ["image/*", "application/pdf"] : ["image/*"],
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled || !result.assets?.[0]) return null;

    const asset = result.assets[0];
    const mimeType = asset.mimeType || "image/jpeg";
    const isImage = String(mimeType).startsWith("image/");
    const isPdf = mimeType === "application/pdf";

    if (allowPdf ? !isImage && !isPdf : !isImage) {
      await notifyError(
        showError,
        i18n.t("imagePicker.unsupportedFile"),
        allowPdf
          ? i18n.t("imagePicker.chooseImageOrPdf")
          : i18n.t("imagePicker.chooseImage"),
      );
      return null;
    }

    let normalized = {
      uri: asset.uri,
      mimeType,
      fileName: asset.name || "image.jpg",
      fileSize: asset.size,
      width: asset.width,
      height: asset.height,
    };

    if (allowPdf) {
      normalized = await finalizeDocumentAsset(normalized, uploadBaseName, showError);
      if (!normalized) return null;
    }

    onSuccess?.(normalized);
    return normalized;
  } catch (err) {
    await notifyError(
      showError,
      i18n.t("imagePicker.unableFiles"),
      err?.message || i18n.t("imagePicker.tryAgain"),
    );
    return null;
  }
}

/**
 * Opens the device image library and returns the selected image asset.
 * Pass `allowCamera` / `allowFile` to show a chooser first.
 * @param {Function} [onSuccess]
 * @param {{
 *   showError?: (title: string, message: string) => void | Promise<void>,
 *   allowCamera?: boolean,
 *   allowFile?: boolean,
 *   documentPick?: boolean,
 *   allowPdf?: boolean,
 *   promptTitle?: string,
 *   promptMessage?: string,
 *   uploadBaseName?: string,
 *   cameraFirst?: boolean,
 *   preserveGalleryOriginal?: boolean,
 * }} [options]
 */
export const pickImage = async (onSuccess, options = {}) => {
  const {
    showError,
    allowCamera = false,
    allowFile = false,
    documentPick = false,
    allowPdf = false,
    promptTitle,
    promptMessage,
    uploadBaseName = "document",
    cameraFirst = false,
    preserveGalleryOriginal = false,
  } = options;

  const libraryPick = resolveLibraryPicker({
    documentPick,
    preserveGalleryOriginal,
    platform: Platform.OS,
  });
  const pickerOptions =
    libraryPick.kind === "document"
      ? DOCUMENT_PICKER
      : libraryPick.kind === "original"
        ? {
            mediaTypes: libraryPick.mediaTypes,
            allowsEditing: false,
            quality: libraryPick.quality,
            exif: true,
          }
        : DEFAULT_PICKER;
  const fileOptions = { showError, allowPdf: allowPdf || documentPick, uploadBaseName };
  const photoOptions = { showError, documentPick, uploadBaseName };

  try {
    if (allowCamera || allowFile) {
      const source = await promptImageSource({
        title: promptTitle,
        message: promptMessage,
        allowCamera,
        allowFile,
        cameraFirst,
      });
      if (!source) return null;
      if (source === "camera") {
        return takePhoto(onSuccess, photoOptions);
      }
      if (source === "file") {
        return pickImageFile(onSuccess, fileOptions);
      }
    }

    const allowed = await ensureLibraryPermission(showError);
    if (!allowed) return null;

    await syncLocaleBeforeNativePicker();

    const result = await ImagePicker.launchImageLibraryAsync(pickerOptions);

    if (!result.canceled && result.assets?.[0]) {
      let asset = result.assets[0];
      if (libraryPick.kind === "original") {
        asset = { ...asset, galleryOriginal: true };
      }
      if (documentPick) {
        asset = await finalizeDocumentAsset(asset, uploadBaseName, showError);
        if (!asset) return null;
      }
      onSuccess?.(asset);
      return asset;
    }

    return null;
  } catch (err) {
    await notifyError(
      showError,
      i18n.t("imagePicker.unableGallery"),
      err?.message || i18n.t("imagePicker.tryAgain"),
    );
    return null;
  }
};

/**
 * Pick up to `max - currentCount` images from the library in one session.
 * @param {(assets: import('expo-image-picker').ImagePickerAsset[]) => void} [onSuccess]
 * @param {{ showError?: (title: string, message: string) => void | Promise<void>, max?: number, currentCount?: number }} [options]
 */
export async function pickImages(onSuccess, options = {}) {
  const { showError, max = 6, currentCount = 0 } = options;
  const remaining = max - currentCount;

  if (remaining <= 0) {
    await notifyError(
      showError,
      i18n.t("imagePicker.limitReached"),
      i18n.t("imagePicker.maxPhotos", { max }),
    );
    return [];
  }

  try {
    const allowed = await ensureLibraryPermission(showError);
    if (!allowed) return [];

    await syncLocaleBeforeNativePicker();

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.85,
    });

    if (!result.canceled && result.assets?.length) {
      const assets = result.assets.slice(0, remaining);
      onSuccess?.(assets);
      return assets;
    }

    return [];
  } catch (err) {
    await notifyError(
      showError,
      i18n.t("imagePicker.unableGallery"),
      err?.message || i18n.t("imagePicker.tryAgain"),
    );
    return [];
  }
}
