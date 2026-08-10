import { View, Text, Pressable, StyleSheet, Animated, Modal, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import BurgerButton from "./burger-button";
import { Fonts } from "../../constants/font";
import { HomeTheme as T } from "../../constants/home-theme";
import React, { useCallback, useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useFocusEffect } from "expo-router";
import { getProfileFields, getRoleLabel } from "../../utils/profile-display";
import { isGuestUser } from "../../services/community-access";
import { fetchMe } from "../../services/profile-api";
import { getUser } from "../../services/auth-session";
import { HeaderShell } from "../layout/header-chrome";
import { sw, sf } from "../../utils/responsive";
import { useNotificationUnread } from "../../hooks/use-notification-unread";
import { useMessageUnread } from "../../hooks/use-message-unread";
import NotificationCountBadge from "./notification-count-badge";
import LanguageToggle from "./language-toggle";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function TopBar({ onMenuPress }) {
  const router = useRouter();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [user, setUser] = useState(null);
  const { unread } = useNotificationUnread();
  const { unread: messageUnread } = useMessageUnread();

  const [inboxOpen, setInboxOpen] = useState(false);
  const inboxAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(inboxAnim, {
      toValue: inboxOpen ? 1 : 0,
      friction: 9,
      tension: 140,
      useNativeDriver: true,
    }).start();
  }, [inboxOpen]);

  const totalUnread = (unread || 0) + (messageUnread || 0);

  const navigateFromInbox = useCallback(
    (route) => {
      setInboxOpen(false);
      setTimeout(() => router.push(route), 200);
    },
    [router],
  );

  useFocusEffect(
    useCallback(() => {
      fetchMe()
        .then(setUser)
        .catch(() => getUser().then(setUser));
    }, []),
  );

  const guestUser = isGuestUser(user);
  const { communityName, regionTitle, unitNumber } = getProfileFields(user);
  const roleLabel = getRoleLabel(user);
  const hasCommunity = Boolean(user?.memberships?.some((m) => m?.community?.name));
  const title = hasCommunity ? communityName : t("topBar.chooseYourCommunity");
  const subtitle = hasCommunity
    ? guestUser
      ? regionTitle || t("topBar.temporaryAccess")
      : [unitNumber ? t("topBar.unit", { number: unitNumber }) : null, regionTitle].filter(Boolean).join(" · ") ||
        t("topBar.yourNeighborhood")
    : t("topBar.completeSetup");

  return (
    <HeaderShell padded dense>
      <View style={styles.row}>
        <View style={styles.left}>
          <BurgerButton onPress={onMenuPress} compact plain iconColor={T.navy} />
          <Pressable
            style={styles.location}
            accessibilityLabel={t("topBar.communityLocation", { name: title })}
            onPress={() => router.push("/(tabs)/profile")}
          >
            <View style={styles.pinWrap}>
              <Feather name="map-pin" size={sf(13)} color={T.white} />
            </View>
            <View style={styles.locationCopy}>
              <View style={styles.titleRow}>
                <Text style={styles.locationText} numberOfLines={1} ellipsizeMode="tail">
                  {title}
                </Text>
                {guestUser ? (
                  <View style={styles.rolePill}>
                    <Text style={styles.rolePillText}>{roleLabel}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.locationSub} numberOfLines={1} ellipsizeMode="tail">
                {subtitle}
              </Text>
            </View>
            <Feather name="chevron-down" size={sf(14)} color={T.gray} />
          </Pressable>
        </View>

        <View style={styles.right}>
          <LanguageToggle />

          <Pressable
            style={({ pressed }) => [styles.inboxBtn, pressed && styles.inboxBtnPressed]}
            onPress={() => setInboxOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t("notifications.title")}
          >
            <Feather name="inbox" size={sf(17)} color={T.navy} />
            <NotificationCountBadge count={totalUnread} size="sm" label="inbox" />
          </Pressable>
        </View>
      </View>

      {inboxOpen && (
        <Modal transparent animationType="none" onRequestClose={() => setInboxOpen(false)}>
          <Pressable style={styles.backdrop} onPress={() => setInboxOpen(false)} />

          <Animated.View
            style={[
              styles.popover,
              { top: insets.top + sw(50) },
              {
                opacity: inboxAnim,
                transform: [
                  {
                    scale: inboxAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.92, 1],
                    }),
                  },
                  {
                    translateY: inboxAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-8, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.popHeader}>
              <Feather name="inbox" size={sf(13)} color={T.teal} />
              <Text style={styles.popHeaderText}>{t("notifications.inbox", "Inbox")}</Text>
            </View>

            <View style={styles.divider} />

            <Pressable
              style={({ pressed }) => [styles.inboxRow, pressed && styles.inboxRowPressed]}
              onPress={() => navigateFromInbox("/screens/messages")}
            >
              <View style={styles.inboxIconWrap}>
                <Feather name="message-circle" size={sf(15)} color={T.white} />
              </View>
              <View style={styles.inboxRowContent}>
                <Text style={styles.inboxRowTitle}>{t("notifications.messages", "Messages")}</Text>
                <Text style={styles.inboxRowSub}>{t("notifications.messagesSub", "Conversations & chats")}</Text>
              </View>
              {messageUnread > 0 ? (
                <View style={styles.inlineBadge}>
                  <Text style={styles.inlineBadgeText}>
                    {messageUnread > 99 ? "99+" : messageUnread}
                  </Text>
                </View>
              ) : (
                <Feather name="chevron-right" size={sf(14)} color={T.border} />
              )}
            </Pressable>

            <View style={styles.dividerInset} />

            <Pressable
              style={({ pressed }) => [styles.inboxRow, pressed && styles.inboxRowPressed]}
              onPress={() => navigateFromInbox("/screens/notification")}
            >
              <View style={[styles.inboxIconWrap, styles.inboxIconBell]}>
                <Feather name="bell" size={sf(15)} color={T.white} />
              </View>
              <View style={styles.inboxRowContent}>
                <Text style={styles.inboxRowTitle}>{t("notifications.title", "Notifications")}</Text>
                <Text style={styles.inboxRowSub}>{t("notifications.sub", "Updates & alerts")}</Text>
              </View>
              {unread > 0 ? (
                <View style={styles.inlineBadge}>
                  <Text style={styles.inlineBadgeText}>
                    {unread > 99 ? "99+" : unread}
                  </Text>
                </View>
              ) : (
                <Feather name="chevron-right" size={sf(14)} color={T.border} />
              )}
            </Pressable>

            <View style={styles.popFooter}>
              <Feather name="zap" size={sf(10)} color={T.teal} />
              <Text style={styles.popFooterText}>{t("notifications.footer", "Stay connected with your community")}</Text>
            </View>
          </Animated.View>
        </Modal>
      )}
    </HeaderShell>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: sw(10),
    minHeight: sw(42),
  },
  left: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    minWidth: 0,
  },
  pinWrap: {
    width: sw(30),
    height: sw(30),
    borderRadius: sw(9),
    backgroundColor: T.navy,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  location: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: sw(7),
    minWidth: 0,
    backgroundColor: T.white,
    borderRadius: sw(11),
    borderWidth: 1,
    borderColor: T.border,
    paddingHorizontal: sw(8),
    paddingVertical: sw(6),
  },
  locationCopy: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
    minWidth: 0,
  },
  rolePill: {
    paddingHorizontal: sw(6),
    paddingVertical: sw(2),
    borderRadius: 999,
    backgroundColor: T.mint,
    flexShrink: 0,
  },
  rolePillText: {
    fontFamily: Fonts.bold,
    fontSize: sf(9),
    lineHeight: sf(12),
    color: T.deepTeal,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  locationText: {
    flexShrink: 1,
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    lineHeight: sf(17),
    color: T.navy,
    fontWeight: "700",
  },
  locationSub: {
    marginTop: 1,
    fontFamily: Fonts.regular,
    fontSize: sf(10),
    lineHeight: sf(13),
    color: T.gray,
    fontWeight: "400",
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
    flexShrink: 0,
  },

  inboxBtn: {
    width: sw(36),
    height: sw(36),
    borderRadius: sw(10),
    backgroundColor: T.white,
    borderWidth: 1,
    borderColor: T.border,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "visible",
  },
  inboxBtnPressed: {
    backgroundColor: T.mint,
    borderColor: T.teal,
  },

  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 61, 95, 0.1)",
  },

  popover: {
    position: "absolute",
    end: sw(16),
    width: sw(240),
    backgroundColor: T.white,
    borderRadius: sw(14),
    overflow: "hidden",
    ...(Platform.OS === "ios"
      ? {
          shadowColor: "#0A2A43",
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.14,
          shadowRadius: 24,
        }
      : { elevation: 12 }),
  },

  popHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
    paddingHorizontal: sw(16),
    paddingTop: sw(14),
    paddingBottom: sw(10),
  },
  popHeaderText: {
    fontFamily: Fonts.bold,
    fontSize: sf(11),
    color: T.gray,
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  divider: {
    height: 1,
    backgroundColor: T.border,
    marginHorizontal: sw(12),
  },
  dividerInset: {
    height: 1,
    backgroundColor: T.border,
    marginStart: sw(54),
    marginEnd: sw(14),
  },

  inboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
    paddingHorizontal: sw(14),
    paddingVertical: sw(12),
  },
  inboxRowPressed: {
    backgroundColor: T.canvas,
  },
  inboxIconWrap: {
    width: sw(32),
    height: sw(32),
    borderRadius: sw(9),
    backgroundColor: T.deepTeal,
    alignItems: "center",
    justifyContent: "center",
  },
  inboxIconBell: {
    backgroundColor: T.navy,
  },
  inboxRowContent: {
    flex: 1,
    minWidth: 0,
  },
  inboxRowTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    color: T.navy,
    fontWeight: "600",
  },
  inboxRowSub: {
    fontFamily: Fonts.regular,
    fontSize: sf(10.5),
    color: T.gray,
    marginTop: 1,
  },

  inlineBadge: {
    minWidth: sw(20),
    height: sw(20),
    borderRadius: sw(10),
    backgroundColor: "#FF3B30",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: sw(5),
  },
  inlineBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: sf(9.5),
    color: T.white,
    fontWeight: "700",
    letterSpacing: -0.3,
  },

  popFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(5),
    paddingVertical: sw(10),
    backgroundColor: T.canvas,
    borderTopWidth: 1,
    borderTopColor: T.border,
  },
  popFooterText: {
    fontFamily: Fonts.regular,
    fontSize: sf(10),
    color: T.gray,
  },
});
