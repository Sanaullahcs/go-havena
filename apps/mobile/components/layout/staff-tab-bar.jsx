import React, { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { sw, sf } from "../../utils/responsive";
import { fetchStaffTasks } from "../../services/complaints-api";

const NAVY = "#1B4F8A";

const TABS = [
  { id: "home", label: "Home", icon: "home", href: "/screens/staff-tasks/home" },
  { id: "tasks", label: "Tasks", icon: "briefcase", href: "/screens/staff-tasks" },
  { id: "messages", label: "Messages", icon: "message-circle", href: "/screens/staff-tasks/messages" },
  { id: "profile", label: "Profile", icon: "user", href: "/screens/staff-tasks/profile" },
];

export default function StaffTabBar({ active }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState(0);

  useFocusEffect(useCallback(() => {
    let alive = true;
    const load = async () => {
      try {
        const tasks = await fetchStaffTasks({});
        const unread = (tasks.data ?? []).reduce((sum, row) => sum + Number(row.unread_count || 0), 0);
        if (alive) setMessages(unread);
      } catch {
        if (alive) setMessages(0);
      }
    };
    void load();
    const timer = setInterval(load, 8000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []));

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, sw(8)) }]}>
      {TABS.map((tab) => {
        const selected = tab.id === active;
        const badge = tab.id === "messages" ? messages : 0;
        return (
          <Pressable
            key={tab.id}
            onPress={() => {
              if (!selected) router.replace(tab.href);
            }}
            style={styles.tab}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={tab.label}
          >
            <View style={[styles.iconWrap, selected && styles.iconWrapOn]}>
              <Feather name={tab.icon} size={sf(18)} color={selected ? NAVY : "#94A3B8"} />
              {badge > 0 ? <View style={styles.dot} /> : null}
            </View>
            <Text style={[styles.label, selected && styles.labelOn]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E6EDF5",
    paddingTop: sw(6),
  },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 1, minHeight: sw(46) },
  iconWrap: {
    minWidth: sw(28),
    height: sw(28),
    paddingHorizontal: sw(10),
    borderRadius: sw(14),
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapOn: { backgroundColor: "#E7F0FA", minWidth: sw(46) },
  label: { fontFamily: Fonts.medium, fontSize: sf(11), lineHeight: sf(14), color: "#94A3B8" },
  labelOn: { color: NAVY, fontFamily: Fonts.semiBold },
  dot: {
    position: "absolute",
    top: sw(2),
    right: sw(6),
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#EF4444",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
});
