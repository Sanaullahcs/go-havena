import { Text, View, StyleSheet, Pressable, useWindowDimensions, FlatList, Platform } from "react-native";
import React, { useMemo } from "react";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { Home, homeStyles } from "../../constants/home-styles";
import { HomeTheme as T } from "../../constants/home-theme";
import HomeSectionHeader from "./section-header";
import HomeSectionEmpty from "./home-section-empty";
import WellnessCategoryIcon from "../wellness/wellness-category-icon";
import { wellnessDetailRouteParams } from "../../constants/wellness-categories";
import { getWellnessCategoryMeta } from "../../constants/wellness-theme";
import { sw, sf } from "../../utils/responsive";

const CARD_GAP = sw(12);
const PEEK = sw(32);
const RADIUS = sw(16);
const ICON_WELL = sw(44);

function WellnessCard({ item, width, onPress }) {
  const meta = getWellnessCategoryMeta(item.iconKey ?? item.key);
  const accent = item.color ?? meta.color;
  const progress = Math.min(100, Math.max(0, item.progressPercent ?? 0));

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
        {/* Top colored band */}
        <View style={[styles.topBand, { backgroundColor: accent }]}>
          <View style={styles.iconWell}>
            <WellnessCategoryIcon categoryKey={item.iconKey ?? item.key} size={sw(28)} />
          </View>
        </View>

        {/* Content */}
        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.sub} numberOfLines={1}>
            {item.coursesLabel || item.subtitle}
          </Text>

          {/* Progress */}
          <View style={styles.progressWrap}>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${progress}%`, backgroundColor: accent },
                ]}
              />
            </View>
            <Text style={[styles.progressLabel, { color: accent }]}>{progress}%</Text>
          </View>

          {/* CTA */}
          <View style={styles.ctaRow}>
            <Text style={[styles.ctaText, { color: accent }]}>Continue</Text>
            <Feather name="arrow-right" size={sf(12)} color={accent} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export default function WellnessNew({ items = [] }) {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();

  const layout = useMemo(() => {
    const contentWidth = screenWidth - Home.gutter * 2;
    const cardWidth = Math.floor((contentWidth - CARD_GAP - PEEK) / 2);
    const snap = cardWidth + CARD_GAP;
    return { cardWidth, snap };
  }, [screenWidth]);

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

  if (!items.length) {
    return (
      <View style={homeStyles.section}>
        <HomeSectionHeader label="Wellness" onPress={() => router.push("/wellness")} />
        <HomeSectionEmpty
          message="No wellness programs yet"
          hint="Programs from your community will appear here."
        />
      </View>
    );
  }

  return (
    <View style={homeStyles.section}>
      <HomeSectionHeader label="Wellness" onPress={() => router.push("/wellness")} />
      <FlatList
        data={items}
        horizontal
        style={styles.carousel}
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
  carousel: { flexGrow: 0, alignSelf: "stretch" },
  listContent: { paddingRight: PEEK, alignItems: "flex-start" },
  card: {
    borderRadius: RADIUS,
    ...(Platform.OS === "ios"
      ? {
          backgroundColor: T.white,
          shadowColor: T.navy,
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.08,
          shadowRadius: 10,
          borderCurve: "continuous",
        }
      : { elevation: 2 }),
  },
  cardPressed: { opacity: 0.93, transform: [{ scale: 0.97 }] },
  cardInner: {
    borderRadius: RADIUS,
    overflow: "hidden",
    backgroundColor: T.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.border,
    ...(Platform.OS === "ios" ? { borderCurve: "continuous" } : null),
  },
  topBand: {
    height: sw(56),
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 0,
  },
  iconWell: {
    width: ICON_WELL,
    height: ICON_WELL,
    borderRadius: ICON_WELL / 2,
    backgroundColor: T.white,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: -ICON_WELL / 2,
    shadowColor: T.navy,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  body: {
    paddingTop: ICON_WELL / 2 + sw(8),
    paddingHorizontal: sw(12),
    paddingBottom: sw(14),
    alignItems: "center",
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    lineHeight: sf(17),
    color: T.navy,
    fontWeight: "700",
    textAlign: "center",
  },
  sub: {
    fontFamily: Fonts.regular,
    fontSize: sf(10.5),
    lineHeight: sf(14),
    color: T.gray,
    marginTop: sw(2),
    marginBottom: sw(10),
    textAlign: "center",
  },
  progressWrap: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
    marginBottom: sw(10),
  },
  progressTrack: {
    flex: 1,
    height: sw(5),
    borderRadius: 999,
    backgroundColor: T.canvas,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
  },
  progressLabel: {
    fontFamily: Fonts.bold,
    fontSize: sf(10),
    fontWeight: "700",
    minWidth: sw(26),
    textAlign: "right",
  },
  ctaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(4),
  },
  ctaText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    fontWeight: "600",
  },
});
