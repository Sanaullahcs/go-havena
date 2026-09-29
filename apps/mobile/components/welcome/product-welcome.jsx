import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import AuthLogo from "../ui/auth-logo";
import { Fonts } from "../../constants/font";
import { Colors } from "../../constants/tokens";
import { rnShadow } from "../../utils/shadow";
import ScreenStatusBar from "../layout/screen-status-bar";
import { isCommunityAdminRole } from "../../services/community-access";
import { getProfileFields } from "../../utils/profile-display";

const BRAND = ["#163A66", "#1B4F8A", "#2F6FB3"];

const FEATURES = [
  {
    key: "notices",
    icon: "megaphone",
    orbit: ["calendar", "checkmark-circle", "time"],
    tint: "#FFF1D6",
    glow: "#FFE2A8",
    ink: "#B45309",
  },
  {
    key: "community",
    icon: "chatbubbles",
    orbit: ["camera", "heart", "hand-left"],
    tint: "#E3EDF8",
    glow: "#C9DBF0",
    ink: "#1B4F8A",
  },
  {
    key: "services",
    icon: "key",
    orbit: ["water", "barbell", "document-text"],
    tint: "#D5F5F0",
    glow: "#B3EBE2",
    ink: "#0D9488",
  },
  {
    key: "marketplace",
    icon: "storefront",
    orbit: ["pricetag", "cafe", "gift"],
    tint: "#E6E8FF",
    glow: "#D2D6FF",
    ink: "#4338CA",
  },
  {
    key: "wellness",
    icon: "leaf",
    orbit: ["walk", "moon", "sparkles"],
    tint: "#FCE4F1",
    glow: "#F9CBE3",
    ink: "#BE185D",
  },
];

function greetingKey(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return "intro.morning";
  if (hour < 17) return "intro.afternoon";
  return "intro.evening";
}

function tap() {
  Haptics.selectionAsync().catch(() => {});
}

function useFloat(duration = 2600) {
  const value = useState(() => new Animated.Value(0))[0];
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, { toValue: 1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(value, { toValue: 0, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [value, duration]);
  return value;
}

function FeatureArt({ slide, size, index, scrollX, width }) {
  const float = useFloat();
  const range = [(index - 1) * width, index * width, (index + 1) * width];
  const scale = scrollX.interpolate({ inputRange: range, outputRange: [0.7, 1, 0.7], extrapolate: "clamp" });
  const rotate = scrollX.interpolate({ inputRange: range, outputRange: ["-12deg", "0deg", "12deg"], extrapolate: "clamp" });
  const bob = float.interpolate({ inputRange: [0, 1], outputRange: [0, -8] });
  const orbitSize = size * 0.26;
  const positions = [
    { top: size * 0.02, right: size * 0.04 },
    { bottom: size * 0.1, right: -size * 0.02 },
    { bottom: size * 0.16, left: -size * 0.02 },
  ];

  return (
    <Animated.View style={{ width: size, height: size, transform: [{ scale }, { rotate }] }}>
      <View style={[styles.glow, { width: size, height: size, borderRadius: size / 2, backgroundColor: slide.glow }]} />
      <View
        style={[
          styles.ring,
          { width: size * 0.78, height: size * 0.78, borderRadius: size, top: size * 0.11, left: size * 0.11, backgroundColor: slide.tint },
        ]}
      />
      <Animated.View
        style={[
          styles.core,
          {
            width: size * 0.46,
            height: size * 0.46,
            borderRadius: size * 0.15,
            top: size * 0.27,
            left: size * 0.27,
            backgroundColor: slide.ink,
            transform: [{ translateY: bob }],
          },
        ]}
      >
        <Ionicons name={slide.icon} size={size * 0.22} color="#FFFFFF" />
      </Animated.View>
      {slide.orbit.map((name, i) => {
        const drift = float.interpolate({ inputRange: [0, 1], outputRange: [0, i % 2 ? 6 : -6] });
        return (
          <Animated.View
            key={name}
            style={[
              styles.orbit,
              positions[i],
              { width: orbitSize, height: orbitSize, borderRadius: orbitSize * 0.34, transform: [{ translateY: drift }] },
            ]}
          >
            <Ionicons name={name} size={orbitSize * 0.46} color={slide.ink} />
          </Animated.View>
        );
      })}
    </Animated.View>
  );
}

function IntroArt({ size, scrollX, width }) {
  const pulse = useState(() => new Animated.Value(0))[0];
  const float = useFloat(3200);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 2400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const scale = scrollX.interpolate({ inputRange: [0, width], outputRange: [1, 0.7], extrapolate: "clamp" });
  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1.1] });
  const ringFade = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });
  const bob = float.interpolate({ inputRange: [0, 1], outputRange: [0, -6] });
  const radius = size * 0.4;
  const chip = size * 0.2;

  return (
    <Animated.View style={{ width: size, height: size, transform: [{ scale }] }}>
      <Animated.View
        style={[
          styles.pulse,
          { width: size * 0.7, height: size * 0.7, borderRadius: size, top: size * 0.15, left: size * 0.15, opacity: ringFade, transform: [{ scale: ringScale }] },
        ]}
      />
      <Animated.View
        style={[
          styles.introCore,
          { width: size * 0.42, height: size * 0.42, borderRadius: size * 0.14, top: size * 0.29, left: size * 0.29, transform: [{ translateY: bob }] },
        ]}
      >
        <AuthLogo size={size * 0.26} compact />
      </Animated.View>
      {FEATURES.map((it, i) => {
        const rad = ((-90 + i * 72) * Math.PI) / 180;
        return (
          <View
            key={it.key}
            style={[
              styles.orbit,
              {
                width: chip,
                height: chip,
                borderRadius: chip * 0.34,
                backgroundColor: it.tint,
                left: size / 2 + radius * Math.cos(rad) - chip / 2,
                top: size / 2 + radius * Math.sin(rad) - chip / 2,
              },
            ]}
          >
            <Ionicons name={it.icon} size={chip * 0.46} color={it.ink} />
          </View>
        );
      })}
    </Animated.View>
  );
}

