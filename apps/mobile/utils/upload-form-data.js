import { File, Paths, UploadType } from "expo-file-system";
import * as LegacyFileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";

const MIME_TO_EXTENSION = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
};

const EXTENSION_TO_MIME = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function extensionFromUri(uri) {
  const base = String(uri ?? "").split("?")[0].split("/").pop() ?? "";
  if (!base.includes(".")) return null;
  const ext = base.split(".").pop()?.toLowerCase();
  return ext && EXTENSION_TO_MIME[ext] ? ext : null;
}

function extensionFromMime(mimeType) {
  return MIME_TO_EXTENSION[String(mimeType ?? "").toLowerCase()] ?? "jpg";
}

function normalizeUriForCompare(uri) {
  return decodeURIComponent(String(uri ?? "").trim().replace(/\/+$/, ""));
}

function isInCacheDirectory(uri) {
  const cacheDir = LegacyFileSystem.cacheDirectory;
  if (!cacheDir || !uri) return false;
  return normalizeUriForCompare(uri).startsWith(normalizeUriForCompare(cacheDir));
}

function cacheDestinationUri(fileName) {
  const cacheDir = LegacyFileSystem.cacheDirectory;
  if (!cacheDir) {
    return new File(Paths.cache, fileName).uri;
  }
  return `${cacheDir}${fileName}`;
}

export function guessImageMeta(uri, asset = {}, defaultBaseName = "upload") {
  const rawMime = String(asset.mimeType ?? "").toLowerCase();
  const mimeFromAsset =
    rawMime && rawMime !== "application/octet-stream" ? rawMime : null;

  const extFromUri = extensionFromUri(uri);
  const extension = extFromUri ?? extensionFromMime(mimeFromAsset);
  const mimeType =
    mimeFromAsset || EXTENSION_TO_MIME[extension] || "image/jpeg";

  const baseName = asset.fileName || asset.name;
  const fileName =
    baseName && baseName.includes(".")
      ? baseName
      : `${defaultBaseName}.${extension}`;

  return { fileName, mimeType };
}

/** Ensure camera/gallery assets have a filename and mime type the API accepts. */
export function normalizeUploadAsset(asset, defaultBaseName = "upload") {
  if (!asset?.uri) return asset;

  const { fileName, mimeType } = guessImageMeta(asset.uri, asset, defaultBaseName);
  return {
    ...asset,
    mimeType,
    fileName,
  };
}

function buildCacheFileName(fileName, defaultBaseName, forceJpeg = false) {
  const ext = forceJpeg ? "jpg" : extensionFromUri(fileName) ?? "jpg";
  const stamp = Date.now();
  const base = String(fileName ?? defaultBaseName)
    .replace(/\.[^.]+$/, "")
    .replace(/[^\w.\-]+/g, "_")
    .slice(0, 40);
  return `${base || defaultBaseName}-${stamp}.${ext}`;
}

function isPdfAsset(asset) {
  const rawMime = String(asset?.mimeType ?? "").toLowerCase();
  return rawMime === "application/pdf" || String(asset?.uri ?? "").toLowerCase().endsWith(".pdf");
}

function assetNeedsJpegConversion(asset) {
  if (!asset?.uri || isPdfAsset(asset)) return false;
  if (asset.fromCamera) return true;

  const rawMime = String(asset.mimeType ?? "").toLowerCase();
  const uri = String(asset.uri).toLowerCase();

  if (rawMime === "image/heic" || rawMime === "image/heif") return true;
  if (/\.heic($|\?)/i.test(uri) || /\.heif($|\?)/i.test(uri)) return true;

  return false;
}

async function normalizeDocumentImageAsset(asset, defaultBaseName = "upload") {
  const resizeActions = [];
  const width = Number(asset.width ?? 0);
  if (width > 2048) {
    resizeActions.push({ resize: { width: 2048 } });
  }

  const manipulated = await ImageManipulator.manipulateAsync(
    asset.uri,
    resizeActions,
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
  );

  const fileName = buildCacheFileName(`${defaultBaseName}.jpg`, defaultBaseName, true);

  return {
    ...asset,
    uri: manipulated.uri,
    mimeType: "image/jpeg",
    fileName,
    width: manipulated.width ?? asset.width,
    height: manipulated.height ?? asset.height,
    base64: undefined,
  };
}

async function uriIsReadable(uri) {
  if (!uri) return false;

  try {
    const info = await LegacyFileSystem.getInfoAsync(uri);
    if (info.exists && (info.size ?? 0) > 0) {
      return true;
    }
  } catch {
    // fall through
  }

  try {
    const file = new File(uri);
    return file.exists && (file.size ?? 0) > 0;
  } catch {
    return false;
  }
}

