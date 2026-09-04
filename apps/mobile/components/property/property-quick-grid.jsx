import React from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { Property } from "../../constants/property-styles";
import { PropertyHubTheme, getPropertyServiceMeta } from "../../constants/property-management-theme";
import PropertyServiceIcon from "./property-service-icon";
import { sf, sw } from "../../utils/responsive";
import { chevronForward } from "../../utils/rtl";
import { rnShadow } from "../../utils/shadow";


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
      <View
        style={[
          styles.card,
          isPrimary ? styles.cardPrimary : styles.cardDefault,
          !isPrimary && { borderColor: meta.border },
        ]}
      >
        <View style={styles.cardInner}>
          <View style={styles.cardTop}>
            <PropertyServiceIcon
              serviceKey={item.key}
              size={sw(42)}
              iconSize={sf(18)}
              inverted={isPrimary}
            />

            {showBadge ? (
              <View style={[styles.countBubble, isPrimary && styles.countBubbleOnPrimary]}>
                <Text style={styles.countText}>{badgeCount}</Text>
              </View>
            ) : (
              <View style={[styles.chevronWell, isPrimary && styles.chevronWellOnPrimary]}>
                <Feather
                  name={chevronForward()}
                  size={sf(14)}
                  color={isPrimary ? "#FFFFFF" : meta.color}
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
            const isOrphan = pair.length === 1;

            return (
              <View
                key={item.id}
                style={[
                  styles.col,
                  isOrphan && styles.colOrphan,
                  columnIndex === 0 && pair.length > 1 && styles.colGap,
                ]}
              >
                <ServiceCard
                  item={item}
                  badgeCount={badgeCount}
                  onPress={() => onAction(item.routeKey)}
                />
              </View>
            );
          })}
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
  colOrphan: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "48%",
    maxWidth: "48%",
  },
  colGap: {
    marginEnd: Property.gridGap,
  },
  pressable: {
    width: "100%",
  },
  pressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  card: {
    width: "100%",
    minHeight: sw(118),
    borderRadius: sw(14),
    borderWidth: 1,
    overflow: "hidden",
    position: "relative",
    ...Platform.select({
      ios: {
        ...rnShadow({ color: PropertyHubTheme.text, offset: { width: 0, height: 1 }, opacity: 0.02, radius: 3 }),
      },
      android: { elevation: 0 },
    }),
  },
  cardDefault: {
    backgroundColor: PropertyHubTheme.surface,
    borderColor: PropertyHubTheme.border,
  },
  cardPrimary: {
    backgroundColor: PropertyHubTheme.text,
    borderColor: PropertyHubTheme.text,
    ...Platform.select({
      ios: {
        ...rnShadow({ color: PropertyHubTheme.text, offset: { width: 0, height: 1 }, opacity: 0.03, radius: 4 }),
      },
      android: { elevation: 1 },
    }),
  },
  cardInner: {
    flex: 1,
    paddingVertical: sw(12),
    paddingStart: sw(14),
    paddingEnd: sw(12),
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
    backgroundColor: PropertyHubTheme.pendingText,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: PropertyHubTheme.surface,
  },
  countBubbleOnPrimary: {
    borderColor: PropertyHubTheme.text,
    backgroundColor: PropertyHubTheme.teal,
  },
  countText: {
    fontFamily: Fonts.bold,
    fontSize: sf(10),
    color: "#FFFFFF",
    fontWeight: "700",
  },
  chevronWell: {
    width: sw(28),
    height: sw(28),
    borderRadius: sw(9),
    backgroundColor: PropertyHubTheme.surface,
    borderWidth: 1,
    borderColor: PropertyHubTheme.border,
    alignItems: "center",
    justifyContent: "center",
  },
  chevronWellOnPrimary: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderColor: "rgba(255,255,255,0.18)",
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    lineHeight: sf(17),
    fontWeight: "700",
    color: PropertyHubTheme.text,
    marginTop: sw(10),
  },
  titlePrimary: {
    color: "#FFFFFF",
  },
  subtitle: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    lineHeight: sf(15),
    color: PropertyHubTheme.textMuted,
    marginTop: sw(3),
  },
  subtitlePrimary: {
    color: "rgba(209,250,245,0.82)",
  },
});
