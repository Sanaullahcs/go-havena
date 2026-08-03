import { Text, View, StyleSheet, useWindowDimensions } from "react-native";
import React, { useMemo } from "react";
import { useRouter } from "expo-router";
import { Fonts } from "../../constants/font";
import { Home, homeStyles } from "../../constants/home-styles";
import { HomeTheme } from "../../constants/home-theme";
import HomeSectionHeader from "./section-header";
import SectionCarousel from "./section-carousel";
import HomeSectionCard from "./home-section-card";
import WellnessCategoryIcon from "../wellness/wellness-category-icon";
import { wellnessDetailRouteParams } from "../../constants/wellness-categories";
import { getWellnessCategoryMeta } from "../../constants/wellness-theme";
import HomeSectionEmpty from "./home-section-empty";
import { sw, sf, hp } from "../../utils/responsive";

const CAROUSEL_PEEK = sw(24);
const CARD_GAP = sw(10);

function MiniCard({ item, width, onPress }) {
  const meta = getWellnessCategoryMeta(item.iconKey ?? item.key);
  const accent = item.color ?? meta.color;
  const progress = Math.min(100, Math.max(0, item.progressPercent ?? 0));

  return (
    <HomeSectionCard
      style={{ width }}
      contentStyle={styles.cardContent}
      onPress={onPress}
    >
      <WellnessCategoryIcon categoryKey={item.iconKey ?? item.key} size={sw(36)} />
      <View style={styles.textWrap}>
        <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.sub} numberOfLines={1}>
          {item.coursesLabel || item.subtitle}
        </Text>
        <View
          style={[
            styles.progressTrack,
            { backgroundColor: meta.bg, borderColor: meta.border },
          ]}
        >
          <View
            style={[
              styles.progressFill,
              {
                width: `${progress}%`,
                backgroundColor: accent,
              },
            ]}
          />
        </View>
      </View>
    </HomeSectionCard>
  );
}

export default function WellnessNew({ items = [] }) {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = useMemo(() => {
    const contentWidth = screenWidth - Home.gutter * 2;
    return Math.floor((contentWidth - CARD_GAP - CAROUSEL_PEEK) / 2);
  }, [screenWidth]);

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
      <SectionCarousel
        data={items}
        screenWidth={screenWidth}
        cardWidth={cardWidth}
        gap={CARD_GAP}
        peek={CAROUSEL_PEEK}
        keyExtractor={(item) => item.key ?? String(item.id)}
        renderItem={({ item, width }) => (
          <MiniCard
            item={item}
            width={width}
            onPress={() =>
              router.push({
                pathname: "/wellness/wellness-detail",
                params: wellnessDetailRouteParams(item),
              })
            }
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  cardContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: sw(10),
  },
  textWrap: { flex: 1, marginLeft: sw(10), minWidth: 0 },
  title: {
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    lineHeight: sf(17),
    color: HomeTheme.darkText,
    fontWeight: "700",
    includeFontPadding: false,
  },
  sub: {
    fontFamily: Fonts.regular,
    fontSize: sf(10.5),
    lineHeight: sf(14),
    color: HomeTheme.mediumGray,
    marginTop: 2,
    includeFontPadding: false,
  },
  progressTrack: {
    marginTop: hp(0.6),
    height: 5,
    borderRadius: 999,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: HomeTheme.lightBorder,
    backgroundColor: "#E8F8F6",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
  },
});
