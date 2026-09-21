import { View, Text, Pressable, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { PageType } from "../../constants/page-styles";
import { chevronForward } from "../../utils/rtl";

export default function AmenityRow({ name, description, capacity, status, icon, onPress }) {
  const { t } = useTranslation();
  const isAvailable = status === "Available" || status === "Available Now";
  const showBadge = Boolean(status);

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={onPress}
    >
      <View style={styles.iconWrap}>
        {icon ? (
          <Image source={icon} style={styles.icon} contentFit="contain" />
        ) : (
          <Feather name="home" size={22} color="#0A2A43" />
        )}
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={2}>
            {name}
          </Text>
          {showBadge ? (
            <View style={[styles.badge, isAvailable ? styles.badgeOk : styles.badgeMuted]}>
              <Text style={[styles.badgeText, isAvailable ? styles.badgeTextOk : styles.badgeTextMuted]} numberOfLines={1}>
                {isAvailable ? t("property.available") : status}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.description} numberOfLines={2}>
          {description}
        </Text>
        {capacity ? (
          <Text style={styles.capacity} numberOfLines={1}>
            {capacity}
          </Text>
        ) : null}
      </View>

      <Feather name={chevronForward()} size={18} color="#D1D5DB" style={styles.chevron} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    padding: 14,
    gap: 12,
    marginBottom: 10,
  },
  pressed: { opacity: 0.9 },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#F9FAFB",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  icon: { width: 32, height: 32 },
  body: { flex: 1, minWidth: 0 },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 2,
  },
  title: {
    flex: 1,
    fontFamily: Fonts.bold,
    fontSize: PageType.cardTitle,
    lineHeight: PageType.cardTitleLine,
    color: "#101828",
    fontWeight: "700",
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    flexShrink: 0,
    maxWidth: "42%",
  },
  badgeOk: { backgroundColor: "#F0FDF4" },
  badgeMuted: { backgroundColor: "#F9FAFB" },
  badgeText: {
    fontFamily: Fonts.medium,
    fontSize: 11,
    lineHeight: 14,
  },
  badgeTextOk: { color: "#008236" },
  badgeTextMuted: { color: "#4A5565" },
  description: {
    fontFamily: Fonts.regular,
    fontSize: PageType.body,
    lineHeight: PageType.bodyLine,
    color: "#6A7282",
    marginBottom: 4,
  },
  capacity: {
    fontFamily: Fonts.medium,
    fontSize: PageType.caption,
    lineHeight: PageType.captionLine,
    color: "#4A5565",
  },
  chevron: { marginTop: 4, flexShrink: 0 },
});