async function copyLocalFile(sourceUri, destinationUri) {
  try {
    await LegacyFileSystem.copyAsync({
      from: sourceUri,
      to: destinationUri,
    });
    if (await uriIsReadable(destinationUri)) {
      return true;
    }
  } catch {
    // fall through
  }

  try {
    const source = new File(sourceUri);
    const destination = new File(destinationUri);
    if (source.exists && (source.size ?? 0) > 0) {
      if (destination.exists) {
        destination.delete();
      }
      await source.copy(destination);
      return await uriIsReadable(destinationUri);
    }
  } catch {
    // fall through
  }

  return false;
}

async function writeFetchedFile(sourceUri, destinationUri) {
  try {
    const response = await fetch(sourceUri);
    if (!response.ok) return false;

    const buffer = await response.arrayBuffer();
    if (!buffer?.byteLength) return false;

    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }

    await LegacyFileSystem.writeAsStringAsync(destinationUri, btoa(binary), {
      encoding: LegacyFileSystem.EncodingType.Base64,
    });
    return await uriIsReadable(destinationUri);
  } catch {
    return false;
  }
}

export async function prepareUploadFile(uri, assetMeta = {}, defaultBaseName = "upload") {
  const normalized = normalizeUploadAsset({ uri, ...assetMeta }, defaultBaseName);
  const { fileName, mimeType } = guessImageMeta(
    normalized.uri,
    normalized,
    defaultBaseName,
  );

  if (
    normalized.uploadPrepared &&
    (await uriIsReadable(normalized.uri)) &&
    isInCacheDirectory(normalized.uri)
  ) {
    return {
      uri: normalized.uri,
      mimeType: normalized.mimeType || mimeType,
      fileName: normalized.fileName || Paths.basename(normalized.uri) || fileName,
    };
  }

  const safeName = buildCacheFileName(
    normalized.fileName || fileName,
    defaultBaseName.replace(/_/g, "-"),
    String(normalized.mimeType || mimeType).toLowerCase().includes("jpeg") ||
      String(normalized.mimeType || mimeType).toLowerCase() === "image/jpg",
  );
  const destinationUri = cacheDestinationUri(safeName);
  const resolvedMimeType = normalized.mimeType || mimeType;

  try {
    const destInfo = await LegacyFileSystem.getInfoAsync(destinationUri);
    if (destInfo.exists) {
      await LegacyFileSystem.deleteAsync(destinationUri, { idempotent: true });
    }
  } catch {
    // ignore
  }

  if (await uriIsReadable(normalized.uri)) {
    if (await copyLocalFile(normalized.uri, destinationUri)) {
      return {
        uri: destinationUri,
        mimeType: resolvedMimeType,
        fileName: safeName,
      };
    }
  }

  if (await writeFetchedFile(normalized.uri, destinationUri)) {
    return {
      uri: destinationUri,
      mimeType: resolvedMimeType,
      fileName: safeName,
    };
  }

  throw new Error("Could not read the selected file. Please try again.");
}

/** Copy a local picker/camera asset into app cache immediately after selection. */
export async function persistUploadAsset(asset, defaultBaseName = "upload") {
  if (!asset?.uri || /^https?:\/\//i.test(asset.uri)) {
    return asset;
  }

  if (isPdfAsset(asset)) {
    const prepared = await prepareUploadFile(asset.uri, asset, defaultBaseName);
    return {
      ...asset,
      uri: prepared.uri,
      mimeType: prepared.mimeType,
      fileName: prepared.fileName,
      uploadPrepared: true,
    };
  }

  let working = asset;
  if (assetNeedsJpegConversion(asset)) {
    working = await normalizeDocumentImageAsset(
      asset,
      defaultBaseName.replace(/_/g, "-"),
    );
  }

  const prepared = await prepareUploadFile(
    working.uri,
    {
      ...working,
      mimeType: "image/jpeg",
      uploadPrepared: false,
    },
    defaultBaseName,
  );

  return {
    ...asset,
    uri: prepared.uri,
    mimeType: prepared.mimeType,
    fileName: prepared.fileName,
    uploadPrepared: true,
    base64: undefined,
    fromCamera: undefined,
  };
}

function parseUploadErrorBody(body, fieldName, status) {
  return (
    body?.message ||
    body?.errors?.[fieldName]?.[0] ||
    `Upload failed (${status})`
  );
}

function parseUploadResult(result, fieldName) {
  let body = {};
  try {
    body = result?.body ? JSON.parse(result.body) : {};
  } catch {
    body = { message: result?.body || "Upload failed" };
  }

  if ((result?.status ?? 0) < 200 || (result?.status ?? 0) >= 300) {
    throw new Error(parseUploadErrorBody(body, fieldName, result.status ?? 0));
  }

  return body;
}

function ensureUploadUri(uri) {
  if (!uri) return uri;
  if (/^[a-z][a-z0-9+.-]*:/i.test(uri)) return uri;
  return uri.startsWith("/") ? `file://${uri}` : uri;
}

