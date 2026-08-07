import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../../constants/font";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { ShieldCheck, Ticket } from "lucide-react-native";
import { ionChevronForward } from "../../../utils/rtl";
import HavenaLogo from "../../../components/ui/havena-logo";
import BackButton from "../../../components/ui/back-button";
import { Routes } from "../../../constants/onboarding-routes";
import { setCurrentRole } from "../../../constants/role-session";
import ScreenStatusBar from "../../../components/layout/screen-status-bar";
import { prepareAuthScreenChrome } from "../../../components/layout/chrome-manager";
import { HomeTheme as T } from "../../../constants/home-theme";
import { ScreenBrand as B } from "../../../constants/screen-brand";
import RoleIcon from "../../../components/ui/role-icon";

const CARD_ACCENT = {
  accent: T.navy,
  iconBg: T.mint,
  iconColor: T.teal,
  border: "rgba(15, 61, 95, 0.12)",
};

const getRoleCards = (t) => [
  {
    key: "admin",
    title: t("roles.communityAdmin"),
    subTitle: t("roles.adminSubtitle"),
    description: t("roles.adminDescription"),
    chips: [t("roles.adminChip1"), t("roles.adminChip2"), t("roles.adminChip3")],
    ...CARD_ACCENT,
  },
  {
    key: "resident",
    title: t("roles.resident"),
    subTitle: t("roles.residentSubtitle"),
    description: t("roles.residentDescription"),
    chips: [t("roles.residentChip1"), t("roles.residentChip2"), t("roles.residentChip3")],
    ...CARD_ACCENT,
  },
  {
    key: "guest",
    title: t("roles.guest"),
    subTitle: t("roles.guestSubtitle"),
    description: t("roles.guestDescription"),
    chips: [t("roles.guestChip1"), t("roles.guestChip2"), t("roles.guestChip3")],
    ...CARD_ACCENT,
  },
];

export default function Roles() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const ROLE_CARDS = getRoleCards(t);

  const goLogin = () => {
    prepareAuthScreenChrome();
    router.replace(Routes.LOGIN);
  };

  const handleRoleSelect = (role) => {
    if (role === "guest") {
      router.push("/screens/guest-login");
      return;
    }
    setCurrentRole(role);
    router.push({ pathname: "/screens/signup", params: { role } });
  };

  return (
    <>
      <ScreenStatusBar style="dark" opaque androidBackgroundColor={T.canvas} />
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <View style={styles.headerRow}>
          <BackButton onPress={goLogin} />
        </View>

        <View style={styles.body}>
          <View style={styles.hero}>
            <HavenaLogo size={40} compact tileColor={T.navy} />
            <Text style={styles.pageTitle}>{t("roles.joinHavena")}</Text>
            <Text style={styles.pageSubTitle}>
              {t("roles.chooseRole")}
            </Text>
          </View>

          <ScrollView
            style={styles.cardsScroll}
            contentContainerStyle={styles.cardsScrollContent}
            showsVerticalScrollIndicator={false}
            bounces
          >
            {ROLE_CARDS.map((role) => (
              <TouchableOpacity
                key={role.key}
                style={[styles.card, { borderColor: role.border }]}
                activeOpacity={0.88}
                onPress={() => handleRoleSelect(role.key)}
              >
                <View style={[styles.iconWell, { backgroundColor: role.iconBg }]}>
                  {role.key === "guest" ? (
                    <Ticket size={16} color={role.iconColor} strokeWidth={1.75} />
                  ) : (
                    <RoleIcon role={role.key} size="md" bare color={role.iconColor} />
                  )}
                </View>

                <View style={styles.cardCopy}>
                  <Text style={styles.cardTitle}>{role.title}</Text>
                  <Text style={[styles.cardSubTitle, { color: role.accent }]}>
                    {role.subTitle}
                  </Text>
                  <Text style={styles.cardDescription}>{role.description}</Text>
                  <View style={styles.chipsRow}>
                    {role.chips.map((chip) => (
                      <View
                        key={chip}
                        style={[styles.chip, { backgroundColor: role.iconBg }]}
                      >
                        <Text style={[styles.chipText, { color: role.accent }]}>
                          {chip}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>

                <View style={[styles.chevronWrap, { backgroundColor: role.iconBg }]}>
                  <Ionicons name={ionChevronForward()} size={16} color={role.accent} />
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={[styles.bottomBlock, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <View style={styles.trustCard}>
              <View style={styles.trustIconWrap}>
                <ShieldCheck size={16} color={T.deepTeal} strokeWidth={2} />
              </View>
              <Text style={styles.trustText}>
                {t("roles.verifiedPhonesTrust")}
              </Text>
            </View>

            <View style={styles.footerRow}>
              <Text style={styles.footerText}>{t("roles.alreadyHaveAccount") + " "}</Text>
              <TouchableOpacity onPress={goLogin} hitSlop={8}>
                <Text style={styles.signInText}>{t("roles.signIn")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: T.canvas,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 0,
    paddingBottom: 4,
  },
  body: {
    flex: 1,
    paddingHorizontal: 24,
  },
  hero: {
    alignItems: "center",
    paddingBottom: 12,
    gap: 4,
  },
  pageTitle: {
    marginTop: 4,
    fontFamily: Fonts.bold,
    fontSize: 22,
    lineHeight: 28,
    color: T.navy,
    fontWeight: "700",
    letterSpacing: -0.3,
    textAlign: "center",
  },
  pageSubTitle: {
    maxWidth: 280,
    fontFamily: Fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    color: T.gray,
    textAlign: "center",
  },
  cardsScroll: {
    flex: 1,
  },
  cardsScrollContent: {
    gap: 10,
    paddingBottom: 8,
  },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: T.white,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  iconWell: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  cardCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  cardTitle: {
    fontFamily: Fonts.bold,
    fontSize: 14,
    lineHeight: 20,
    color: T.navy,
    fontWeight: "700",
  },
  cardSubTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600",
  },
  cardDescription: {
    marginTop: 2,
    fontFamily: Fonts.regular,
    fontSize: 11,
    lineHeight: 16,
    color: T.gray,
  },
  chipsRow: {
    marginTop: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  chipText: {
    fontFamily: Fonts.semiBold,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "600",
  },
  chevronWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 8,
  },
  bottomBlock: {
    gap: 12,
    paddingTop: 8,
  },
  trustCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: T.white,
    borderWidth: 1,
    borderColor: T.border,
  },
  trustIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: T.mint,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  trustText: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: 11,
    lineHeight: 16,
    color: T.gray,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  footerText: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: T.gray,
  },
  signInText: {
    fontFamily: Fonts.bold,
    fontSize: 13,
    lineHeight: 18,
    color: B.link,
    fontWeight: "700",
  },
});
