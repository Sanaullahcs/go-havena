import React, { useEffect, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { mediaImageSource } from "../../utils/profile-display";

function normalizeSource(value) {
  if (value == null || value === false) return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const uri = value.trim();
    return uri ? mediaImageSource(uri) : null;
  }
  if (typeof value === "object") {
    if (typeof value.uri === "string" && value.uri.trim()) {
      return mediaImageSource(value);
    }
    if (typeof value === "number") return value;
  }
  return null;
}

/** Remote wellness photo with a bundled fallback if the URL is missing or fails. */
export default function WellnessCoverImage({
  source,
  fallback,
  style,
  resizeMode = "cover",
}) {
  const [failed, setFailed] = useState(false);
  const primary = normalizeSource(source);
  const backup = normalizeSource(fallback);
  const sourceKey = typeof primary === "number" ? primary : primary?.uri ?? "";

  useEffect(() => {
    setFailed(false);
  }, [sourceKey]);

  const remote = !failed ? primary : null;
  const base = backup ?? (!remote ? primary : null);
  if (!remote && !base) return null;

  return (
    <View style={[styles.frame, style]} pointerEvents="none">
      {base ? (
        <Image source={base} style={styles.fill} resizeMode={resizeMode} />
      ) : null}
      {remote && remote !== base ? (
        <Image
          source={remote}
          style={styles.fill}
          resizeMode={resizeMode}
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
