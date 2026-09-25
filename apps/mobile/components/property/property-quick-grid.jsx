import React, { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { Property } from "../../constants/property-styles";
import { PropertyHubTheme, getPropertyServiceMeta } from "../../constants/property-management-theme";
import PropertyServiceIcon from "./property-service-icon";
import { sf, sw } from "../../utils/responsive";
import { chevronForward } from "../../utils/rtl";
import { rnShadow } from "../../utils/shadow";

const CARD_MIN_HEIGHT = sw(124);

function chunkPairs(items) {
  const rows = [];
  for (let index = 0; index < items.length; index += 2) {
    rows.push(items.slice(index, index + 2));
  }
  return rows;
}

function ServiceCard({ item, badgeCount, onPress, width }) {
  const showBadge = Number(badgeCount) > 0;
  const meta = getPropertyServiceMeta(item.key);
  const isPrimary = Boolean(item.primary);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.pressable,
        width ? { width } : null,
        pressed && styles.pressed,
      ]}
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

          <View style={styles.copyBlock}>
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
      </View>
    </Pressable>
  );
}

export default function PropertyQuickGrid({ actions, onAction, badges = {} }) {
  const rows = chunkPairs(actions);
  const [gridWidth, setGridWidth] = useState(0);

  const onGridLayout = useCallback((event) => {
    const nextWidth = Math.floor(event.nativeEvent.layout.width);
    if (nextWidth > 0) {
      setGridWidth((current) => (current === nextWidth ? current : nextWidth));
    }
  }, []);

  const columnWidth = gridWidth > 0
    ? Math.floor((gridWidth - Property.gridGap) / 2)
    : null;

  return (
    <View style={styles.grid} onLayout={onGridLayout}>
      {rows.map((pair, rowIndex) => (
        <View
          key={`row-${rowIndex}`}
          style={[
            styles.row,
            columnWidth != null && { gap: Property.gridGap },
            rowIndex < rows.length - 1 && styles.rowSpacing,
          ]}
        >
          {pair.map((item) => {
            const badgeCount = item.badgeKey ? badges[item.badgeKey] : item.badge;

            return (
              <View
                key={item.id}
                style={columnWidth != null ? { width: columnWidth } : styles.colFlex}
              >
                <ServiceCard
                  item={item}
                  badgeCount={badgeCount}
                  width={columnWidth ?? undefined}
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
    alignItems: "stretch",
    width: "100%",
  },
  rowSpacing: {
    marginBottom: Property.gridGap,
  },
  colFlex: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
  },
  pressable: {
    width: "100%",
    height: "100%",
  },
  pressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  card: {
    flex: 1,
    width: "100%",
    minHeight: CARD_MIN_HEIGHT,
    borderRadius: sw(14),
    borderWidth: 1,
    overflow: "hidden",
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
    width: "100%",
    paddingVertical: sw(12),
    paddingHorizontal: sw(12),
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    minHeight: sw(42),
  },
  copyBlock: {
    width: "100%",
    marginTop: sw(10),
    flex: 1,
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
    flexShrink: 0,
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
    flexShrink: 0,
    marginStart: sw(8),
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
    minHeight: sf(34),
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
    minHeight: sf(30),
  },
  subtitlePrimary: {
    color: "rgba(209,250,245,0.82)",
  },
});
