import React from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { Fonts } from "../../constants/font";
import { Property } from "../../constants/property-styles";
import { PropertyHubTheme } from "../../constants/property-management-theme";
import PropertyServiceIcon from "./property-service-icon";
import { sf, sw } from "../../utils/responsive";

const CARD_HEIGHT = sw(112);

function chunkPairs(items) {
  const rows = [];
  for (let index = 0; index < items.length; index += 2) {
    rows.push(items.slice(index, index + 2));
  }
  return rows;
}

export default function PropertyQuickGrid({ actions, onAction, badges = {} }) {
  const rows = chunkPairs(actions);

  return (
    <View style={styles.grid}>
      {rows.map((pair, rowIndex) => (
        <View
          key={`row-${rowIndex}`}
          style={[styles.row, rowIndex < rows.length - 1 && styles.rowSpacing]}
        >
          {pair.map((item, columnIndex) => {
            const badgeCount = item.badgeKey ? badges[item.badgeKey] : item.badge;
            const showBadge = Number(badgeCount) > 0;

            return (
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
                <View style={[styles.card, item.primary && styles.cardPrimary]}>
                  <View style={styles.cardTop}>
                    <PropertyServiceIcon serviceKey={item.key} size={sw(36)} iconSize={sf(16)} />
                    {showBadge ? (
                      <View style={styles.countBubble}>
                        <Text style={styles.countText}>{badgeCount}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text
                    style={[styles.title, item.primary && styles.titlePrimary]}
                    numberOfLines={2}
                  >
                    {item.title}
                  </Text>
                  <Text
                    style={[styles.subtitle, item.primary && styles.subtitlePrimary]}
                    numberOfLines={2}
                  >
                    {item.subtitle}
                  </Text>
                </View>
              </Pressable>
            </View>
            );
          })}
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
    opacity: 0.88,
  },
  card: {
    width: "100%",
    height: CARD_HEIGHT,
    backgroundColor: PropertyHubTheme.surface,
    borderRadius: sw(14),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PropertyHubTheme.border,
    padding: sw(12),
    ...(Platform.OS === "ios"
      ? {
          shadowColor: PropertyHubTheme.text,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.04,
          shadowRadius: 6,
        }
      : { elevation: 1 }),
  },
  cardPrimary: {
    backgroundColor: PropertyHubTheme.text,
    borderColor: PropertyHubTheme.text,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  countBubble: {
    minWidth: sw(20),
    height: sw(20),
    paddingHorizontal: sw(5),
    borderRadius: sw(10),
    backgroundColor: PropertyHubTheme.teal,
    alignItems: "center",
    justifyContent: "center",
  },
  countText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(10),
    color: "#FFFFFF",
    fontWeight: "600",
  },
  title: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    lineHeight: sf(17),
    fontWeight: "600",
    color: PropertyHubTheme.text,
    marginTop: sw(10),
  },
  titlePrimary: {
    color: "#FFFFFF",
  },
  subtitle: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    lineHeight: sf(14),
    color: PropertyHubTheme.textMuted,
    marginTop: sw(3),
  },
  subtitlePrimary: {
    color: "rgba(255,255,255,0.7)",
  },
});
