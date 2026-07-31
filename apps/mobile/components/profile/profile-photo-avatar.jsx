import React from "react";
import { View, StyleSheet, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import CrispImage from "../ui/crisp-image";

/**
 * Profile photo only — not utility bill. Empty state uses user/camera icon.
 */
export default function ProfilePhotoAvatar({
  avatarUrl,
  size = 44,
  uploading = false,
  style,
}) {
  const hasPhoto = Boolean(avatarUrl);
  const badgeSize = Math.max(16, Math.round(size * 0.36));
  const iconSize = Math.max(18, Math.round(size * 0.4));

  const radius = size / 2;

  return (
    <View
      style={[
        styles.wrap,
        { width: size, height: size, borderRadius: radius },
        style,
      ]}
    >
      <View
        style={[
          styles.circle,
          { width: size, height: size, borderRadius: radius },
        ]}
      >
        {hasPhoto ? (
          <CrispImage
            source={{ uri: avatarUrl }}
            style={{ width: size, height: size, borderRadius: radius }}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.placeholder, { borderRadius: radius }]}>
            <Feather name="user" size={iconSize} color="#0052DF" />
          </View>
        )}
      </View>

      <View
        style={[
          styles.badge,
          {
            width: badgeSize,
            height: badgeSize,
            borderRadius: badgeSize / 2,
            right: -1,
            bottom: -1,
          },
        ]}
      >
        <Feather
          name={hasPhoto ? "edit-2" : "camera"}
          size={Math.max(10, badgeSize * 0.55)}
          color="#FFFFFF"
        />
      </View>

      {uploading ? (
        <View style={[styles.loading, { borderRadius: radius }]}>
          <ActivityIndicator color="#FFFFFF" size="small" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "relative",
  },
  circle: {
    overflow: "hidden",
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 82, 223, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    backgroundColor: "#0052DF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
});
