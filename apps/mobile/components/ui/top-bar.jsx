import { View, Text, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import BurgerButton from "./burger-button";
import { Fonts } from "../../constants/font";
import React, { useCallback, useState } from "react";
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
import { HavenaColors } from "../../constants/color-scheme";

const navy = HavenaColors.primary.darkNavy;
const lightBorder = HavenaColors.neutral.lightGray;

export default function TopBar({ onMenuPress }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const { unread } = useNotificationUnread();
  const { unread: messageUnread } = useMessageUnread();

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
  const title = hasCommunity ? communityName : "Choose your community";
  const subtitle = hasCommunity
    ? guestUser
      ? regionTitle || "Temporary community access"
      : [unitNumber ? `Unit ${unitNumber}` : null, regionTitle].filter(Boolean).join(" · ") ||
        "Your neighborhood"
    : "Complete setup to personalize home";

  return (
    <HeaderShell padded dense>
      <View style={styles.row}>
        <View style={styles.left}>
          <BurgerButton onPress={onMenuPress} compact plain iconColor={navy} />
          <Pressable
            style={styles.location}
            accessibilityLabel={`Community location: ${title}`}
            onPress={() => router.push("/screens/profile")}
          >
            <View style={styles.pinWrap}>
              <Feather name="map-pin" size={sf(14)} color={HavenaColors.neutral.white} />
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
            <Feather name="chevron-down" size={sf(14)} color={navy} />
          </Pressable>
        </View>

        <View style={styles.right}>
          <Pressable
            style={styles.iconBtn}
            onPress={() => router.push("/screens/messages")}
            accessibilityLabel="Messages"
          >
            <Feather name="message-circle" size={sf(17)} color={navy} />
            <NotificationCountBadge count={messageUnread} size="sm" label="messages" />
          </Pressable>

          <Pressable
            style={styles.iconBtn}
            onPress={() => router.push("/screens/notification")}
            accessibilityLabel="Notifications"
          >
            <Feather name="bell" size={sf(17)} color={navy} />
            <NotificationCountBadge count={unread} size="sm" label="notifications" />
          </Pressable>
        </View>
      </View>
    </HeaderShell>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: sw(10),
    minHeight: sw(44),
  },
  left: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    minWidth: 0,
  },
  pinWrap: {
    width: sw(32),
    height: sw(32),
    borderRadius: sw(10),
    backgroundColor: navy,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  location: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    minWidth: 0,
    backgroundColor: HavenaColors.neutral.white,
    borderRadius: sw(12),
    borderWidth: 1,
    borderColor: lightBorder,
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
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
    flexShrink: 0,
  },
  rolePillText: {
    fontFamily: Fonts.bold,
    fontSize: sf(9),
    lineHeight: sf(12),
    color: "#047857",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  locationText: {
    flexShrink: 1,
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    lineHeight: sf(17),
    color: navy,
    fontWeight: "700",
  },
  locationSub: {
    marginTop: 1,
    fontFamily: Fonts.regular,
    fontSize: sf(10),
    lineHeight: sf(13),
    color: navy,
    fontWeight: "400",
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    flexShrink: 0,
  },
  iconBtn: {
    width: sw(38),
    height: sw(38),
    borderRadius: sw(11),
    backgroundColor: HavenaColors.neutral.white,
    borderWidth: 1,
    borderColor: lightBorder,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "visible",
  },
});
