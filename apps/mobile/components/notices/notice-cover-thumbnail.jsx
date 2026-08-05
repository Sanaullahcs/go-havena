import React, { useEffect, useMemo, useState } from "react";
import { View, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { HomeTheme as T } from "../../constants/home-theme";
import { resolveSeedMediaSource } from "../../constants/seed-media";
import { mediaImageSource, resolveMediaUrl } from "../../utils/profile-display";
import { imageProps } from "../../constants/typography";
import { sw } from "../../utils/responsive";

export function resolveNoticeCoverUrl(imageUrl) {
  if (resolveSeedMediaSource(imageUrl) != null) {
    return String(imageUrl).trim();
  }
  const resolved = resolveMediaUrl(imageUrl);
  if (!resolved) return null;
  const trimmed = String(resolved).trim();
  if (!trimmed || trimmed === "null" || trimmed === "undefined") return null;
  return trimmed;
}

function resolveCoverSource(imageUrl) {
  if (!imageUrl && imageUrl !== 0) return null;
  const seed = resolveSeedMediaSource(imageUrl);
  if (seed != null) return seed;
  return mediaImageSource(imageUrl);
}

/** Blank surface when no cover image is available. */
export function NoticeCoverPlaceholder({
  size = sw(52),
  borderRadius = sw(10),
  style,
  fill = false,
  backgroundColor,
}) {
  const frameStyle = fill
    ? StyleSheet.absoluteFillObject
    : { width: size, height: size, borderRadius };

  return (
    <View
      style={[
        styles.placeholder,
        {
          backgroundColor: backgroundColor ?? T.white,
          borderRadius: fill ? 0 : borderRadius,
        },
        frameStyle,
        style,
      ]}
      accessibilityLabel="Notice cover placeholder"
    />
  );
}

/** Cover image when available; blank surface otherwise. */
export function NoticeCoverMedia({
  imageUrl,
  size = sw(52),
  borderRadius = sw(10),
  style,
  fill = false,
  placeholderStyle,
  backgroundColor,
  onImageError,
}) {
  const [failed, setFailed] = useState(false);
  const source = useMemo(() => resolveCoverSource(imageUrl), [imageUrl]);
  const showImage = Boolean(source != null && !failed);

  useEffect(() => {
    setFailed(false);
  }, [imageUrl]);

  const frameStyle = fill
    ? [styles.fillFrame, style]
    : [styles.frame, { width: size, height: size, borderRadius }, style];

  const imageStyle = fill
    ? styles.fillImage
    : { width: size, height: size };

  return (
    <View style={frameStyle}>
      <NoticeCoverPlaceholder
        fill
        size={size}
        borderRadius={borderRadius}
        style={placeholderStyle}
        backgroundColor={backgroundColor}
      />
      {showImage ? (
        <Image
          {...imageProps}
          source={source}
          style={imageStyle}
          contentFit="cover"
          onError={() => {
            setFailed(true);
            onImageError?.();
          }}
        />
      ) : null}
    </View>
  );
}

export default function NoticeCoverThumbnail(props) {
  return <NoticeCoverMedia {...props} />;
}

const styles = StyleSheet.create({
  frame: {
    flexShrink: 0,
    backgroundColor: T.white,
    overflow: "hidden",
  },
  fillFrame: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: T.white,
    overflow: "hidden",
  },
  fillImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  placeholder: {
    overflow: "hidden",
  },
});
