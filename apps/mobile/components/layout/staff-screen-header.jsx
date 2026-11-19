import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useNavigation, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import ScreenStatusBar from "./screen-status-bar";
import { getTopInset } from "./system-chrome";
import { safeGoBack } from "../../utils/app-navigation";
import { Fonts } from "../../constants/font";
import { isResidentWithStaff } from "../../constants/onboarding-routes";
import { useSessionUser } from "../../hooks/use-session-user";
import { sw, sf } from "../../utils/responsive";

export const STAFF_NAVY = "#1B4F8A";

export default function StaffScreenHeader({ title, subtitle, showBack = false, onBack, right }) {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const top = getTopInset(insets);
  const residentApp = isResidentWithStaff(useSessionUser());
  const goBack = onBack ?? (() => safeGoBack(router, navigation));

  return (
    <View style={[styles.bar, { paddingTop: top }]}>
      <ScreenStatusBar style="light" androidBackgroundColor={STAFF_NAVY} />
      <View style={styles.row}>
        {showBack ? (
          <Pressable
            onPress={goBack}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={styles.back}
          >
            <Feather name="chevron-left" size={sf(22)} color="#FFFFFF" />
          </Pressable>
        ) : null}
        <View style={styles.copy}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        {residentApp || right ? (
          <View style={styles.right}>
            {residentApp ? (
              <Pressable
                onPress={() => router.replace("/(tabs)/home")}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Back to Resident App"
                style={styles.resident}
              >
                <Feather name="home" size={sf(13)} color="#FFFFFF" />
                <Text style={styles.residentText}>Resident</Text>
              </Pressable>
            ) : null}
            {right}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: STAFF_NAVY,
  },
  row: {
    minHeight: sw(56),
    paddingHorizontal: sw(16),
    paddingBottom: sw(14),
    paddingTop: sw(6),
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
  },
  back: {
    width: sw(28),
    height: sw(28),
    alignItems: "center",
    justifyContent: "center",
    marginStart: -sw(6),
  },
  copy: { flex: 1, minWidth: 0 },
  title: {
    fontFamily: Fonts.bold,
    fontSize: sf(20),
    color: "#FFFFFF",
  },
  subtitle: {
    marginTop: 1,
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: "rgba(255,255,255,0.78)",
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(14),
    flexShrink: 0,
  },
  resident: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(4),
    paddingHorizontal: sw(8),
    paddingVertical: sw(5),
    borderRadius: sw(12),
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  residentText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    color: "#FFFFFF",
  },
});
