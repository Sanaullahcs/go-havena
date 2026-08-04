import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { Fonts } from "../../../constants/font";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import HavenaLogo from "../../../components/ui/havena-logo";
import BackButton from "../../../components/ui/back-button";
import { Routes } from "../../../constants/onboarding-routes";
import { setCurrentRole } from "../../../constants/role-session";
import ScreenStatusBar from "../../../components/layout/screen-status-bar";
import { prepareAuthScreenChrome } from "../../../components/layout/chrome-manager";
import { HavenaColors as C } from "../../../constants/color-scheme";
import RoleIcon from "../../../components/ui/role-icon";

const ADMIN_THEME = {
  border: "rgba(10, 42, 67, 0.14)",
  accent: C.primary.teal,
  chipBg: "#D1FAF5",
  chipText: C.primary.darkNavy,
  iconBg: "#D1FAF5",
};

const RESIDENT_THEME = {
  border: "rgba(0, 201, 136, 0.22)",
  accent: C.primary.darkTeal,
  chipBg: "rgba(0, 201, 136, 0.12)",
  chipText: "#047857",
  iconBg: "#F0FDF4",
};

export default function Roles() {
  const router = useRouter();

  const roleCards = [
    {
      key: "admin",
      title: "Community Admin",
      subTitle: "Property Owner • Manager • HOA",
      description:
        "Create and manage your building or neighborhood, verify residents, and control announcements.",
      chips: ["Create Community", "Verify Residents", "Manage Events"],
      theme: ADMIN_THEME,
    },
    {
      key: "resident",
      title: "Resident",
      subTitle: "Homeowner • Tenant",
      description:
        "Join your verified community to access wellness programs, notices, and local marketplace.",
      chips: ["Join Community", "Wellness Programs", "Community Feed"],
      theme: RESIDENT_THEME,
    },
  ];

  const handleRoleSelect = (role) => {
    setCurrentRole(role);
    router.push({ pathname: "/screens/signup", params: { role } });
  };

  return (
    <>
      <ScreenStatusBar style="dark" opaque />
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "#F4F8FD" }]} />
      <View style={styles.headerColumn}>
        <BackButton onPress={() => {
          prepareAuthScreenChrome();
          router.replace(Routes.LOGIN);
        }} />
        <View style={styles.brandRow}>
          <View style={styles.logoBox}>
            <HavenaLogo size={40} compact />
          </View>
          <View style={styles.brandCopy}>
            <Text style={styles.brandTitle}>Havena</Text>
            <Text style={styles.brandSubTitle}>
              Community & Wellness Platform
            </Text>
          </View>
        </View>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.headingWrap}>
          <Text style={styles.pageTitle}>Join Havena</Text>
          <Text style={styles.pageSubTitle}>
            Select your role to get started with the right experience for you.
          </Text>
        </View>

        <View style={styles.cardsWrap}>
          {roleCards.map((role) => (
            <TouchableOpacity
              key={role.key}
              style={[
                styles.card,
                {
                  borderColor: role.theme.border,
                  backgroundColor: C.neutral.white,
                },
              ]}
              activeOpacity={0.88}
              onPress={() => handleRoleSelect(role.key)}
            >
              <View style={styles.cardTopRow}>
                <RoleIcon role={role.key} size="md" />

                <View style={styles.cardHeaderTextWrap}>
                  <Text style={styles.cardTitle}>{role.title}</Text>
                  <Text style={[styles.cardSubTitle, { color: role.theme.accent }]}>
                    {role.subTitle}
                  </Text>
                  <Text style={styles.cardDescription}>{role.description}</Text>

                  <View style={styles.chipsRow}>
                    {role.chips.map((chip) => (
                      <View
                        key={chip}
                        style={[styles.chip, { backgroundColor: role.theme.chipBg }]}
                      >
                        <Text style={[styles.chipText, { color: role.theme.chipText }]}>
                          {chip}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>

                <View style={[styles.chevronWrap, { backgroundColor: role.theme.iconBg }]}>
                  <Ionicons name="chevron-forward" size={18} color={role.theme.accent} />
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.noteRow}>
          <View style={styles.noteIconWrap}>
            <Image
              source={require("../../../assets/images/sheild-check.png")}
              style={{ width: 16, height: 16 }}
            />
          </View>
          <Text style={styles.noteText}>
            All accounts are verified by phone number for community safety.
          </Text>
        </View>

        <View style={styles.footerRow}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => {
            prepareAuthScreenChrome();
            router.replace(Routes.LOGIN);
          }}>
            <Text style={styles.signInText}>Sign in with phone</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.signInHint}>
          Same sign-in for residents and community admins
        </Text>
      </ScrollView>
    </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.neutral.background,
  },
  scrollContent: {
    paddingBottom: 12,
  },
  headerColumn: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 8,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: "100%",
  },
  brandCopy: {
    flex: 1,
    minWidth: 0,
  },
  logoBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#D1FAF5",
    borderWidth: 1,
    borderColor: "rgba(0, 217, 184, 0.18)",
    flexShrink: 0,
  },
  brandTitle: {
    fontFamily: Fonts.bold,
    fontSize: 16,
    lineHeight: 20,
    color: C.primary.darkNavy,
    fontWeight: "700",
  },
  brandSubTitle: {
    marginTop: 1,
    fontFamily: Fonts.regular,
    fontSize: 11,
    lineHeight: 15,
    color: C.neutral.mediumGray,
  },
  headingWrap: {
    paddingHorizontal: 24,
    paddingTop: 4,
    paddingBottom: 20,
  },
  pageTitle: {
    fontFamily: Fonts.bold,
    fontSize: 22,
    lineHeight: 28,
    color: C.primary.darkNavy,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  pageSubTitle: {
    marginTop: 6,
    maxWidth: 300,
    fontFamily: Fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    color: C.neutral.mediumGray,
  },
  cardsWrap: {
    paddingHorizontal: 24,
    gap: 14,
  },
  card: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  cardHeaderTextWrap: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    fontFamily: Fonts.bold,
    fontSize: 16,
    lineHeight: 22,
    color: C.neutral.darkText,
    fontWeight: "700",
  },
  cardSubTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600",
  },
  cardDescription: {
    marginTop: 8,
    fontFamily: Fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    color: C.neutral.mediumGray,
  },
  chipsRow: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipText: {
    fontFamily: Fonts.semiBold,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "600",
  },
  chevronWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
    flexShrink: 0,
  },
  noteRow: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginHorizontal: 24,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.72)",
    borderWidth: 1,
    borderColor: C.neutral.lightGray,
  },
  noteIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#D1FAF5",
    alignItems: "center",
    justifyContent: "center",
  },
  noteText: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: 11,
    lineHeight: 16,
    color: C.neutral.mediumGray,
  },
  footerRow: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  footerText: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: C.neutral.mediumGray,
  },
  signInText: {
    fontFamily: Fonts.bold,
    fontSize: 13,
    lineHeight: 18,
    color: C.primary.teal,
    fontWeight: "700",
  },
  signInHint: {
    marginTop: 6,
    marginBottom: 8,
    fontFamily: Fonts.regular,
    fontSize: 11,
    lineHeight: 16,
    color: C.neutral.mediumGray,
    textAlign: "center",
    paddingHorizontal: 24,
  },
});
