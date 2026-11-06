import React from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { sf, sw } from "../../utils/responsive";

const THEMES = {
  restaurants: { icon: "restaurant", bg: "#FEF3C7", fg: "#B45309" },
  cafes: { icon: "cafe", bg: "#F5E6D3", fg: "#92400E" },
  pharmacies: { icon: "medkit", bg: "#DCFCE7", fg: "#15803D" },
  banks: { icon: "card", bg: "#E0E7FF", fg: "#3730A3" },
  gyms: { icon: "barbell", bg: "#FEE2E2", fg: "#B91C1C" },
  supermarkets: { icon: "cart", bg: "#E0F2FE", fg: "#0369A1" },
  hospitals: { icon: "medical", bg: "#FCE7F3", fg: "#BE185D" },
  burial_places: { icon: "flower", bg: "#EDE9FE", fg: "#6D28D9" },
  sports_clubs: { icon: "football", bg: "#DCFCE7", fg: "#166534" },
  gas_stations: { icon: "car", bg: "#FEF3C7", fg: "#B45309" },
  parking: { icon: "car-sport", bg: "#E0E7FF", fg: "#3730A3" },
  clubs: { icon: "people", bg: "#D1FAF5", fg: "#0F766E" },
  shopping: { icon: "bag-handle", bg: "#E0F2FE", fg: "#0369A1" },
  all: { icon: "grid", bg: "#D1FAF5", fg: "#0D9488" },
};

function resolveTheme(category) {
  const key = String(category || "").toLowerCase();
  if (THEMES[key]) return THEMES[key];
  if (key.includes("cafe") || key.includes("coffee")) return THEMES.cafes;
  if (key.includes("gym") || key.includes("fitness")) return THEMES.gyms;
  if (key.includes("pharmac")) return THEMES.pharmacies;
  if (key.includes("bank") || key.includes("atm")) return THEMES.banks;
  if (key.includes("hospital") || key.includes("clinic")) return THEMES.hospitals;
  if (key.includes("fuel") || key.includes("gas")) return THEMES.gas_stations;
  if (key.includes("parking")) return THEMES.parking;
  if (key.includes("club")) return THEMES.clubs;
  if (key.includes("shop") || key.includes("mall")) return THEMES.shopping;
  if (key.includes("burial") || key.includes("cemeter") || key.includes("grave")) return THEMES.burial_places;
  if (key.includes("sport")) return THEMES.sports_clubs;
  if (key.includes("market") || key.includes("grocery") || key.includes("shop")) return THEMES.supermarkets;
  if (key.includes("restaurant") || key.includes("food")) return THEMES.restaurants;
  return { icon: "storefront", bg: "#D1FAF5", fg: "#1B4F8A" };
}

export default function PlaceCategoryIcon({ category, size = "md" }) {
  const theme = resolveTheme(category);
  const large = size === "lg";

  return (
    <View
      style={[
        styles.wrap,
        {
          width: large ? sw(56) : sw(44),
          height: large ? sw(56) : sw(44),
          borderRadius: large ? sw(16) : sw(12),
          backgroundColor: theme.bg,
        },
      ]}
    >
      <Ionicons name={theme.icon} size={large ? sf(26) : sf(20)} color={theme.fg} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
});