export default function ProductWelcome({ onContinue, onCreateAccount, user = null }) {
  const { t } = useTranslation();
  const signedIn = Boolean(user);
  const { displayName, unitNumber, communityName } = getProfileFields(user);
  const place = communityName && communityName !== "My Community" ? communityName : t("intro.yourCommunity");
  const firstName = String(displayName ?? "").trim().split(/\s+/)[0] || t("intro.neighbor");
  const isAdmin = signedIn && isCommunityAdminRole(user);
  const { width, height } = useWindowDimensions();
  const compact = height < 720;
  const artSize = Math.min(width * 0.62, compact ? 210 : 260);

  const listRef = useRef(null);
  const scrollX = useState(() => new Animated.Value(0))[0];
  const enter = useState(() => new Animated.Value(0))[0];
  const [index, setIndex] = useState(0);

  useEffect(() => {
    Animated.timing(enter, { toValue: 1, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [enter]);

  const enterStyle = {
    opacity: enter,
    transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
  };

  const introBody = isAdmin
    ? t("intro.introAdmin", { place })
    : signedIn
      ? t("intro.introResident", { place })
      : t("intro.introGuest");

  const slides = [
    {
      key: "intro",
      intro: true,
      eyebrow: signedIn ? (unitNumber ? `${place} · ${unitNumber}` : place) : t("intro.welcome"),
      title: signedIn ? t(greetingKey(), { name: firstName }) : t("intro.welcomeTitle"),
      body: introBody,
    },
    ...FEATURES.map((f) => ({
      ...f,
      eyebrow: t(`intro.${f.key}Eyebrow`),
      title: t(`intro.${f.key}Title`),
      body: t(`intro.${f.key}Body`),
    })),
  ];
  const last = slides.length - 1;
  const onLast = index === last;
  const finishLabel = signedIn ? t("intro.continueHome") : t("intro.getStarted");

  const goTo = useCallback(
    (next) => {
      listRef.current?.scrollToOffset({ offset: next * width, animated: true });
      setIndex(next);
    },
    [width],
  );

  const handleNext = () => {
    tap();
    if (onLast) {
      onContinue?.();
      return;
    }
    goTo(index + 1);
  };

  const handleSkip = () => {
    tap();
    onContinue?.();
  };

  const onMomentumEnd = (event) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / width);
    if (next !== index) {
      setIndex(next);
      tap();
    }
  };

  const bgColor = scrollX.interpolate({
    inputRange: slides.map((_, i) => i * width),
    outputRange: slides.map((s) => (s.intro ? "#E3EDF8" : s.tint)),
    extrapolate: "clamp",
  });

  const renderSlide = ({ item, index: i }) => {
    const range = [(i - 1) * width, i * width, (i + 1) * width];
    const textShift = scrollX.interpolate({ inputRange: range, outputRange: [width * 0.25, 0, -width * 0.25], extrapolate: "clamp" });
    const textFade = scrollX.interpolate({ inputRange: range, outputRange: [0, 1, 0], extrapolate: "clamp" });

    return (
      <View style={[styles.slide, { width }]}>
        <View style={[styles.artWrap, { height: artSize + 24 }]}>
          {item.intro ? (
            <IntroArt size={artSize} scrollX={scrollX} width={width} />
          ) : (
            <FeatureArt slide={item} size={artSize} index={i} scrollX={scrollX} width={width} />
          )}
        </View>
        <Animated.View style={[styles.copy, { opacity: textFade, transform: [{ translateX: textShift }] }]}>
          <View style={[styles.eyebrowPill, !item.intro && styles.eyebrowPillLight]}>
            {item.intro && signedIn ? <Ionicons name="location" size={13} color={Colors.brandPrimaryDeep} /> : null}
            <Text style={[styles.eyebrow, { color: item.ink ?? Colors.brandPrimaryDeep }]} numberOfLines={1}>
              {item.eyebrow}
            </Text>
          </View>
          <Text style={[styles.title, compact && styles.titleCompact]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.85}>
            {item.title}
          </Text>
          <Text style={[styles.body, compact && styles.bodyCompact]}>{item.body}</Text>
        </Animated.View>
      </View>
    );
  };

  return (
    <>
      <ScreenStatusBar style="dark" opaque androidBackgroundColor="#E3EDF8" />
      <Animated.View style={[styles.fill, { backgroundColor: bgColor }]}>
        <LinearGradient
          colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.85)", "#FFFFFF"]}
          locations={[0, 0.45, 0.75]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <SafeAreaView style={styles.fill} edges={["top", "left", "right", "bottom"]}>
          <Animated.View style={[styles.fill, enterStyle]}>
            <View style={styles.topBar}>
              <View style={styles.brand}>
                <View style={styles.logoPlate}>
                  <AuthLogo size={26} compact />
                </View>
                <Text style={styles.brandName}>Havena</Text>
              </View>
              {!onLast ? (
                <Pressable
                  onPress={handleSkip}
                  accessibilityRole="button"
                  accessibilityLabel={t("intro.skipA11y")}
                  hitSlop={12}
                  style={({ pressed }) => [styles.skip, pressed && styles.pressed]}
                >
                  <Text style={styles.skipText}>{t("intro.skip")}</Text>
                </Pressable>
              ) : (
                <View style={styles.skipSpacer} />
              )}
            </View>

            <Animated.FlatList
              ref={listRef}
              data={slides}
              keyExtractor={(item) => item.key}
              renderItem={renderSlide}
              horizontal
              pagingEnabled
              bounces={false}
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={onMomentumEnd}
              getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
              onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: false })}
              scrollEventThrottle={16}
              style={[styles.fill, styles.ltr]}
            />

            <View style={styles.footer}>
              <View style={[styles.dots, styles.ltr]} accessibilityLabel={t("intro.page", { current: index + 1, total: slides.length })}>
                {slides.map((slide, i) => {
                  const range = [(i - 1) * width, i * width, (i + 1) * width];
                  const dotWidth = scrollX.interpolate({ inputRange: range, outputRange: [8, 24, 8], extrapolate: "clamp" });
                  const dotOpacity = scrollX.interpolate({ inputRange: range, outputRange: [0.35, 1, 0.35], extrapolate: "clamp" });
                  return (
                    <Pressable key={slide.key} onPress={() => { tap(); goTo(i); }} hitSlop={6}>
                      <Animated.View style={[styles.dot, { width: dotWidth, opacity: dotOpacity }]} />
                    </Pressable>
                  );
                })}
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={onLast ? finishLabel : t("intro.next")}
                onPress={handleNext}
                style={({ pressed }) => [styles.ctaShadow, pressed && styles.pressedScale]}
              >
                <LinearGradient colors={BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.cta}>
                  <Text style={styles.ctaLabel}>{onLast ? finishLabel : t("intro.next")}</Text>
                  <Ionicons name={onLast && signedIn ? "home" : "arrow-forward"} size={18} color="#FFFFFF" />
                </LinearGradient>
              </Pressable>

              {!signedIn && onCreateAccount ? (
                <Pressable onPress={onCreateAccount} accessibilityRole="button" hitSlop={8}>
                  <Text style={styles.secondary}>
                    {t("intro.newHere")} <Text style={styles.secondaryLink}>{t("intro.createAccount")}</Text>
                  </Text>
                </Pressable>
              ) : (
                <Text style={styles.stepText}>
                  {index === 0 ? t("intro.swipeHint") : t("intro.step", { current: index, total: FEATURES.length })}
                </Text>
              )}
            </View>
          </Animated.View>
        </SafeAreaView>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  ltr: {
    writingDirection: "ltr",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 4,
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  logoPlate: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    ...rnShadow({ color: "#1B4F8A", offset: { width: 0, height: 2 }, opacity: 0.12, radius: 6, elevation: 2 }),
  },
  brandName: {
    fontFamily: Fonts.semiBold,
    fontSize: 16,
    lineHeight: 22,
    color: Colors.textPrimary,
  },
  skip: {
    paddingHorizontal: 16,
    height: 34,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
  skipSpacer: {
    height: 34,
  },
  skipText: {
    fontFamily: Fonts.semiBold,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.textSecondary,
  },
  slide: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: "center",
  },
  artWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  glow: {
    position: "absolute",
    opacity: 0.55,
  },
  ring: {
    position: "absolute",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.9)",
  },
  core: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    ...rnShadow({ color: "#000", offset: { width: 0, height: 10 }, opacity: 0.18, radius: 18, elevation: 8 }),
  },
  orbit: {
    position: "absolute",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    ...rnShadow({ color: "#0B1C2E", offset: { width: 0, height: 6 }, opacity: 0.1, radius: 12, elevation: 4 }),
  },
  pulse: {
    position: "absolute",
    borderWidth: 2,
    borderColor: "#7FA6D6",
  },
  introCore: {
    position: "absolute",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    ...rnShadow({ color: "#1B4F8A", offset: { width: 0, height: 10 }, opacity: 0.2, radius: 20, elevation: 8 }),
  },
  copy: {
    alignItems: "center",
    gap: 10,
  },
  eyebrowPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: "100%",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
  },
  eyebrowPillLight: {
    backgroundColor: "rgba(255,255,255,0.9)",
  },
  eyebrow: {
    flexShrink: 1,
    fontFamily: Fonts.semiBold,
    fontSize: 13,
    lineHeight: 18,
  },
  title: {
    textAlign: "center",
    fontFamily: Fonts.bold,
    fontSize: 29,
    lineHeight: 38,
    color: Colors.textPrimary,
  },
  titleCompact: {
    fontSize: 25,
    lineHeight: 33,
  },
  body: {
    textAlign: "center",
    fontFamily: Fonts.regular,
    fontSize: 15,
    lineHeight: 24,
    color: Colors.textSecondary,
    maxWidth: 360,
  },
  bodyCompact: {
    fontSize: 14,
    lineHeight: 22,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 14,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    height: 12,
  },
  dot: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.brandPrimaryDeep,
  },
  ctaShadow: {
    borderRadius: 16,
    ...rnShadow({ color: "#1B4F8A", offset: { width: 0, height: 6 }, opacity: 0.28, radius: 12, elevation: 5 }),
  },
  cta: {
    height: 54,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  ctaLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: 16,
    lineHeight: 22,
    color: "#FFFFFF",
  },
  pressed: {
    opacity: 0.7,
  },
  pressedScale: {
    opacity: 0.92,
    transform: [{ scale: 0.98 }],
  },
  stepText: {
    textAlign: "center",
    fontFamily: Fonts.medium,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.textMuted,
  },
  secondary: {
    textAlign: "center",
    fontFamily: Fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.footerMuted,
  },
  secondaryLink: {
    fontFamily: Fonts.semiBold,
    color: Colors.link,
  },
});
