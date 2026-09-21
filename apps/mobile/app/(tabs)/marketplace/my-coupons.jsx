import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { MarketplaceType } from "../../../constants/marketplace-type";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { Image } from "expo-image";
import { Fonts } from "../../../constants/font";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import {
  MarketplaceRoutes,
  redeemCouponParams,
  withMarketplaceRole,
} from "../../../constants/marketplace-routes";
import { MarketplaceTheme } from "../../../constants/marketplace-theme";
import { MARKETPLACE_FEATURES } from "../../../constants/marketplace-features";

export default function MyCoupons() {
  const { t } = useTranslation();
  const router = useRouter();
  const activeRole = "resident";

  useEffect(() => {
    if (!MARKETPLACE_FEATURES.coupons) {
      router.replace(MarketplaceRoutes.HOME);
    }
  }, [router]);

  if (!MARKETPLACE_FEATURES.coupons) {
    return null;
  }

  const goToRedeem = (coupon) => {
    router.push({
      pathname: MarketplaceRoutes.REDEEM_COUPON,
      params: redeemCouponParams(coupon, activeRole),
    });
  };

  const activeCoupons = [
    {
      id: 1,
      title: t("deals.seedFreeTrialTitle"),
      vendor: "Zenith Fitness",
      validText: t("deals.couponValidUntil", { date: "Feb 28, 2026" }),
      tag: t("deals.seedFreeTrialTag"),
      image: require("../../../assets/images/free-trial.svg"),
    },
    {
      id: 2,
      title: t("deals.seedMassageTitle"),
      vendor: "Serenity Spa",
      validText: t("deals.couponValidUntil", { date: "Feb 25, 2026" }),
      tag: t("deals.seedMassageTag"),
      image: require("../../../assets/images/message-image.svg"),
    },
  ];

  const usedCoupons = [
    {
      id: 3,
      title: t("deals.seedBurgerTitle"),
      vendor: "Joe's Burger Bar",
      validText: t("deals.usedOn", { date: "Feb 10, 2026" }),
      tag: t("deals.seedBurgerTag"),
      image: require("../../../assets/images/use-coupons.svg"),
    },
  ];

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <InternalScreenHeader title={t("deals.myCoupons")} subtitle={t("deals.activeOffersCount", { count: 2 })} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={styles.sectionTitle}>{t("deals.activeCoupons")}</Text>

        <View style={styles.sectionList}>
          {activeCoupons.map((coupon) => (
            <TouchableOpacity
              key={coupon.id}
              activeOpacity={0.85}
              style={styles.couponCard}
              onPress={() => goToRedeem(coupon)}
            >
              <Image
                source={coupon.image}
                style={styles.couponImage}
                contentFit="cover"
              />

              <View style={styles.cardContent}>
                <View style={styles.rowSpaceBetween}>
                  <Text style={styles.cardTitle}>{coupon.title}</Text>

                  <View style={styles.activeBadge}>
                   <Image
                      source={require("../../../assets/images/active-coupon.png")}
                      style={{ width: 12, height: 12 }}
                    />
                    <Text style={styles.activeBadgeText}>{t("deals.active")}</Text>
                  </View>
                </View>

                <Text style={styles.vendorText}>{coupon.vendor}</Text>

                <View style={styles.rowSpaceBetween}>
                  <View style={styles.validRow}>
                    <Image
                      source={require("../../../assets/images/clock-icon-icon.svg")}
                      style={{ width: 12, height: 12 }}
                    />
                    <Text style={styles.validText}>{coupon.validText}</Text>
                  </View>

                  <View style={styles.greenTag}>
                    <Text style={styles.greenTagText}>{coupon.tag}</Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionTitleUsed}>{t("deals.usedCoupons")}</Text>

        <View style={styles.sectionList}>
          {usedCoupons.map((coupon) => (
            <View key={coupon.id} style={[styles.couponCard, styles.usedCard]}>
              <Image
                source={coupon.image}
                style={[styles.couponImage, { borderBottomLeftRadius: 14 , opacity: 0.6}]}
                contentFit="cover"
              />

              <View style={styles.cardContent}>
                <View style={styles.rowSpaceBetween}>
                  <Text style={[styles.cardTitle, styles.usedText]}>
                    {coupon.title}
                  </Text>
                  <View style={styles.usedBadge}>
                    <Text style={styles.usedBadgeText}>{t("deals.used")}</Text>
                  </View>
                </View>

                <Text style={[styles.vendorText, styles.usedSubtle]}>
                  {coupon.vendor}
                </Text>

                <View style={[styles.rowSpaceBetween, { marginTop: 8 }]}>
                  <Text style={[styles.validText, styles.usedSubtle]}>
                    {coupon.validText}
                  </Text>
                  <View style={[styles.greenTag, styles.usedTag]}>
                    <Text style={styles.greenTagText}>{coupon.tag}</Text>
                  </View>
                </View>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: MarketplaceTheme.screenBg,
  },
  header: {
    paddingTop: 12,
    paddingBottom: 22,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderColor: "#E5E7EB",
    flexDirection: "column",
    gap: 16,
  },
  backButton: {
    width: 24,
    height: 24,
    justifyContent: "center",
  },
  backIcon: {
    width: 24,
    height: 24,
  },
  titleWrap: {
    gap: 2,
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.title,
    lineHeight: 23,
    color: "#0B0F14",
    fontWeight: "700",
  },
  subtitle: {
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.bodyMd,
    lineHeight: MarketplaceType.headingLine,
    color: "#64748B",
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 20,
  },
  sectionTitle: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.title,
    lineHeight: MarketplaceType.titleLine,
    color: "#000000",
    fontWeight: "700",
    marginBottom: 16,
  },
  sectionTitleUsed: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.title,
    lineHeight: MarketplaceType.titleLine,
    color: "#0B0F14",
    fontWeight: "700",
    marginTop: 24,
    marginBottom: 14,
  },
  sectionList: {
    gap: 12,
  },
  couponCard: {
    borderWidth: 2,
    borderColor: "#F3F4F6",
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "flex-start",
  },
  couponImage: {
    width: 96,
    height: 96,
    borderTopLeftRadius: 14,
  },
  cardContent: {
    flex: 1,
    padding: 12,
  },
  rowSpaceBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.body,
    lineHeight: MarketplaceType.headingLine,
    color: "#000000",
    fontWeight: "700",
  },
  vendorText: {
    fontFamily: Fonts.medium,
    fontSize: MarketplaceType.caption,
    lineHeight: MarketplaceType.captionLine,
    color: "#4A5565",
    fontWeight: "500",
    marginTop: 4,
  },
  activeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#DCFCE7",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  activeBadgeText: {
    fontFamily: Fonts.medium,
    fontSize: MarketplaceType.caption,
    lineHeight: MarketplaceType.captionLine,
    color: "#008236",
    fontWeight: "500",
  },
  validRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flex: 1,
  },
  validText: {
    fontFamily: Fonts.medium,
    fontSize: MarketplaceType.caption,
    lineHeight: MarketplaceType.captionLine,
    color: "#6A7282",
    flexShrink: 1,
    fontWeight: "500",
  },
  greenTag: {
    backgroundColor: "#14B77A",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  greenTagText: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.caption,
    lineHeight: MarketplaceType.captionLine,
    color: "#FFFFFF",
    fontWeight: "700",
  },
  usedCard: {
    backgroundColor: "#FCFCFD",
    borderColor: "#EEF1F5",
  },
  usedText: {
    color: "#6B7280",
  },
  usedSubtle: {
    color: "#94A3B8",
  },
  usedBadge: {
    backgroundColor: "#F3F4F6",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  usedBadgeText: {
    fontFamily: Fonts.medium,
    fontSize: MarketplaceType.body,
    lineHeight: MarketplaceType.bodyMdLine,
    color: "#9CA3AF",
    fontWeight: "500",
  },
  usedTag: {
    backgroundColor: "#67CDB2",
  },
});
