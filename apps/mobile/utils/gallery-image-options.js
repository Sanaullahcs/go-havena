/** Android Create Post gallery picks skip the system cropper and keep the file as-is. */
export function resolveLibraryPicker({
  documentPick = false,
  preserveGalleryOriginal = false,
  platform,
} = {}) {
  if (documentPick) return { kind: "document" };
  if (preserveGalleryOriginal && platform === "android") {
    return {
      kind: "original",
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 1,
      exif: true,
    };
  }
  return { kind: "default" };
}

export function saveFormatForAsset(asset = {}) {
  const mime = String(asset.mimeType ?? "").toLowerCase();
  const uri = String(asset.uri ?? "").split("?")[0].toLowerCase();
  if (mime.includes("png") || uri.endsWith(".png")) return "png";
  if (mime.includes("webp") || uri.endsWith(".webp")) return "webp";
  return "jpeg";
}

export function fileNameForFormat(asset = {}, format = "jpeg") {
  const ext = format === "png" ? "png" : format === "webp" ? "webp" : "jpg";
  const mime =
    format === "png" ? "image/png" : format === "webp" ? "image/webp" : "image/jpeg";
  const raw = String(asset.fileName || asset.name || "post-image");
  const base = raw.replace(/\.[^.]+$/, "") || "post-image";
  return { fileName: `${base}.${ext}`, mimeType: mime };
}

export function containedImageRect(imageWidth, imageHeight, frameWidth, frameHeight) {
  const width = Number(imageWidth);
  const height = Number(imageHeight);
  const frameW = Number(frameWidth);
  const frameH = Number(frameHeight);
  if (!(width > 0) || !(height > 0) || !(frameW > 0) || !(frameH > 0)) return null;

  const scale = Math.min(frameW / width, frameH / height);
  const displayW = width * scale;
  const displayH = height * scale;
  return {
    x: (frameW - displayW) / 2,
    y: (frameH - displayH) / 2,
    width: displayW,
    height: displayH,
    scale,
  };
}

export function clampCropBox(box, bounds) {
  if (!box || !bounds) return box;
  const width = Math.min(Math.max(box.width, 1), bounds.width);
  const height = Math.min(Math.max(box.height, 1), bounds.height);
  const x = Math.min(Math.max(box.x, bounds.x), bounds.x + bounds.width - width);
  const y = Math.min(Math.max(box.y, bounds.y), bounds.y + bounds.height - height);
  return { x, y, width, height };
}

export function initialCropBox(imageRect) {
  if (!imageRect) return null;
  const insetX = imageRect.width > 80 ? imageRect.width * 0.12 : 0;
  const insetY = imageRect.height > 80 ? imageRect.height * 0.12 : 0;
  return clampCropBox(
    {
      x: imageRect.x + insetX,
      y: imageRect.y + insetY,
      width: imageRect.width - insetX * 2,
      height: imageRect.height - insetY * 2,
    },
    imageRect,
  );
}

export function resizeCropBox(box, bounds, scale) {
  if (!box || !bounds) return box;
  const min = Math.max(24, Math.min(bounds.width, bounds.height) * 0.2);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const width = Math.max(min, Math.min(box.width * scale, bounds.width));
  const height = Math.max(min, Math.min(box.height * scale, bounds.height));
  return clampCropBox(
    {
      x: cx - width / 2,
      y: cy - height / 2,
      width,
      height,
    },
    bounds,
  );
}

function integerCrop(originX, originY, width, height, imageWidth, imageHeight) {
  let x = Math.max(0, Math.min(Math.round(originX), imageWidth - 1));
  let y = Math.max(0, Math.min(Math.round(originY), imageHeight - 1));
  let w = Math.max(1, Math.round(width));
  let h = Math.max(1, Math.round(height));
  if (x + w > imageWidth) w = imageWidth - x;
  if (y + h > imageHeight) h = imageHeight - y;
  return { originX: x, originY: y, width: w, height: h };
}

/**
 * Map a crop box drawn over a contained preview into oriented image pixels.
 * A frame that covers the whole photo is returned as the full image so the
 * original bytes can be kept.
 */
export function cropRectFromFrame({
  imageWidth,
  imageHeight,
  frameWidth,
  frameHeight,
  cropBox,
}) {
  const imageRect = containedImageRect(imageWidth, imageHeight, frameWidth, frameHeight);
  if (!imageRect || !cropBox) return null;

  const covers =
    cropBox.x <= imageRect.x + 1 &&
    cropBox.y <= imageRect.y + 1 &&
    cropBox.x + cropBox.width >= imageRect.x + imageRect.width - 1 &&
    cropBox.y + cropBox.height >= imageRect.y + imageRect.height - 1;

  if (covers) {
    return {
      originX: 0,
      originY: 0,
      width: Math.round(imageWidth),
      height: Math.round(imageHeight),
      full: true,
    };
  }

  const originX = (cropBox.x - imageRect.x) / imageRect.scale;
  const originY = (cropBox.y - imageRect.y) / imageRect.scale;
  const width = cropBox.width / imageRect.scale;
  const height = cropBox.height / imageRect.scale;
  return {
    ...integerCrop(originX, originY, width, height, imageWidth, imageHeight),
    full: false,
  };
}
