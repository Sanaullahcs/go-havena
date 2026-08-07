import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { MarketplaceType } from "../../../constants/marketplace-type";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Image } from "expo-image";
import { Fonts } from "../../../constants/font";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import { MarketplaceRoutes } from "../../../constants/marketplace-routes";
import { MARKETPLACE_FEATURES } from "../../../constants/marketplace-features";

function formatCouponTitle(rawTitle, t) {
  if (!rawTitle) {
    return { primary: t("deals.couponFallback"), secondary: t("deals.offerFallback") };
  }

  const normalized = String(rawTitle).trim();
  const lower = normalized.toLowerCase();
  const offIndex = lower.indexOf(" off ");

  if (offIndex > -1) {
    const before = normalized.slice(0, offIndex).trim();
    const after = normalized.slice(offIndex + 5).trim();

    return {
      primary: `${before.toUpperCase()} OFF`,
      secondary: after
        .split(" ")
        .map((word) =>
          word
            ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
            : "",
        )
        .join(" "),
    };
  }

  return {
    primary: normalized.toUpperCase(),
    secondary: "",
  };
}

export default function RedeemCoupon() {
  const { t } = useTranslation();
  const router = useRouter();
  const { title = "", vendor = "" } = useLocalSearchParams();
  const { primary, secondary } = formatCouponTitle(title, t);

  useEffect(() => {
    if (!MARKETPLACE_FEATURES.coupons) {
      router.replace(MarketplaceRoutes.HOME);
    }
  }, [router]);

  if (!MARKETPLACE_FEATURES.coupons) {
    return null;
  }

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <InternalScreenHeader
        title={t("deals.redeemCoupon")}
        subtitle={t("deals.confirmToActivate")}
      />

      <View style={styles.contentWrap}>
        <View
          style={styles.ticketCard}
        >
          <View style={styles.ticketNotchLeft} />
          <View style={styles.ticketNotchRight} />

          <Text style={styles.couponPrimary}>{primary}</Text>
          {secondary ? (
            <Text style={styles.couponSecondary}>{secondary}</Text>
          ) : null}

          <View style={styles.cardDivider} />

          <Text style={styles.vendorText}>{vendor || t("deals.partnerStore")}</Text>
        </View>

        <View style={styles.infoWrap}>
          <Text style={styles.readyTitle}>{t("deals.readyToRedeem")}</Text>
          <Text style={styles.readySubTitle}>
            {t("deals.readyToRedeemMsg")}
          </Text>
        </View>

        <View style={styles.buttonsWrap}>
          <TouchableOpacity
            style={styles.confirmBtn}
            activeOpacity={0.85}
            onPress={() =>
              router.push({
                pathname: MarketplaceRoutes.CONFIRM_REDEEM,
                params: { title, vendor },
              })
            }
          >
            <Text style={styles.confirmBtnText}>{t("deals.confirmRedemption")}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelBtn}
            activeOpacity={0.85}
            onPress={() => router.back()}
          >
            <Text style={styles.cancelBtnText}>{t("common.cancel")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  header: {
    paddingTop: 12,
    paddingBottom: 14,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    flexDirection: "column",
    gap: 14,
    borderColor: "#F3F4F6",
    backgroundColor: "#FFFFFF",
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
    fontSize: MarketplaceType.bodyMd,
    lineHeight: MarketplaceType.bodyMdLine,
    color: "#0F172A",
    fontWeight: "700",
  },
  subtitle: {
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.bodyMd,
    lineHeight: MarketplaceType.bodyMdLine,
    color: "#6B7280",
    flexShrink: 1,
  },
  contentWrap: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 20,
  },
  ticketCard: {
    position: "relative",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#FEE685",
    padding: 26,
    alignItems: "center",
  },
  ticketNotchLeft: {
    position: "absolute",
    start: -10,
    top: "50%",
    marginTop: -9,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#F3F4F6",
  },
  ticketNotchRight: {
    position: "absolute",
    end: -10,
    top: "50%",
    marginTop: -9,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#F3F4F6",
  },
  couponPrimary: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.hero,
    lineHeight: 40,
    color: "#7B3306",
    fontWeight: "700",
    textAlign: "center",
  },
  couponSecondary: {
    marginTop: 2,
    fontFamily: Fonts.medium,
    fontSize: MarketplaceType.body,
    lineHeight: MarketplaceType.headingLine,
    color: "#BB4D00",
    fontWeight: "500",
  },
  cardDivider: {
    marginTop: 12,
    marginBottom: 9,
    width: "100%",
    height: 1.5,
    backgroundColor: "#EAC845",
  },
  vendorText: {
    fontFamily: Fonts.medium,
    fontSize: MarketplaceType.caption,
    lineHeight: MarketplaceType.captionLine,
    color: "#E17100",
    fontWeight: "500",
  },
  infoWrap: {
    marginTop: 32,
    alignItems: "center",
    paddingHorizontal: 10,
  },
  readyTitle: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.title,
    lineHeight: MarketplaceType.titleLine,
    color: "#000000",
    fontWeight: "700",
  },
  readySubTitle: {
    marginTop: 8,
    textAlign: "center",
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.body,
    lineHeight: MarketplaceType.bodyMdLine,
    color: "#4A5565",
    fontWeight: "400",
  },
  buttonsWrap: {
    marginTop: 22,
    gap: 12,
  },
  confirmBtn: {
    backgroundColor: "#0A2A43",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  confirmBtnText: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.heading,
    lineHeight: MarketplaceType.stat,
    color: "#FFFFFF",
    fontWeight: "700",
  },
  cancelBtn: {
    backgroundColor: "#F3F4F6",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.heading,
    lineHeight: MarketplaceType.stat,
    color: "#000000",
    fontWeight: "700",
  },
});
