import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { sw } from "../../utils/responsive";
import { useLanguage } from "../../providers/language-provider";

const HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };

export default function BackButton({
  label,
  showLabel = false,
  iconOnly = true,
  compact = true,
  onPress,
  style,
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const { isRTL } = useLanguage();
  const resolvedLabel = label ?? t("common.back");
  const showText = showLabel && !iconOnly;

  const handlePress = (e) => {
    if (onPress) return onPress(e);
    if (router.canGoBack?.()) {
      router.back();
      return;
    }
    router.replace("/");
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={resolvedLabel}
      hitSlop={HIT_SLOP}
      onPress={handlePress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed, style]}
    >
      <View style={[styles.contentRow, compact && styles.contentRowCompact]}>
        <View
          style={[
            styles.iconWrap,
            iconOnly && styles.iconWrapCircle,
            iconOnly && compact && styles.iconWrapCircleCompact,
          ]}
        >
          <Image
            source={require("../../assets/images/new-back-icon.png")}
            contentFit="contain"
            contentPosition="center"
            style={[
              styles.icon,
              compact && styles.iconCompact,
              isRTL && styles.iconFlipped,
            ]}
          />
        </View>
        {showText ? <Text style={styles.label}>{resolvedLabel}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: "flex-start",
    ...(Platform.OS === "web" ? { width: "auto" } : null),
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "nowrap",
    gap: 6,
  },
  contentRowCompact: {
    gap: 0,
  },
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.97 }],
  },
  iconWrap: {
    width: 18,
    height: 18,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapCircle: {
    width: sw(36),
    height: sw(36),
    borderRadius: sw(10),
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  iconWrapCircleCompact: {
    width: sw(34),
    height: sw(34),
    borderRadius: sw(9),
  },
  icon: {
    width: 18,
    height: 18,
  },
  iconCompact: {
    width: 17,
    height: 17,
  },
  iconFlipped: {
    transform: [{ scaleX: -1 }],
  },
  label: {
    flexShrink: 0,
    fontSize: 15,
    fontWeight: "500",
    color: "#364153",
    lineHeight: 24,
    fontFamily: Fonts.medium,
    ...(Platform.OS === "web" ? { whiteSpace: "nowrap" } : null),
  },
});
