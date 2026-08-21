import { View, Text, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import BurgerButton from "./burger-button";
import { Fonts } from "../../constants/font";
import { HomeTheme as T } from "../../constants/home-theme";
import React, { useCallback, useState, useRef } from "react";
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
import InboxMenu from "./inbox-menu";

export default function TopBar({ onMenuPress }) {
  const router = useRouter();
  const { t } = useTranslation();
  const [user, setUser] = useState(null);
  const { unread } = useNotificationUnread();
  const { unread: messageUnread } = useMessageUnread();

  const headerRef = useRef(null);
  const inboxBtnRef = useRef(null);
  const [inboxOpen, setInboxOpen] = useState(false);

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
    <View ref={headerRef} collapsable={false}>
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
              ref={inboxBtnRef}
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
      </HeaderShell>

      <InboxMenu
        visible={inboxOpen}
        onClose={() => setInboxOpen(false)}
        headerRef={headerRef}
        triggerRef={inboxBtnRef}
        messageUnread={messageUnread || 0}
        notificationUnread={unread || 0}
        onMessagesPress={() => navigateFromInbox("/screens/messages")}
        onNotificationsPress={() => navigateFromInbox("/screens/notification")}
      />
    </View>
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
    lineHeight: sf(14),
    color: T.deepTeal,
    textTransform: "uppercase",
    letterSpacing: 0,
    includeFontPadding: true,
  },
  locationText: {
    flexShrink: 1,
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    lineHeight: sf(20),
    color: T.navy,
    fontWeight: "700",
    includeFontPadding: true,
  },
  locationSub: {
    marginTop: 1,
    fontFamily: Fonts.regular,
    fontSize: sf(10),
    lineHeight: sf(16),
    color: T.gray,
    fontWeight: "400",
    includeFontPadding: true,
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
});
