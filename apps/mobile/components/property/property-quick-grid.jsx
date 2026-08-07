import React from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { Property } from "../../constants/property-styles";
import { PropertyHubTheme, getPropertyServiceMeta } from "../../constants/property-management-theme";
import PropertyServiceIcon from "./property-service-icon";
import { sf, sw } from "../../utils/responsive";

function chunkPairs(items) {
  const rows = [];
  for (let index = 0; index < items.length; index += 2) {
    rows.push(items.slice(index, index + 2));
  }
  return rows;
}

function ServiceCard({ item, badgeCount, onPress }) {
  const showBadge = Number(badgeCount) > 0;
  const meta = getPropertyServiceMeta(item.key);
  const isPrimary = Boolean(item.primary);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={item.title}
    >
      <View style={[styles.card, isPrimary && styles.cardPrimary]}>
        <View
          style={[
            styles.accentBar,
            { backgroundColor: isPrimary ? PropertyHubTheme.teal : meta.color },
          ]}
        />
        <View style={styles.cardInner}>
          <View style={styles.cardTop}>
            <PropertyServiceIcon
              serviceKey={item.key}
              size={sw(40)}
              iconSize={sf(17)}
              inverted={isPrimary}
            />
            {showBadge ? (
              <View style={[styles.countBubble, isPrimary && styles.countBubbleOnPrimary]}>
                <Text style={styles.countText}>{badgeCount}</Text>
              </View>
            ) : (
              <View style={[styles.chevronWell, isPrimary && styles.chevronWellOnPrimary]}>
                <Feather
                  name="arrow-up-right"
                  size={sf(13)}
                  color={isPrimary ? "#FFFFFF" : PropertyHubTheme.textMuted}
                />
              </View>
            )}
          </View>

          <Text
            style={[styles.title, isPrimary && styles.titlePrimary]}
            numberOfLines={2}
          >
            {item.title}
          </Text>
          <Text
            style={[styles.subtitle, isPrimary && styles.subtitlePrimary]}
            numberOfLines={2}
          >
            {item.subtitle}
          </Text>
        </View>
      </View>
    </Pressable>
  );
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

            return (
              <View
                key={item.id}
                style={[styles.col, columnIndex === 0 && pair.length > 1 && styles.colGap]}
              >
                <ServiceCard
                  item={item}
                  badgeCount={badgeCount}
                  onPress={() => onAction(item.routeKey)}
                />
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
    marginEnd: Property.gridGap,
  },
  colPlaceholder: {
    opacity: 0,
  },
  pressable: {
    width: "100%",
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
  card: {
    width: "100%",
    minHeight: sw(124),
    backgroundColor: PropertyHubTheme.surface,
    borderRadius: sw(16),
    borderWidth: 1,
    borderColor: PropertyHubTheme.border,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: PropertyHubTheme.text,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: { elevation: 3 },
    }),
  },
  cardPrimary: {
    backgroundColor: PropertyHubTheme.text,
    borderColor: PropertyHubTheme.text,
  },
  accentBar: {
    height: sw(3.5),
    width: "100%",
  },
  cardInner: {
    flex: 1,
    padding: sw(12),
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  countBubble: {
    minWidth: sw(22),
    height: sw(22),
    paddingHorizontal: sw(6),
    borderRadius: sw(11),
    backgroundColor: PropertyHubTheme.teal,
    alignItems: "center",
    justifyContent: "center",
  },
  countBubbleOnPrimary: {
    backgroundColor: PropertyHubTheme.teal,
  },
  countText: {
    fontFamily: Fonts.bold,
    fontSize: sf(10),
    color: "#FFFFFF",
    fontWeight: "700",
  },
  chevronWell: {
    width: sw(24),
    height: sw(24),
    borderRadius: sw(8),
    backgroundColor: PropertyHubTheme.screenBg,
    alignItems: "center",
    justifyContent: "center",
  },
  chevronWellOnPrimary: {
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: sf(13.5),
    lineHeight: sf(18),
    fontWeight: "700",
    color: PropertyHubTheme.text,
    marginTop: sw(12),
  },
  titlePrimary: {
    color: "#FFFFFF",
  },
  subtitle: {
    fontFamily: Fonts.regular,
    fontSize: sf(11.5),
    lineHeight: sf(15),
    color: PropertyHubTheme.textMuted,
    marginTop: sw(3),
  },
  subtitlePrimary: {
    color: "rgba(209,250,245,0.78)",
  },
});
