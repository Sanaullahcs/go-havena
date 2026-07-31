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
import NeighborLinkLogo from "../../../components/ui/neighborlink-logo";
import BackButton from "../../../components/ui/back-button";
import { Routes } from "../../../constants/onboarding-routes";
import { setCurrentRole } from "../../../constants/role-session";
import ScreenStatusBar from "../../../components/layout/screen-status-bar";
import { prepareAuthScreenChrome } from "../../../components/layout/chrome-manager";
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
      border: "rgba(92, 225, 230, 0.3)",
      source: require("../../../assets/images/commiunity-admin.svg"),
    },
    {
      key: "resident",
      title: "Resident",
      subTitle: "Homeowner • Tenant",
      description:
        "Join your verified community to access wellness programs, notices, and local marketplace.",
      chips: ["Join Community", "Wellness Programs", "Community Feed"],
      border: "rgba(193, 255, 114, 0.4)",
      source: require("../../../assets/images/resident-icon.svg"),
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
      <View style={styles.topBar}>
        <BackButton onPress={() => {
          prepareAuthScreenChrome();
          router.replace(Routes.LOGIN);
        }} />
      </View>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.brandRow}>
          <View style={styles.logoBox}>
            <NeighborLinkLogo size={44} compact />
          </View>

          <View>
            <Text style={styles.brandTitle}>NeighborLink</Text>
            <Text style={styles.brandSubTitle}>
              Community & Wellness Platform
            </Text>
          </View>
        </View>

        <View style={styles.headingWrap}>
          <Text style={styles.pageTitle}>Join NeighborLink</Text>
          <Text style={styles.pageSubTitle}>
            Select your role to get started with the right experience for you.
          </Text>
        </View>

        <View style={styles.cardsWrap}>
          {roleCards.map((role) => (
            <TouchableOpacity
              key={role.key}
              style={[styles.card, { borderColor: role.border }]}
              activeOpacity={0.85}
              onPress={() => handleRoleSelect(role.key)}
            >
              <View style={styles.cardTopRow}>
                <Image source={role.source} style={{ width: 56, height: 56 }} />

                <View style={styles.cardHeaderTextWrap}>
                  <Text style={styles.cardTitle}>{role.title}</Text>
                  <Text style={styles.cardSubTitle}>{role.subTitle}</Text>
                  <Text style={styles.cardDescription}>{role.description}</Text>

                  <View style={styles.chipsRow}>
                    {role.chips.map((chip) => (
                      <View
                        key={chip}
                        style={[
                          styles.chip,
                          role.key === "admin"
                            ? styles.adminChip
                            : styles.residentChip,
                        ]}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            role.key === "admin"
                              ? styles.adminChipText
                              : styles.residentChipText,
                          ]}
                        >
                          {chip}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>

                <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.noteRow}>
          <Image
            source={require("../../../assets/images/sheild-check.png")}
            style={{ width: 16, height: 16 }}
          />
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
    backgroundColor: "#FFFFFF",
  },
  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 20,
    paddingBottom: 24,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 32,
    paddingTop: 48,
  },
  logoBox: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EFF6FF",
  },
  logoImage: {
    width: 36,
    height: 36,
  },
  brandTitle: {
    fontFamily: Fonts.bold,
    fontSize: 16,
    lineHeight: 20,
    color: "#000000",
    fontWeight: "700",
  },
  brandSubTitle: {
    marginTop: 1,
    fontFamily: Fonts.regular,
    fontSize: 11,
    lineHeight: 15,
    color: "#6A7282",
  },
  headingWrap: {
    padding: 32,
  },
  pageTitle: {
    fontFamily: Fonts.bold,
    fontSize: 20,
    lineHeight: 28,
    color: "#000000",
    fontWeight: "700",
  },
  pageSubTitle: {
    marginTop: 5,
    maxWidth: 290,
    fontFamily: Fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    color: "#6A7282",
  },
  cardsWrap: {
    paddingHorizontal: 24,
    gap: 16,
  },
  topBar: {
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  card: {
    borderWidth: 2,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: "#FFFFFF",
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  cardHeaderTextWrap: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    fontFamily: Fonts.bold,
    fontSize: 16,
    lineHeight: 24,
    color: "rgba(0, 0, 0, 1)",
    fontWeight: "700",
  },
  cardSubTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: 11,
    lineHeight: 15,
    color: "rgba(0, 123, 255, 1)",
    fontWeight: "600",
  },
  cardDescription: {
    marginTop: 8,
    fontFamily: Fonts.medium,
    fontSize: 11,
    lineHeight: 17,
    color: "rgba(106, 114, 130, 1)",
    fontWeight: "500",
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
    paddingVertical: 4,
  },
  adminChip: {
    backgroundColor: "rgba(212, 236, 245, 1)",
  },
  residentChip: {
    backgroundColor: "rgba(193, 255, 114, 0.2)",
  },
  chipText: {
    fontFamily: Fonts.medium,
    fontSize: 9,
    lineHeight: 13,
    fontWeight: "600",
  },
  adminChipText: {
    color: "rgba(0, 123, 255, 1)",
  },
  residentChipText: {
    color: "rgba(1, 102, 48, 1)",
  },
  noteRow: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    width: 290,
  },
  noteText: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: 11,
    lineHeight: 15,
    color: "rgba(106, 114, 130, 1)",
  },
  footerRow: {
    marginTop: 30,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  footerText: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    color: "rgba(74, 85, 101, 1)",
  },
  signInText: {
    fontFamily: Fonts.bold,
    fontSize: 12,
    lineHeight: 18,
    color: "rgba(0, 123, 255, 1)",
    fontWeight: "700",
  },
  signInHint: {
    marginTop: 8,
    marginBottom: 24,
    fontFamily: Fonts.regular,
    fontSize: 11,
    lineHeight: 16,
    color: "rgba(106, 114, 130, 1)",
    textAlign: "center",
    paddingHorizontal: 24,
  },
});
