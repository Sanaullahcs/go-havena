import React, { useEffect } from "react";
import { MarketplaceType } from "../../../constants/marketplace-type";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Fonts } from "../../../constants/font";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";

import { MarketplaceRoutes } from "../../../constants/marketplace-routes";
import { MARKETPLACE_FEATURES } from "../../../constants/marketplace-features";
import SafeTop from "../../../components/layout/safe-top";

export default function ConfirmRedeem() {
  const router = useRouter();

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
      <SafeTop color="#FFFFFF">
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => router.back()}
        >
          <Ionicons name="close" size={26} color="#111827" />
        </TouchableOpacity>
      </View>
      </SafeTop>

      <View style={styles.contentWrap}>
        <View style={styles.iconOuterCircle}>
          <View>
            <Image
              source={require("../../../assets/images/redeem-confirm.svg")}
              style={{ width: 96, height: 96 }}
            />
          </View>
        </View>

        <Text style={styles.title}>Coupon Redeemed!</Text>
        <Text style={styles.subtitle}>
          Show this screen to the staff to confirm your redemption
        </Text>

        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>Redemption Code</Text>
          <Text style={styles.codeText}>BURGER20</Text>
        </View>

        <View style={styles.buttonsWrap}>
          <TouchableOpacity
            style={styles.primaryButton}
            activeOpacity={0.85}
            onPress={() => router.push(MarketplaceRoutes.MY_COUPONS)}
          >
            <Text style={styles.primaryButtonText}>View My Coupons</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            activeOpacity={0.85}
            onPress={() => router.back()}
          >
            <Text style={styles.secondaryButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  header: {
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  closeButton: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  contentWrap: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 74,
  },
  iconOuterCircle: {
    width: 94,
    height: 94,
    borderRadius: 47,
    backgroundColor: "#D7F3E8",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },

  title: {
    marginTop: 24,
    textAlign: "center",
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.stat,
    lineHeight: 32,
    color: "#000000",
    fontWeight: "700",
  },
  subtitle: {
    marginTop: 12,
    textAlign: "center",
    alignSelf: "center",
    maxWidth: 252,
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.body,
    lineHeight: MarketplaceType.bodyMdLine,
    color: "#4A5565",
  },
  codeCard: {
    marginTop: 32,
    borderWidth: 2,
    borderColor: "#0A2A43",
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    padding: 26,
  },
  codeLabel: {
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.body,
    lineHeight: MarketplaceType.headingLine,
    color: "#4A5565",
  },
  codeText: {
    marginTop: 8,
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.hero,
    lineHeight: MarketplaceType.heroLine,
    letterSpacing: 2,
    color: "#000000",
    fontWeight: "700",
  },
  buttonsWrap: {
    marginTop: 28,
    gap: 12,
  },
  primaryButton: {
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
  primaryButtonText: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.heading,
    lineHeight: MarketplaceType.stat,
    color: "#FFFFFF",
    fontWeight: "700",
  },
  secondaryButton: {
    backgroundColor: "#F3F4F6",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.heading,
    lineHeight: MarketplaceType.stat,
    color: "#000000",
    fontWeight: "700",
  },
});
