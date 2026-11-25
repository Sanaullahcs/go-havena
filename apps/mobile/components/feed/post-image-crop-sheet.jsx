import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image as RNImage,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import * as ImageManipulator from "expo-image-manipulator";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Fonts } from "../../constants/font";
import { Colors } from "../../constants/tokens";
import { sf, sw } from "../../utils/responsive";
import {
  clampCropBox,
  containedImageRect,
  cropRectFromFrame,
  fileNameForFormat,
  initialCropBox,
  resizeCropBox,
  saveFormatForAsset,
} from "../../utils/gallery-image-options";

const SAVE_FORMAT = {
  jpeg: ImageManipulator.SaveFormat.JPEG,
  png: ImageManipulator.SaveFormat.PNG,
  webp: ImageManipulator.SaveFormat.WEBP,
};

export default function PostImageCropSheet({ visible, asset, onUseOriginal, onCropped }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const frameWidth = Math.max(1, windowWidth - sw(32));
  const frameHeight = Math.max(1, Math.min(windowHeight * 0.62, windowHeight - insets.top - insets.bottom - sw(160)));
  const [pixelSize, setPixelSize] = useState({
    width: Number(asset?.width) || 0,
    height: Number(asset?.height) || 0,
  });
  const [cropBox, setCropBox] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cropBoxRef = useRef(null);
  const grantRef = useRef(null);
  const imageRectRef = useRef(null);

  const imageRect = useMemo(
    () => containedImageRect(pixelSize.width, pixelSize.height, frameWidth, frameHeight),
    [pixelSize.width, pixelSize.height, frameWidth, frameHeight],
  );

  useEffect(() => {
    imageRectRef.current = imageRect;
  }, [imageRect]);

  useEffect(() => {
    if (!visible) return undefined;
    setError("");
    setBusy(false);
    const width = Number(asset?.width) || 0;
    const height = Number(asset?.height) || 0;
    if (width > 0 && height > 0) {
      setPixelSize({ width, height });
      return undefined;
    }
    if (!asset?.uri) return undefined;
    let cancelled = false;
    RNImage.getSize(
      asset.uri,
      (nextWidth, nextHeight) => {
        if (!cancelled) setPixelSize({ width: nextWidth, height: nextHeight });
      },
      () => {
        if (!cancelled) setError(t("imagePicker.tryAgain"));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [asset?.height, asset?.uri, asset?.width, t, visible]);

  useEffect(() => {
    if (!visible || !imageRect) {
      setCropBox(null);
      return;
    }
    const next = initialCropBox(imageRect);
    cropBoxRef.current = next;
    setCropBox(next);
  }, [imageRect, visible]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        grantRef.current = cropBoxRef.current;
      },
      onPanResponderMove: (_, gesture) => {
        const start = grantRef.current;
        const bounds = imageRectRef.current;
        if (!start || !bounds) return;
        const next = clampCropBox(
          {
            ...start,
            x: start.x + gesture.dx,
            y: start.y + gesture.dy,
          },
          bounds,
        );
        cropBoxRef.current = next;
        setCropBox(next);
      },
    }),
  ).current;

  const updateBox = (next) => {
    cropBoxRef.current = next;
    setCropBox(next);
  };

  const resize = (scale) => {
    if (!cropBox || !imageRect || busy) return;
    updateBox(resizeCropBox(cropBox, imageRect, scale));
  };

  const applyCrop = async () => {
    if (!asset?.uri || !cropBox || busy) return;
    const rect = cropRectFromFrame({
      imageWidth: pixelSize.width,
      imageHeight: pixelSize.height,
      frameWidth,
      frameHeight,
      cropBox,
    });
    if (!rect) {
      setError(t("imagePicker.tryAgain"));
      return;
    }
    if (rect.full) {
      onUseOriginal?.();
      return;
    }

    setBusy(true);
    setError("");
    try {
      const format = saveFormatForAsset(asset);
      const manipulated = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ crop: { originX: rect.originX, originY: rect.originY, width: rect.width, height: rect.height } }],
        { compress: 1, format: SAVE_FORMAT[format] },
      );
      const named = fileNameForFormat(asset, format);
      onCropped?.({
        ...asset,
        uri: manipulated.uri,
        width: manipulated.width || rect.width,
        height: manipulated.height || rect.height,
        mimeType: named.mimeType,
        fileName: named.fileName,
        galleryOriginal: true,
        base64: undefined,
      });
    } catch (err) {
      setError(err?.message || t("imagePicker.tryAgain"));
      setBusy(false);
    }
  };

  const dim = "rgba(0,0,0,0.55)";

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onUseOriginal} statusBarTranslucent>
      <View style={[styles.screen, { paddingTop: insets.top + sw(8), paddingBottom: insets.bottom + sw(12) }]}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={onUseOriginal}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={t("imagePicker.useOriginal")}
          >
            <Text style={styles.useOriginalText}>{t("imagePicker.useOriginal")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.cropButton, busy && styles.disabled]}
            onPress={applyCrop}
            disabled={busy || !cropBox}
            accessibilityRole="button"
            accessibilityLabel={t("imagePicker.crop")}
          >
            {busy ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.cropButtonText}>{t("imagePicker.crop")}</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.hint}>{t("imagePicker.cropHint")}</Text>

        <View style={[styles.frame, { width: frameWidth, height: frameHeight }]}>
          {asset?.uri ? (
            <Image
              source={{ uri: asset.uri }}
              style={styles.frameImage}
              contentFit="contain"
            />
          ) : null}
          {imageRect && cropBox ? (
            <>
              <View pointerEvents="none" style={[styles.dim, { top: 0, left: 0, right: 0, height: cropBox.y, backgroundColor: dim }]} />
              <View pointerEvents="none" style={[styles.dim, { top: cropBox.y + cropBox.height, left: 0, right: 0, bottom: 0, backgroundColor: dim }]} />
              <View pointerEvents="none" style={[styles.dim, { top: cropBox.y, left: 0, width: cropBox.x, height: cropBox.height, backgroundColor: dim }]} />
              <View pointerEvents="none" style={[styles.dim, { top: cropBox.y, left: cropBox.x + cropBox.width, right: 0, height: cropBox.height, backgroundColor: dim }]} />
              <View
                {...panResponder.panHandlers}
                style={[
                  styles.cropWindow,
                  { left: cropBox.x, top: cropBox.y, width: cropBox.width, height: cropBox.height },
                ]}
              />
            </>
          ) : null}
        </View>

        <View style={styles.resizeRow}>
          <Pressable
            style={styles.resizeButton}
            onPress={() => resize(0.85)}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={t("imagePicker.shrinkCrop")}
          >
            <Feather name="minus" size={sf(18)} color="#FFFFFF" />
          </Pressable>
          <Pressable
            style={styles.resizeButton}
            onPress={() => resize(1.15)}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={t("imagePicker.expandCrop")}
          >
            <Feather name="plus" size={sf(18)} color="#FFFFFF" />
          </Pressable>
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0F172A",
    paddingHorizontal: sw(16),
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: sw(12),
  },
  headerButton: {
    flexShrink: 1,
    paddingVertical: sw(10),
    paddingHorizontal: sw(4),
  },
  useOriginalText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(15),
    color: "#FFFFFF",
  },
  cropButton: {
    minWidth: sw(88),
    paddingVertical: sw(10),
    paddingHorizontal: sw(16),
    borderRadius: sw(10),
    backgroundColor: Colors.brandPrimaryDeep,
    alignItems: "center",
  },
  cropButtonText: {
    fontFamily: Fonts.bold,
    fontSize: sf(15),
    color: "#FFFFFF",
  },
  disabled: { opacity: 0.6 },
  hint: {
    marginTop: sw(4),
    marginBottom: sw(12),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(17),
    color: "#CBD5E1",
  },
  frame: {
    alignSelf: "center",
    backgroundColor: "#020617",
    borderRadius: sw(12),
    overflow: "hidden",
  },
  frameImage: {
    width: "100%",
    height: "100%",
  },
  dim: {
    position: "absolute",
  },
  cropWindow: {
    position: "absolute",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  resizeRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: sw(16),
    marginTop: sw(16),
  },
  resizeButton: {
    width: sw(44),
    height: sw(44),
    borderRadius: sw(22),
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  error: {
    marginTop: sw(10),
    textAlign: "center",
    color: "#FCA5A5",
    fontFamily: Fonts.medium,
    fontSize: sf(12),
  },
});
