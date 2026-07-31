import React, { useEffect, useRef } from "react";
import { View, Text, Modal, StyleSheet, Animated } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";

/**
 * Premium success moment after OTP / biometric auth — brief, then onComplete.
 */
export default function AuthSuccessOverlay({
  visible,
  title = "You're in!",
  subtitle = "Welcome back to NeighborLink",
  onComplete,
  delayMs = 1400,
}) {
  const scale = useRef(new Animated.Value(0.6)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; });

  useEffect(() => {
    if (!visible) return undefined;

    scale.setValue(0.6);
    fade.setValue(0);

    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 6, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 280, useNativeDriver: true }),
    ]).start();

    const timer = setTimeout(() => onCompleteRef.current?.(), delayMs);
    return () => clearTimeout(timer);
  }, [visible, delayMs, scale, fade]);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <LinearGradient
        colors={["#0052DF", "#0179FF"]}
        style={styles.backdrop}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Animated.View style={[styles.card, { opacity: fade, transform: [{ scale }] }]}>
          <View style={styles.iconRing}>
            <Ionicons name="checkmark-circle" size={72} color="#10B981" />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </Animated.View>
      </LinearGradient>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  card: {
    alignItems: "center",
    width: "100%",
    maxWidth: 320,
  },
  iconRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "rgba(255,255,255,0.95)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
  },
  subtitle: {
    marginTop: 8,
    fontFamily: Fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    color: "rgba(255,255,255,0.88)",
    textAlign: "center",
  },
});
