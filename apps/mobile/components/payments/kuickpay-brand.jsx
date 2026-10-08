import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { sf, sw } from "../../utils/responsive";

export const KuickpayColors = {
  brand: "#1468FF",
  brandDark: "#0047CC",
  brandSoft: "#EEF4FF",
  brandBorder: "rgba(20, 104, 255, 0.22)",
  ink: "#0F172A",
  muted: "#64748B",
  line: "#E2E8F0",
};

const METHODS = [
  { id: "easypaisa", short: "ep", color: "#12B347" },
  { id: "jazzcash", short: "JC", color: "#D71F26" },
  { id: "card", icon: "credit-card-outline", color: "#1E3A8A" },
  { id: "bank", icon: "bank-outline", color: "#0F766E" },
  { id: "raast", short: "R", color: "#6D28D9" },
];

const KUICKPAY_LOGO = require("../../assets/billers/kuickpay.png");

export function KuickpayMark({ size = 28 }) {
  return (
    <View
      accessibilityLabel="KuickPay"
      style={{
        width: sw(size),
        height: sw(size),
        borderRadius: sw(size * 0.3),
        backgroundColor: "#FFFFFF",
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: KuickpayColors.brandBorder,
        alignItems: "center",
        justifyContent: "center",
        padding: sw(size * 0.12),
      }}
    >
      <Image source={KUICKPAY_LOGO} style={{ width: "100%", height: "100%" }} contentFit="contain" transition={0} />
    </View>
  );
}

/** Wallets and rails residents can use on the KuickPay page. Purely informative. */
export function KuickpayMethodsStrip({ compact = false }) {
  const { t } = useTranslation();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: sw(compact ? 6 : 8) }}>
      {METHODS.map((method) => (
        <View
          key={method.id}
          accessibilityLabel={t(`payments.methods.${method.id}`)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: sw(6),
            paddingHorizontal: sw(compact ? 8 : 10),
            paddingVertical: sw(compact ? 4 : 6),
            borderRadius: 999,
            borderWidth: 1,
            borderColor: KuickpayColors.line,
            backgroundColor: "#FFFFFF",
          }}
        >
          <View
            style={{
              width: sw(compact ? 16 : 18),
              height: sw(compact ? 16 : 18),
              borderRadius: sw(5),
              backgroundColor: method.color,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {method.icon ? (
              <MaterialCommunityIcons name={method.icon} size={sf(compact ? 11 : 12)} color="#FFFFFF" />
            ) : (
              <Text style={{ color: "#FFFFFF", fontFamily: Fonts.bold, fontSize: sf(compact ? 7 : 8), includeFontPadding: false }}>
                {method.short}
              </Text>
            )}
          </View>
          <Text style={{ fontFamily: Fonts.medium, fontSize: sf(compact ? 11 : 12), color: KuickpayColors.ink }}>
            {t(`payments.methods.${method.id}`)}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function KuickpaySecureNote() {
  const { t } = useTranslation();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: sw(8) }}>
      <Feather name="lock" size={sf(14)} color="#047857" style={{ marginTop: sw(2) }} />
      <Text style={{ flex: 1, fontFamily: Fonts.regular, fontSize: sf(12), lineHeight: sf(18), color: KuickpayColors.muted }}>
        {t("payments.secureNote")}
      </Text>
    </View>
  );
}

export function TestModeBadge() {
  const { t } = useTranslation();
  return (
    <View
      style={{
        alignSelf: "flex-start",
        flexDirection: "row",
        alignItems: "center",
        gap: sw(6),
        paddingHorizontal: sw(10),
        paddingVertical: sw(4),
        borderRadius: 999,
        backgroundColor: "#FFFBEB",
        borderWidth: 1,
        borderColor: "#FDE68A",
      }}
    >
      <Feather name="alert-triangle" size={sf(11)} color="#B45309" />
      <Text style={{ fontFamily: Fonts.semiBold, fontSize: sf(11), color: "#B45309" }}>{t("payments.testMode")}</Text>
    </View>
  );
}
