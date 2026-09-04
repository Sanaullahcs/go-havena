import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { resolveAppImageSource } from "../../utils/profile-display";
import { imageProps } from "../../constants/typography";

function normalizeSource(value, { allowBundledSeed = true } = {}) {
  if (value == null || value === false) return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const uri = value.trim();
    if (!uri || uri === "null" || uri === "undefined") return null;
    return resolveAppImageSource(uri, { allowBundledSeed });
  }
  if (typeof value === "object") {
    if (typeof value.uri === "string" && value.uri.trim()) {
      return resolveAppImageSource(value.uri, { allowBundledSeed });
    }
  }
  return null;
}

function sourceKey(source) {
  if (source == null) return "";
  if (typeof source === "number") return String(source);
  return source.uri ?? "";
}

/**
 * Uploaded wellness photo first. Bundled fallback only when the URL is
 * missing or the remote image fails to load.
 */
export default function WellnessCoverImage({
  source,
  fallback,
  style,
  resizeMode = "cover",
}) {
  const [failed, setFailed] = useState(false);
  const primary = normalizeSource(source, { allowBundledSeed: false });
  const backup = normalizeSource(fallback);
  const key = sourceKey(primary);

  useEffect(() => {
    setFailed(false);
  }, [key]);

  const showPrimary = Boolean(primary) && !failed;
  const showFallback = Boolean(backup) && !showPrimary;

  if (!showPrimary && !showFallback) return null;

  return (
    <View style={[styles.frame, style]} pointerEvents="none">
      {showFallback ? (
        <Image source={backup} style={styles.fill} contentFit={resizeMode} />
      ) : null}
      {showPrimary ? (
        <Image
          {...(typeof primary === "number" ? {} : imageProps)}
          source={primary}
          style={styles.fill}
          contentFit={resizeMode}
          onError={() => setFailed(true)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: "hidden",
  },
  fill: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
});
