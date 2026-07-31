import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import CrispImage from "../ui/crisp-image";
import { Fonts } from "../../constants/font";
import { mediaImageSource, resolveMediaUrl } from "../../utils/profile-display";
import { sf, sw } from "../../utils/responsive";

export function resolveNoticeCoverUrl(imageUrl) {
  const resolved = resolveMediaUrl(imageUrl);
  if (!resolved) return null;
  const trimmed = String(resolved).trim();
  if (!trimmed || trimmed === "null" || trimmed === "undefined") return null;
  return trimmed;
}

function noticeInitials(label) {
  const words = String(label ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0].charAt(0)}${words[1].charAt(0)}`.toUpperCase();
}

function NoticeCoverPlaceholder({ size, borderRadius, label, style }) {
  const initials = noticeInitials(label);
  const fontSize = Math.max(sf(14), sf(size * (initials.length > 1 ? 0.32 : 0.38)));

  return (
    <View
      style={[styles.placeholder, { width: size, height: size, borderRadius }, style]}
      accessibilityLabel="Notice image placeholder"
    >
      <Text style={[styles.initials, { fontSize }]} numberOfLines={1}>
        {initials}
      </Text>
    </View>
  );
}

/**
 * Notice list/cover thumbnail — remote image when available, title initials otherwise.
 */
export default function NoticeCoverThumbnail({
  imageUrl,
  title = "",
  size = sw(52),
  borderRadius = sw(10),
  style,
}) {
  const [failed, setFailed] = useState(false);
  const uri = resolveNoticeCoverUrl(imageUrl);

  useEffect(() => {
    setFailed(false);
  }, [uri]);

  if (uri && !failed) {
    return (
      <CrispImage
        source={mediaImageSource(uri)}
        style={[styles.image, { width: size, height: size, borderRadius }, style]}
        contentFit="cover"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <NoticeCoverPlaceholder
      size={size}
      borderRadius={borderRadius}
      label={title}
      style={style}
    />
  );
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: "#EFF6FF",
    flexShrink: 0,
  },
  placeholder: {
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  initials: {
    fontFamily: Fonts.bold,
    color: "#0039A6",
    fontWeight: "800",
  },
});
