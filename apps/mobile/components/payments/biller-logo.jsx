import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Fonts } from "../../constants/font";
import { sf, sw } from "../../utils/responsive";
import { billerInitials, utilityCategory } from "./utility-meta";

/** Official marks from each provider's own website, keyed by KuickPay mnemonic. */
const BILLER_LOGOS = {
  KE: require("../../assets/billers/ke.png"),
  LESCO: require("../../assets/billers/lesco.png"),
  IESCO: require("../../assets/billers/iesco.png"),
  FESCO: require("../../assets/billers/fesco.png"),
  GEPCO: require("../../assets/billers/gepco.png"),
  MEPCO: require("../../assets/billers/mepco.png"),
  PESCO: require("../../assets/billers/pesco.png"),
  HESCO: require("../../assets/billers/hesco.png"),
  QESCO: require("../../assets/billers/qesco.png"),
  SNGPL: require("../../assets/billers/sngpl.png"),
  SSGC: require("../../assets/billers/ssgc.png"),
  KWSC: require("../../assets/billers/kwsc.png"),
  LWASA: require("../../assets/billers/lwasa.png"),
  PTCL: require("../../assets/billers/ptcl.png"),
  NAYATEL: require("../../assets/billers/nayatel.png"),
  STORMFIBER: require("../../assets/billers/stormfiber.png"),
};

export function billerLogoSource(biller) {
  const key = String(biller?.mnemonic ?? "").toUpperCase();
  return BILLER_LOGOS[key] ?? null;
}

/**
 * Provider logo tile. Falls back to brand-coloured initials for billers whose
 * official mark is not bundled yet.
 */
export default function BillerLogo({ biller, serviceType, size = 42 }) {
  const source = billerLogoSource(biller);
  const box = { width: sw(size), height: sw(size), borderRadius: sw(size * 0.3) };

  if (source) {
    // Percentage padding resolves against the parent's width, which hid the logo in wide rows.
    const inner = sw(size * 0.76);
    return (
      <View style={[styles.logoTile, box]}>
        <Image
          source={source}
          style={{ width: inner, height: inner }}
          contentFit="contain"
          cachePolicy="memory-disk"
          transition={0}
          accessibilityIgnoresInvertColors
        />
      </View>
    );
  }

  const color = biller?.brand_color || utilityCategory(serviceType ?? biller?.service_type).color;
  return (
    <View style={[styles.initialsTile, box, { backgroundColor: color }]}>
      <Text style={[styles.initials, { fontSize: sf(size * 0.31) }]} numberOfLines={1} adjustsFontSizeToFit>
        {billerInitials(biller)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  logoTile: {
    backgroundColor: "#FFFFFF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  initialsTile: { alignItems: "center", justifyContent: "center", paddingHorizontal: sw(4) },
  initials: { fontFamily: Fonts.bold, color: "#FFFFFF", letterSpacing: 0.3, includeFontPadding: false },
});
