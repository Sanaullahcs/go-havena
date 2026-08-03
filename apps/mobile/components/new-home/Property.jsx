import { Text, View, StyleSheet, Pressable, useWindowDimensions, FlatList } from "react-native";
import React, { useMemo } from "react";
import { useRouter } from "expo-router";
import { Fonts } from "../../constants/font";
import { Home, homeStyles } from "../../constants/home-styles";
import { HomeTheme } from "../../constants/home-theme";
import HomeSectionHeader from "./section-header";
import HomeSectionEmpty from "./home-section-empty";
import AmenityIcon from "../property/amenity-icon";
import {
  PropertyManagementRoutes,
  amenityFacilityParams,
} from "../../constants/property-management-routes";
import { getAmenityVisual, getAmenityStatus } from "../../utils/amenity-display";
import { sw, sf } from "../../utils/responsive";

const ITEM_WIDTH = sw(76);
const ITEM_GAP = sw(12);

function mapAmenityToCard(amenity) {
  const visual = getAmenityVisual(amenity.name, amenity.icon_key);
  const status = getAmenityStatus(amenity.status);

  return {
    id: String(amenity.id),
    title: amenity.name ?? "Service",
    subTitle: amenity.hours?.trim() || status.label,
    iconKey: amenity.icon_key,
    amenity,
    visual,
  };
}

function ServiceTile({ item, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
    >
      <View style={styles.iconCircle}>
        <AmenityIcon
          iconKey={item.iconKey}
          name={item.title}
          size={sf(20)}
          color={HomeTheme.deepNavy}
        />
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {item.title}
      </Text>
    </Pressable>
  );
}

export default function PropertyNew({ items = [] }) {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();

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
    <View style={homeStyles.section}>
      <HomeSectionHeader
        label="Neighborhood Services"
        onPress={() => router.push(PropertyManagementRoutes.HOME)}
      />
      {cards.length === 0 ? (
        <HomeSectionEmpty
          message="No services yet"
          hint="Community facilities will appear here once published."
        />
      ) : (
        <FlatList
          data={cards}
          horizontal
          showsHorizontalScrollIndicator={false}
          nestedScrollEnabled
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingRight: Home.gutter }}
          ItemSeparatorComponent={() => <View style={{ width: ITEM_GAP }} />}
          style={{ width: screenWidth - Home.gutter * 2 }}
          renderItem={({ item }) => (
            <ServiceTile
              item={item}
              onPress={() => openAmenity(item.amenity)}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: ITEM_WIDTH,
    alignItems: "center",
    gap: sw(8),
  },
  tilePressed: {
    opacity: 0.85,
  },
  iconCircle: {
    width: sw(56),
    height: sw(56),
    borderRadius: sw(28),
    backgroundColor: "#E8F8F6",
    borderWidth: 1,
    borderColor: HomeTheme.lightBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    lineHeight: sf(14),
    color: HomeTheme.darkText,
    fontWeight: "600",
    textAlign: "center",
  },
});
