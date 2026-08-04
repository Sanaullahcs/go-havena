import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { Colors, Layout } from "../../constants/tokens";
import { useRouter } from "expo-router";
import {
  formatUnreadNotificationLabel,
  useNotificationUnread,
} from "../../hooks/use-notification-unread";
import NotificationCountBadge from "../ui/notification-count-badge";
import { PropertyManagementRoutes } from "../../constants/property-management-routes";
import { sw, sf } from "../../utils/responsive";

const ITEMS = [
  {
    id: "notifications",
    icon: "bell",
    title: "Notifications",
    getSubtitle: (unread) => formatUnreadNotificationLabel(unread),
    route: "/screens/notification",
    showBadge: true,
  },
  {
    id: "property",
    icon: "home",
    title: "Property management",
    getSubtitle: () => "Rules, documents & reservations",
    route: PropertyManagementRoutes.HOME,
  },
  {
    id: "settings",
    icon: "settings",
    title: "Settings",
    getSubtitle: () => "Account & preferences",
    route: "/screens/settings",
  },
];

export default function QuickAccess() {
  const router = useRouter();
  const { unread } = useNotificationUnread();

  return (
    <View style={styles.container}>
      <Text style={styles.sectionLabel}>Quick access</Text>

      <View style={styles.card}>
        {ITEMS.map((item, index) => (
          <Pressable
            key={item.id}
            onPress={() => router.push(item.route)}
            android_ripple={{ color: "rgba(0,82,223,0.08)" }}
            style={[styles.row, index < ITEMS.length - 1 && styles.rowBorder]}
          >
            <View style={styles.iconBox}>
              <Feather name={item.icon} size={sf(15)} color={Colors.brandPrimaryDeep} />
              {item.showBadge ? <NotificationCountBadge count={unread} size="sm" /> : null}
            </View>

            <View style={styles.copy}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {item.getSubtitle(unread)}
              </Text>
            </View>

            <Feather name="chevron-right" size={sf(15)} color="#C5CDD8" />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: sw(22),
    paddingBottom: sw(8),
  },
  sectionLabel: {
    fontFamily: Fonts.bold,
    fontWeight: "700",
    fontSize: sf(12),
    lineHeight: sf(16),
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: Colors.brandPrimary,
    marginBottom: sw(10),
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Layout.cardRadius,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    overflow: "visible",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
    paddingVertical: sw(13),
    paddingHorizontal: sw(14),
    minHeight: sw(64),
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0, 0, 0, 0.06)",
  },
  rowPressed: {
    backgroundColor: Colors.surfaceMuted,
  },
  iconBox: {
    width: sw(38),
    height: sw(38),
    borderRadius: sw(11),
    backgroundColor: "#D1FAF5",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "visible",
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
    fontSize: sf(13),
    lineHeight: sf(18),
    color: Colors.textPrimary,
  },
  subtitle: {
    marginTop: 2,
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    lineHeight: sf(15),
    color: Colors.textSecondary,
  },
});
