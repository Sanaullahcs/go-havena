import React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import AppModal from "../layout/app-modal";
import { Fonts } from "../../constants/font";
import { HomeTheme as T } from "../../constants/home-theme";
import { SCREEN_HEIGHT, sf, sw } from "../../utils/responsive";
import { chevronForward } from "../../utils/rtl";

function communityLocation(community) {
  const address = String(community?.address ?? "").trim();
  const region = String(community?.region ?? "").trim();
  if (!address) return region || null;
  if (!region) return address;
  const addressLower = address.toLowerCase();
  const regionLower = region.toLowerCase();
  if (addressLower.includes(regionLower) || regionLower.includes(addressLower)) {
    return address;
  }
  return `${address} · ${region}`;
}

function communityInitial(name) {
  const text = String(name || "").trim();
  return text ? text.charAt(0).toUpperCase() : "C";
}

function CommunityRow({ row, disabled, onPress, t }) {
  const name = row.community?.name || t("community.myCommunity");
  const location = communityLocation(row.community);

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={name}
      style={({ pressed }) => [styles.optionHit, pressed && !disabled && styles.optionHitPressed]}
    >
      <View style={styles.optionRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{communityInitial(name)}</Text>
        </View>

        <View style={styles.optionCopy}>
          <Text style={styles.optionTitle} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.optionSub} numberOfLines={2}>
            {location || t("myCommunity.switchOpenCommunity")}
          </Text>
        </View>

        <View style={styles.optionTrailing}>
          <Feather name={chevronForward()} size={sf(18)} color={T.gray} />
        </View>
      </View>
    </Pressable>
  );
}

export default function SwitchCommunitySheet({
  visible,
  communities = [],
  switching = false,
  onClose,
  onSelect,
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const close = () => {
    if (!switching) onClose?.();
  };

  return (
    <AppModal visible={visible} onRequestClose={close}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel={t("common.close")} />

        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, sw(18)) }]}>
          <Pressable onPress={close} hitSlop={12} accessibilityRole="button" style={styles.handleHit}>
            <View style={styles.handle} />
          </Pressable>

          <View style={styles.headerRow}>
            <View style={styles.headerIcon}>
              <Feather name="repeat" size={sf(18)} color={T.navy} />
            </View>

            <View style={styles.headerCopy}>
              <Text style={styles.title}>{t("myCommunity.switchCommunity")}</Text>
              <Text style={styles.subtitle} numberOfLines={2}>
                {t("myCommunity.switchSheetSubtitle")}
              </Text>
            </View>

            {switching ? (
              <ActivityIndicator color={T.navy} style={styles.closeBtn} />
            ) : (
              <Pressable
                style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}
                onPress={close}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t("common.close")}
              >
                <Feather name="x" size={sf(18)} color={T.navy} />
              </Pressable>
            )}
          </View>

          <View style={styles.divider} />

          <Text style={styles.listLabel}>{t("myCommunity.pickCommunityToSwitch")}</Text>

          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            bounces={communities.length > 4}
            keyboardShouldPersistTaps="handled"
          >
            {communities.map((row) => (
              <CommunityRow
                key={row.community_id || row.id}
                row={row}
                disabled={switching}
                onPress={() => onSelect?.(row)}
                t={t}
              />
            ))}
          </ScrollView>
        </View>
      </View>
    </AppModal>
  );
}

const AVATAR = sw(44);
const HEADER_ICON = sw(44);
const CLOSE = sw(36);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: T.white,
    borderTopStartRadius: sw(24),
    borderTopEndRadius: sw(24),
    paddingHorizontal: sw(20),
    paddingTop: sw(10),
  },
  handleHit: {
    alignItems: "center",
    paddingVertical: sw(6),
    marginBottom: sw(4),
  },
  handle: {
    width: sw(40),
    height: sw(4),
    borderRadius: 999,
    backgroundColor: "#D1D5DB",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: sw(14),
  },
  headerIcon: {
    width: HEADER_ICON,
    height: HEADER_ICON,
    borderRadius: sw(12),
    backgroundColor: "#E8F0F8",
    alignItems: "center",
    justifyContent: "center",
    marginEnd: sw(12),
    flexShrink: 0,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    paddingTop: sw(2),
    paddingEnd: sw(10),
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: sf(17),
    lineHeight: sf(22),
    color: T.navy,
  },
  subtitle: {
    marginTop: sw(3),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(17),
    color: T.gray,
  },
  closeBtn: {
    width: CLOSE,
    height: CLOSE,
    borderRadius: sw(10),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: T.canvas,
    flexShrink: 0,
    marginTop: sw(4),
  },
  closeBtnPressed: {
    backgroundColor: T.mint,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: T.border,
    marginBottom: sw(12),
  },
  listLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    lineHeight: sf(16),
    color: T.gray,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: sw(10),
  },
  list: {
    maxHeight: SCREEN_HEIGHT * 0.48,
  },
  listContent: {
    paddingBottom: sw(4),
  },
  optionHit: {
    marginBottom: sw(10),
    borderRadius: sw(16),
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E8EEF4",
    overflow: "hidden",
  },
  optionHitPressed: {
    backgroundColor: T.canvas,
    borderColor: "#C7E8E4",
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    paddingVertical: sw(14),
    paddingHorizontal: sw(14),
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: sw(12),
    backgroundColor: T.mint,
    alignItems: "center",
    justifyContent: "center",
    marginEnd: sw(12),
    flexShrink: 0,
  },
  avatarText: {
    fontFamily: Fonts.bold,
    fontSize: sf(17),
    lineHeight: sf(22),
    color: T.deepTeal,
  },
  optionCopy: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    justifyContent: "center",
  },
  optionTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(15),
    lineHeight: sf(20),
    color: T.navy,
  },
  optionSub: {
    marginTop: sw(3),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(16),
    color: T.gray,
  },
  optionTrailing: {
    width: sw(28),
    alignItems: "center",
    justifyContent: "center",
    marginStart: sw(8),
    flexShrink: 0,
  },
});
