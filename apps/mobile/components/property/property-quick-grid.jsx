import React from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { Fonts } from "../../constants/font";
import { Property } from "../../constants/property-styles";
import { PropertyHubTheme } from "../../constants/property-management-theme";
import PropertyServiceIcon from "./property-service-icon";
import { sf, sw } from "../../utils/responsive";

/** Fixed height so every quick-action card matches, even with 1-line vs 2-line copy. */
const CARD_HEIGHT = sw(128);

function chunkPairs(items) {
  const rows = [];
  for (let index = 0; index < items.length; index += 2) {
    rows.push(items.slice(index, index + 2));
  }
  return rows;
}

/** Two-column quick action cards — explicit rows so layout never wraps to 3 columns. */
export default function PropertyQuickGrid({ actions, onAction }) {
  const rows = chunkPairs(actions);

  return (
    <View style={styles.grid}>
      {rows.map((pair, rowIndex) => (
        <View
          key={`row-${rowIndex}`}
          style={[styles.row, rowIndex < rows.length - 1 && styles.rowSpacing]}
        >
          {pair.map((item, columnIndex) => (
            <View
              key={item.id}
              style={[styles.col, columnIndex === 0 && pair.length > 1 && styles.colGap]}
            >
              <Pressable
                onPress={() => onAction(item.routeKey)}
                style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={item.title}
              >
                <View style={styles.card}>
                  <PropertyServiceIcon serviceKey={item.key} size={sw(36)} iconSize={sf(16)} />
                  <Text style={styles.title} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Text style={styles.subtitle} numberOfLines={2}>
                    {item.subtitle}
                  </Text>
                </View>
              </Pressable>
            </View>
          ))}
          {pair.length === 1 ? <View style={[styles.col, styles.colPlaceholder]} /> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    width: "100%",
  },
  row: {
    flexDirection: "row",
    width: "100%",
  },
  rowSpacing: {
    marginBottom: Property.gridGap,
  },
  col: {
    flex: 1,
    minWidth: 0,
  },
  colGap: {
    marginRight: Property.gridGap,
  },
  colPlaceholder: {
    opacity: 0,
  },
  pressable: {
    width: "100%",
  },
  pressed: {
    opacity: 0.9,
  },
  card: {
    width: "100%",
    height: CARD_HEIGHT,
    backgroundColor: "#FFFFFF",
    borderRadius: sw(14),
    borderWidth: 1,
    borderColor: "#E8ECF2",
    padding: sw(12),
    ...Platform.select({
      ios: {
        shadowColor: "#101828",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.03,
        shadowRadius: 3,
      },
      android: { elevation: 1 },
    }),
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: sf(12),
    lineHeight: sf(16),
    fontWeight: "700",
    color: PropertyHubTheme.text,
    marginTop: sw(10),
  },
  subtitle: {
    fontFamily: Fonts.regular,
    fontSize: sf(10),
    lineHeight: sf(14),
    color: PropertyHubTheme.textMuted,
    marginTop: sw(3),
  },
});
