import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { Home } from "../../constants/home-styles";
import { sw, sf, hp } from "../../utils/responsive";

const STEPS = [
  { id: "feed", label: "Explore the feed", route: "/screens/community-feed" },
  { id: "wellness", label: "Browse wellness", route: "/wellness" },
  { id: "profile", label: "Complete profile", route: "/screens/profile" },
];

export default function FirstTimeBanner({ onDismiss }) {
  const router = useRouter();

  return (
    <View style={styles.wrap}>
      <LinearGradient
        colors={["#E9F6FF", "#FFFFFF", "#ECFDF5"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Welcome to NeighborLink!</Text>
            <Text style={styles.sub}>
              Your community hub is ready. Here&apos;s how to get started.
            </Text>
          </View>
          <Pressable onPress={onDismiss} hitSlop={12} accessibilityLabel="Dismiss">
            <Ionicons name="close" size={sf(20)} color="#6A7282" />
          </Pressable>
        </View>

        <View style={styles.steps}>
          {STEPS.map((step) => (
            <Pressable
              key={step.id}
              style={styles.step}
              onPress={() => router.push(step.route)}
            >
              <Text style={styles.stepText}>{step.label}</Text>
              <Ionicons name="chevron-forward" size={sf(16)} color="#007BFF" />
            </Pressable>
          ))}
        </View>

        <Pressable style={styles.cta} onPress={onDismiss}>
          <Text style={styles.ctaText}>Got it -- explore home</Text>
        </Pressable>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: Home.gutter,
    paddingTop: hp(1),
    paddingBottom: hp(0.5),
  },
  card: {
    borderRadius: sw(16),
    borderWidth: 1,
    borderColor: "#BFDBFE",
    padding: sw(16),
  },
  head: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(8),
    marginBottom: hp(1.2),
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: sf(16),
    lineHeight: sf(22),
    color: "#101828",
    fontWeight: "700",
  },
  sub: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(18),
    color: "#6A7282",
    marginTop: hp(0.5),
  },
  steps: { gap: hp(0.7), marginBottom: hp(1.2) },
  step: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255,255,255,0.85)",
    borderRadius: sw(12),
    paddingHorizontal: sw(14),
    paddingVertical: hp(1.2),
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  stepText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    color: "#364153",
  },
  cta: {
    alignSelf: "center",
    paddingVertical: hp(0.8),
  },
  ctaText: {
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    color: "#007BFF",
  },
});
