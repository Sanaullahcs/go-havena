import { Text, View, StyleSheet, Pressable, FlatList, Platform } from "react-native";
import React, { useMemo } from "react";
import { useRouter, useNavigation } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { Home, homeStyles } from "../../constants/home-styles";
import { HomeTheme as T } from "../../constants/home-theme";
import HomeSectionHeader from "./section-header";
import HomeSectionEmpty from "./home-section-empty";
import AmenityIcon from "../property/amenity-icon";
import {
  PropertyManagementRoutes,
  amenityFacilityParams,
  openServicesHub,
} from "../../constants/property-management-routes";
import { getAmenityVisual, getAmenityStatus } from "../../utils/amenity-display";
import { rnShadow } from "../../utils/shadow";
import { sw, sf } from "../../utils/responsive";
import { useHomeFrame } from "../../hooks/use-home-frame";
import { useSessionUser } from "../../hooks/use-session-user";
import { isHomeSectionEnabled } from "../../constants/resident-features";
import { chevronForward } from "../../utils/rtl";
import { localizedField } from "../../i18n";

const CARD_GAP = sw(10);
const PEEK = sw(24);
const RADIUS = sw(14);
const ICON_WELL = sw(42);

function mapAmenityToCard(amenity) {
  const visual = getAmenityVisual(amenity.name, amenity.icon_key);

  return {
    id: String(amenity.id),
    iconKey: amenity.icon_key,
    iconColor: visual.tint,
    iconBg: visual.soft,
    amenity,
  };
}

function AmenityCard({ item, width, onPress }) {
  const { t, i18n } = useTranslation();
  const amenity = item.amenity;
  const status = getAmenityStatus(amenity.status);
  const title = localizedField(amenity, "name");
  const subtitle = amenity.hours?.trim() || amenity.floor?.trim() || status.label;

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
        {/* Icon */}
        <View style={[styles.iconWell, { backgroundColor: item.iconBg }]}>
          <AmenityIcon
            iconKey={item.iconKey}
            name={title}
            size={sf(20)}
            color={item.iconColor}
          />
        </View>

        {/* Info */}
        <View style={styles.infoCol}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Text style={styles.sub} numberOfLines={1}>{subtitle}</Text>
        </View>

        {/* Arrow */}
        <View style={styles.arrowCircle}>
          <Feather name={chevronForward()} size={sf(14)} color={T.teal} />
        </View>
      </View>
    </Pressable>
  );
}

export default function PropertyNew({ items = [] }) {
  const router = useRouter();
  const navigation = useNavigation();
  const { t } = useTranslation();
  const frame = useHomeFrame();
  const sessionUser = useSessionUser();

  const layout = useMemo(() => {
    const contentWidth = frame.contentWidth;
    const cardWidth = Math.floor(contentWidth * 0.72);
    const snap = cardWidth + CARD_GAP;
    return { cardWidth, snap };
  }, [frame]);

  const cards = useMemo(() => (items ?? []).map(mapAmenityToCard), [items]);

  const openAmenity = (amenity) => {
    router.push({
      pathname: PropertyManagementRoutes.ALL_FACILITIES_SCREEN,
      params: amenityFacilityParams(amenity),
    });
  };

  const renderItem = ({ item }) => (
    <View style={{ width: layout.cardWidth, flexShrink: 0 }}>
      <AmenityCard
        item={item}
        width={layout.cardWidth}
        onPress={() => openAmenity(item.amenity)}
      />
    </View>
  );

  if (!isHomeSectionEnabled(sessionUser, "amenities")) return null;

  return (
    <View style={[homeStyles.sectionLast, { alignSelf: "center", marginHorizontal: frame.sideInset, width: frame.contentWidth }]}>
      <HomeSectionHeader
        label={t("home.services")}
        onPress={() => openServicesHub(navigation, router)}
      />
      {cards.length === 0 ? (
        <HomeSectionEmpty variant="quiet" message={t("home.noAmenities")} />
      ) : (
      <FlatList
          data={cards}
          horizontal
          style={[styles.carousel, { width: frame.contentWidth }]}
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={layout.snap}
          snapToAlignment="start"
          disableIntervalMomentum
          nestedScrollEnabled
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          getItemLayout={(_, index) => ({
            length: layout.snap,
            offset: layout.snap * index,
            index,
          })}
          ItemSeparatorComponent={() => <View style={{ width: CARD_GAP }} />}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  carousel: { flexGrow: 0, alignSelf: "stretch" },
  listContent: { paddingEnd: PEEK, alignItems: "flex-start" },
  card: {
    borderRadius: RADIUS,
    ...(Platform.OS === "ios"
      ? {
          backgroundColor: T.white,
          ...rnShadow({ color: T.navy, offset: { width: 0, height: 2 }, opacity: 0.06, radius: 8 }),
          borderCurve: "continuous",
        }
      : { elevation: 2 }),
  },
  cardPressed: { opacity: 0.93, transform: [{ scale: 0.98 }] },
  cardInner: {
    borderRadius: RADIUS,
    overflow: "hidden",
    backgroundColor: T.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.border,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: sw(14),
    paddingVertical: sw(14),
    gap: sw(12),
    ...(Platform.OS === "ios" ? { borderCurve: "continuous" } : null),
  },
  iconWell: {
    width: ICON_WELL,
    height: ICON_WELL,
    borderRadius: sw(12),
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  infoCol: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    lineHeight: sf(17),
    color: T.navy,
    fontWeight: "700",
    writingDirection: "auto",
    flexShrink: 1,
  },
  sub: {
    fontFamily: Fonts.regular,
    fontSize: sf(10.5),
    lineHeight: sf(14),
    color: T.gray,
    marginTop: sw(2),
    writingDirection: "auto",
    flexShrink: 1,
  },
  arrowCircle: {
    width: sw(28),
    height: sw(28),
    borderRadius: sw(14),
    backgroundColor: T.mint,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
});
