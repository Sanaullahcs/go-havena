import { Text, View, StyleSheet, useWindowDimensions } from "react-native";
import React, { useMemo } from "react";
import { useRouter } from "expo-router";
import { Fonts } from "../../constants/font";
import { Home, homeStyles } from "../../constants/home-styles";
import HomeSectionHeader from "./section-header";
import SectionCarousel from "./section-carousel";
import HomeSectionCard from "./home-section-card";
import HomeSectionEmpty from "./home-section-empty";
import AmenityIcon from "../property/amenity-icon";
import {
  PropertyManagementRoutes,
  amenityFacilityParams,
} from "../../constants/property-management-routes";
import { getAmenityVisual, getAmenityStatus } from "../../utils/amenity-display";
import { sw, sf } from "../../utils/responsive";

const CAROUSEL_PEEK = sw(24);
const CARD_GAP = sw(10);

function mapAmenityToCard(amenity) {
  const visual = getAmenityVisual(amenity.name, amenity.icon_key);
  const status = getAmenityStatus(amenity.status);
  const subtitle =
    amenity.hours?.trim() ||
    amenity.floor?.trim() ||
    status.label;

  return {
    id: String(amenity.id),
    title: amenity.name ?? "Amenity",
    subTitle: subtitle,
    iconKey: amenity.icon_key,
    iconColor: visual.tint,
    iconBg: visual.soft,
    amenity,
  };
}

function MiniCard({ item, width, onPress }) {
  return (
    <HomeSectionCard
      style={{ width }}
      contentStyle={styles.cardContent}
      onPress={onPress}
    >
      <View style={[styles.iconWrap, { backgroundColor: item.iconBg }]}>
        <AmenityIcon
          iconKey={item.iconKey}
          name={item.title}
          size={sf(18)}
          color={item.iconColor}
        />
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.title} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {item.subTitle}
        </Text>
      </View>
    </HomeSectionCard>
  );
}

export default function PropertyNew({ items = [] }) {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = useMemo(() => {
    const contentWidth = screenWidth - Home.gutter * 2;
    return Math.floor((contentWidth - CARD_GAP - CAROUSEL_PEEK) / 2);
  }, [screenWidth]);

  const cards = useMemo(
    () => (items ?? []).map(mapAmenityToCard),
    [items],
  );

  const openAmenity = (amenity) => {
    router.push({
      pathname: PropertyManagementRoutes.ALL_FACILITIES,
      params: amenityFacilityParams(amenity),
    });
  };

  return (
    <View style={homeStyles.sectionLast}>
      <HomeSectionHeader
        label="Property Management"
        onPress={() => router.push(PropertyManagementRoutes.HOME)}
      />
      {cards.length === 0 ? (
        <HomeSectionEmpty
          message="No amenities yet"
          hint="Community facilities will appear here once published."
        />
      ) : (
        <SectionCarousel
          data={cards}
          screenWidth={screenWidth}
          cardWidth={cardWidth}
          gap={CARD_GAP}
          peek={CAROUSEL_PEEK}
          keyExtractor={(item) => item.id}
          renderItem={({ item, width }) => (
            <MiniCard
              item={item}
              width={width}
              onPress={() => openAmenity(item.amenity)}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cardContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: sw(8),
  },
  iconWrap: {
    width: sw(36),
    height: sw(36),
    borderRadius: sw(10),
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  textWrap: { flex: 1, marginLeft: sw(8), minWidth: 0 },
  title: {
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    lineHeight: sf(17),
    color: "#101828",
    fontWeight: "700",
  },
  sub: {
    fontFamily: Fonts.regular,
    fontSize: sf(10.5),
    lineHeight: sf(14),
    color: "#99A1AF",
    marginTop: 1,
  },
});