async function uploadWithReactNativeFormData({
  url,
  uri,
  fieldName,
  token,
  mimeType,
  fileName,
  headers = {},
}) {
  const info = await LegacyFileSystem.getInfoAsync(uri);
  if (!info.exists || (info.size ?? 0) === 0) {
    throw new Error("Could not read the selected file. Please try again.");
  }

  const uploadUri = ensureUploadUri(uri);
  const formData = new FormData();
  formData.append(fieldName, {
    uri: uploadUri,
    name: fileName || "upload.jpg",
    type: mimeType || "image/jpeg",
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...headers,
    },
    body: formData,
  });

  const text = await response.text();
  let body = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { message: text };
    }
  }

  if (response.status < 200 || response.status >= 300) {
    throw new Error(parseUploadErrorBody(body, fieldName, response.status));
  }

  return body;
}

async function uploadWithLegacyMultipart({
  url,
  uri,
  fieldName,
  token,
  mimeType,
  headers = {},
}) {
  const info = await LegacyFileSystem.getInfoAsync(uri);
  if (!info.exists || (info.size ?? 0) === 0) {
    throw new Error("Could not read the selected file. Please try again.");
  }

  const result = await LegacyFileSystem.uploadAsync(url, uri, {
    uploadType: LegacyFileSystem.FileSystemUploadType.MULTIPART,
    fieldName,
    mimeType,
    httpMethod: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...headers,
    },
  });

  return parseUploadResult(result, fieldName);
}

export async function uploadMultipartFormData({
  url,
  uri,
  fieldName = "file",
  token,
  mimeType = "image/jpeg",
  fileName = "upload.jpg",
  assetMeta = {},
  headers: extraHeaders = {},
}) {
  const prepared = assetMeta.uploadPrepared
    ? { uri, mimeType: assetMeta.mimeType || mimeType, fileName: assetMeta.fileName || fileName }
    : await prepareUploadFile(uri, { ...assetMeta, mimeType, fileName }, fieldName);

  return uploadWithReactNativeFormData({
    url,
    uri: prepared.uri,
    fieldName,
    token,
    mimeType: prepared.mimeType,
    fileName: prepared.fileName || fileName,
    headers: extraHeaders,
  });
}

export async function uploadMultipartFile({
  url,
  uri,
  fieldName = "avatar",
  token,
  mimeType = "image/jpeg",
  assetMeta = {},
  headers: extraHeaders = {},
}) {
  const defaultBaseName = fieldName.replace(/_/g, "-");
  const prepared = assetMeta.uploadPrepared
    ? {
        uri,
        mimeType: assetMeta.mimeType || mimeType,
        fileName: assetMeta.fileName,
      }
    : await prepareUploadFile(uri, { ...assetMeta, mimeType }, defaultBaseName);

  const resolvedFileName =
    prepared.fileName ||
    guessImageMeta(prepared.uri, assetMeta, defaultBaseName).fileName;

  try {
    return await uploadWithReactNativeFormData({
      url,
      uri: prepared.uri,
      fieldName,
      token,
      mimeType: prepared.mimeType,
      fileName: resolvedFileName,
      headers: extraHeaders,
    });
  } catch (primaryError) {
    const primaryMessage = String(primaryError?.message ?? "");

    if (primaryMessage.includes("Could not read the selected file") && assetMeta.uploadPrepared) {
      const rebuilt = await prepareUploadFile(
        uri,
        { ...assetMeta, mimeType, uploadPrepared: false },
        defaultBaseName,
      );
      return uploadWithReactNativeFormData({
        url,
        uri: rebuilt.uri,
        fieldName,
        token,
        mimeType: rebuilt.mimeType,
        fileName: rebuilt.fileName || resolvedFileName,
        headers: extraHeaders,
      });
    }

    if (primaryMessage.includes("Could not read the selected file")) {
      throw primaryError;
    }

    try {
      return await uploadWithLegacyMultipart({
        url,
        uri: prepared.uri,
        fieldName,
        token,
        mimeType: prepared.mimeType,
        headers: extraHeaders,
      });
    } catch (legacyError) {
      const legacyMessage = String(legacyError?.message ?? "");

      if (legacyMessage.includes("Could not read the selected file") && assetMeta.uploadPrepared) {
        const rebuilt = await prepareUploadFile(
          uri,
          { ...assetMeta, mimeType, uploadPrepared: false },
          defaultBaseName,
        );
        return uploadWithLegacyMultipart({
          url,
          uri: rebuilt.uri,
          fieldName,
          token,
          mimeType: rebuilt.mimeType,
          headers: extraHeaders,
        });
      }

      if (legacyMessage.includes("Could not read the selected file")) {
        throw legacyError;
      }

      try {
        const file = new File(prepared.uri);
        const uploadTask = file.createUploadTask(url, {
          uploadType: UploadType.MULTIPART,
          fieldName,
          mimeType: prepared.mimeType,
          httpMethod: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            ...extraHeaders,
          },
        });
        const result = await uploadTask.uploadAsync();
        return parseUploadResult(result, fieldName);
      } catch {
        throw primaryError;
      }
    }
  }
}
