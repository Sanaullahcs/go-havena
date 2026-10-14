import { Text, View, StyleSheet, Pressable, FlatList, Platform } from "react-native";
import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { Home, homeStyles } from "../../constants/home-styles";
import { HomeTheme as T } from "../../constants/home-theme";
import HomeSectionHeader from "./section-header";
import HomeSectionEmpty from "./home-section-empty";
import { wellnessDetailRouteParams } from "../../constants/wellness-categories";
import { twoUpCardWidth, snapInterval } from "../../constants/carousel";
import { sw, sf } from "../../utils/responsive";
import { useHomeFrame } from "../../hooks/use-home-frame";
import { useSessionUser } from "../../hooks/use-session-user";
import { isHomeSectionEnabled } from "../../constants/resident-features";
import { arrowForward } from "../../utils/rtl";
import { rnShadow } from "../../utils/shadow";
import {
  getWellnessVisual,
  SneakerIcon,
  WellnessHeroWave,
} from "../../constants/wellness-visuals";
import WellnessCoverImage from "../wellness/wellness-cover-image";

const CARD_GAP = sw(10);
const PEEK = sw(16);
const RADIUS = sw(18);
const HERO_HEIGHT = sw(112);
const WAVE_HEIGHT = sw(32);
const ICON_BADGE = sw(32);

function WellnessCard({ item, width, onPress }) {
  const { t } = useTranslation();
  const visual = getWellnessVisual(item.iconKey ?? item.key, item.imageUrl);
  const Icon = visual.Icon;
  const progress = Math.min(100, Math.max(0, item.progressPercent ?? 0));
  const iconIsSneaker = Icon === SneakerIcon;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { width },
        pressed && styles.cardPressed,
      ]}
    >
      <View style={styles.cardInner}>
        <View style={[styles.hero, { width }]} collapsable={false}>
          <WellnessCoverImage
            source={item.imageUrl || visual.image}
            fallback={visual.fallbackImage}
            style={[styles.heroImage, { width, height: HERO_HEIGHT }]}
            resizeMode="cover"
          />
          <WellnessHeroWave width={width} blobColor={visual.blob} height={WAVE_HEIGHT} />
          <View style={styles.iconBadge}>
            {iconIsSneaker ? (
              <SneakerIcon color={visual.accent} size={sf(16)} />
            ) : (
              <Icon size={sf(16)} color={visual.accent} strokeWidth={2} />
            )}
          </View>
        </View>

        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {item.coursesLabel || item.subtitle}
          </Text>

          <View style={styles.progressWrap}>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${progress}%`, backgroundColor: visual.accent },
                ]}
              />
            </View>
            <Text style={[styles.progressLabel, { color: visual.accent }]}>
              {progress}%
            </Text>
          </View>

          <View style={styles.ctaRow}>
            <Text style={[styles.ctaText, { color: visual.accent }]}>
              {t("common.continue")}
            </Text>
            <Feather name={arrowForward()} size={sf(13)} color={visual.accent} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export default function WellnessNew({ items = [] }) {
  const { t } = useTranslation();
  const router = useRouter();
  const frame = useHomeFrame();
  const sessionUser = useSessionUser();

  const layout = useMemo(() => {
    const cardWidth = twoUpCardWidth(frame.screenWidth, frame.sideInset, CARD_GAP, PEEK);
    return { cardWidth, snap: snapInterval(cardWidth, CARD_GAP) };
  }, [frame]);

  const renderItem = ({ item }) => (
    <View style={{ width: layout.cardWidth, flexShrink: 0 }}>
      <WellnessCard
        item={item}
        width={layout.cardWidth}
        onPress={() =>
          router.push({
            pathname: "/wellness/wellness-detail",
            params: wellnessDetailRouteParams(item),
          })
        }
      />
    </View>
  );

  if (!isHomeSectionEnabled(sessionUser, "wellness")) return null;

  if (!items.length) {
    return (
      <View style={[homeStyles.section, { alignSelf: "center", marginHorizontal: frame.sideInset, width: frame.contentWidth }]}>
        <HomeSectionHeader label={t("wellness.title")} onPress={() => router.push("/wellness")} />
        <HomeSectionEmpty variant="quiet" message={t("home.noWellnessPrograms")} />
      </View>
    );
  }

  return (
    <View style={[homeStyles.section, { alignSelf: "center", marginHorizontal: frame.sideInset, width: frame.contentWidth }]}>
      <HomeSectionHeader label={t("wellness.title")} onPress={() => router.push("/wellness")} />
      <FlatList
        data={items}
        horizontal
        style={[styles.carousel, { width: frame.contentWidth }]}
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={layout.snap}
        snapToAlignment="start"
        disableIntervalMomentum
        nestedScrollEnabled
        keyExtractor={(item) => item.key ?? String(item.id)}
        renderItem={renderItem}
        getItemLayout={(_, index) => ({
          length: layout.snap,
          offset: layout.snap * index,
          index,
        })}
        ItemSeparatorComponent={() => <View style={{ width: CARD_GAP }} />}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  carousel: { flexGrow: 0, alignSelf: "stretch", overflow: "hidden" },
  listContent: {
    paddingEnd: PEEK,
    paddingTop: sw(2),
    paddingBottom: sw(8),
    alignItems: "flex-start",
  },
  card: {
    borderRadius: RADIUS,
    ...(Platform.OS === "ios"
      ? {
          backgroundColor: T.white,
          ...rnShadow({ color: T.navy, offset: { width: 0, height: 4 }, opacity: 0.08, radius: 10 }),
          borderCurve: "continuous",
        }
      : { elevation: 2, backgroundColor: T.white }),
  },
  cardPressed: { opacity: 0.96, transform: [{ scale: 0.985 }] },
  cardInner: {
    borderRadius: RADIUS,
    overflow: "hidden",
    backgroundColor: T.white,
    ...(Platform.OS === "ios" ? { borderCurve: "continuous" } : null),
  },
  hero: {
    height: HERO_HEIGHT,
    backgroundColor: T.canvas,
    overflow: "hidden",
  },
  heroImage: {
    width: "100%",
    height: HERO_HEIGHT,
  },
  iconBadge: {
    position: "absolute",
    start: sw(10),
    top: sw(12),
    width: ICON_BADGE,
    height: ICON_BADGE,
    borderRadius: ICON_BADGE / 2,
    backgroundColor: T.white,
    alignItems: "center",
    justifyContent: "center",
    ...rnShadow({ color: T.navy, offset: { width: 0, height: 1 }, opacity: 0.08, radius: 3 }),
    elevation: 2,
    zIndex: 2,
  },
  body: {
    paddingTop: sw(4),
    paddingHorizontal: sw(12),
    paddingBottom: sw(12),
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: sf(15),
    lineHeight: sf(19),
    color: T.navy,
    fontWeight: "700",
    includeFontPadding: false,
  },
  sub: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    lineHeight: sf(14),
    color: T.gray,
    marginTop: sw(3),
    includeFontPadding: false,
  },
  progressWrap: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    marginTop: sw(10),
    marginBottom: sw(10),
  },
  progressTrack: {
    flex: 1,
    height: sw(4),
    borderRadius: 999,
    backgroundColor: "rgba(27, 79, 138, 0.08)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
  },
  progressLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    lineHeight: sf(14),
    fontWeight: "600",
    minWidth: sw(28),
    textAlign: "auto",
    includeFontPadding: false,
  },
  ctaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(4),
  },
  ctaText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    lineHeight: sf(17),
    fontWeight: "600",
    includeFontPadding: false,
  },
});
