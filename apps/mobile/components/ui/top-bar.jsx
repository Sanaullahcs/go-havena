import { View, Text, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import BurgerButton from "./burger-button";
import { Fonts } from "../../constants/font";
import { Colors } from "../../constants/tokens";
import { HomeTheme } from "../../constants/home-theme";
import React, { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { getProfileFields, getRoleLabel } from "../../utils/profile-display";
import { isGuestUser } from "../../services/community-access";
import { fetchMe } from "../../services/profile-api";
import { getUser } from "../../services/auth-session";
import { HeaderShell } from "../layout/header-chrome";
import { sw, sf } from "../../utils/responsive";
import { useNotificationUnread } from "../../hooks/use-notification-unread";
import NotificationCountBadge from "./notification-count-badge";

export default function TopBar({ onMenuPress }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const { unread } = useNotificationUnread();

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
          <BurgerButton onPress={onMenuPress} compact />
          <Pressable
            style={styles.location}
            accessibilityLabel={`Community location: ${title}`}
            onPress={() => router.push("/screens/profile")}
          >
            <View style={styles.pinWrap}>
              <Feather name="map-pin" size={sf(13)} color="#FFFFFF" />
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
            <Feather name="chevron-down" size={sf(14)} color={HomeTheme.mediumGray} />
          </Pressable>
        </View>

        <View style={styles.right}>
          <Pressable
            style={styles.iconBtn}
            onPress={() => router.push("/screens/community-feed/search")}
            accessibilityLabel="Search"
          >
            <Feather name="search" size={sf(17)} color={HomeTheme.deepNavy} />
          </Pressable>

          <Pressable
            style={styles.iconBtn}
            onPress={() => router.push("/screens/notification")}
            accessibilityLabel="Notifications"
          >
            <Feather name="bell" size={sf(17)} color={HomeTheme.deepNavy} />
            <NotificationCountBadge count={unread} size="sm" label="notifications" />
          </Pressable>

          <Pressable
            style={styles.iconBtn}
            onPress={() => router.push("/screens/profile")}
            accessibilityLabel="Profile"
          >
            <Feather name="user" size={sf(17)} color={HomeTheme.deepNavy} />
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
    minHeight: sw(44),
  },
  left: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
    marginRight: sw(8),
  },
  pinWrap: {
    width: sw(30),
    height: sw(30),
    borderRadius: sw(9),
    backgroundColor: HomeTheme.deepNavy,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  location: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
    marginLeft: sw(8),
    backgroundColor: Colors.surface,
    borderRadius: sw(12),
    borderWidth: 1,
    borderColor: HomeTheme.lightBorder,
    paddingHorizontal: sw(8),
    paddingVertical: sw(5),
  },
  locationCopy: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    marginLeft: sw(8),
    marginRight: sw(4),
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
  },
  rolePill: {
    marginLeft: sw(6),
    paddingHorizontal: sw(6),
    paddingVertical: sw(2),
    borderRadius: 999,
    backgroundColor: HomeTheme.primaryTeal,
    flexShrink: 0,
  },
  rolePillText: {
    fontFamily: Fonts.bold,
    fontSize: sf(9),
    lineHeight: sf(12),
    color: "#FFFFFF",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  locationText: {
    flexShrink: 1,
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    lineHeight: sf(17),
    color: HomeTheme.darkText,
    fontWeight: "700",
  },
  locationSub: {
    marginTop: 1,
    fontFamily: Fonts.medium,
    fontSize: sf(10),
    lineHeight: sf(13),
    color: HomeTheme.mediumGray,
    fontWeight: "500",
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
  },
  iconBtn: {
    width: sw(36),
    height: sw(36),
    borderRadius: sw(10),
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: HomeTheme.lightBorder,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "visible",
    marginLeft: sw(6),
  },
});
