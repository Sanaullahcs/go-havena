import React, { useMemo } from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import {
  PropertyHubTheme,
  getApprovalQueueIconMeta,
} from "../../constants/property-management-theme";
import ApprovalQueueIcon from "./approval-queue-icon";
import { sf, sw } from "../../utils/responsive";
import { chevronForward } from "../../utils/rtl";

const MAX_ITEMS = 3;

function resolveIconKey(item) {
  if (item.iconKey) return item.iconKey;
  return item.key === "amenity" ? "amenityReview" : "bookingRequest";
}

function ApprovalQueueCard({ item, onPress }) {
  const iconKey = resolveIconKey(item);
  const meta = getApprovalQueueIconMeta(iconKey);
  const isScheduleNote = item.key === "bookings";

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${item.badge}`}
    >
      <View style={[styles.card, { borderColor: meta.border }]}>
        <View style={styles.row}>
          <ApprovalQueueIcon iconKey={iconKey} size={sw(40)} iconSize={sf(17)} />

          <View style={styles.copy}>
            <View style={styles.titleRow}>
              <Text style={styles.title} numberOfLines={1}>
                {item.title}
              </Text>
              <View style={[styles.badge, { backgroundColor: meta.bg, borderColor: meta.border }]}>
                <Text style={[styles.badgeText, { color: meta.color }]} numberOfLines={1}>
                  {item.badge}
                </Text>
              </View>
            </View>

            <Text style={styles.meta} numberOfLines={1}>
              {item.meta}
            </Text>

            {item.note ? (
              isScheduleNote ? (
                <View style={[styles.noteChip, { backgroundColor: meta.ring, borderColor: meta.border }]}>
                  <Feather name="calendar" size={sf(10)} color={meta.color} />
                  <Text style={[styles.noteChipText, { color: meta.color }]} numberOfLines={1}>
                    {item.note}
                  </Text>
                </View>
              ) : (
                <Text style={styles.note} numberOfLines={1}>
                  {item.note}
                </Text>
              )
            ) : null}
          </View>

          <View style={[styles.chevronWell, { borderColor: meta.border }]}>
            <Feather name={chevronForward()} size={sf(14)} color={meta.color} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

/** Services hub — up to three latest approval items. */
export default function PropertyHubApprovalQueue({ items = [], onAction, limit = MAX_ITEMS }) {
  const visibleItems = useMemo(() => items.slice(0, limit), [items, limit]);

  if (!visibleItems.length) return null;

  return (
    <View style={styles.list}>
      {visibleItems.map((item, index) => (
        <View key={item.id} style={index < visibleItems.length - 1 && styles.itemGap}>
          <ApprovalQueueCard item={item} onPress={() => onAction?.(item)} />
        </View>
      ))}
    </View>
  );
}

const cardShadow = Platform.select({
  ios: {
    shadowColor: PropertyHubTheme.text,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 3,
  },
  android: { elevation: 0 },
});

const styles = StyleSheet.create({
  list: {
    width: "100%",
  },
  itemGap: {
    marginBottom: sw(10),
  },
  pressable: {
    width: "100%",
  },
  pressed: {
    opacity: 0.92,
  },
  card: {
    width: "100%",
    backgroundColor: PropertyHubTheme.surface,
    borderRadius: sw(14),
    borderWidth: 1,
    overflow: "hidden",
    ...cardShadow,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: sw(12),
    paddingHorizontal: sw(12),
  },
  copy: {
    flex: 1,
    minWidth: 0,
    marginStart: sw(10),
    marginEnd: sw(8),
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    lineHeight: sf(18),
    fontWeight: "700",
    color: PropertyHubTheme.text,
  },
  badge: {
    paddingVertical: sw(3),
    paddingHorizontal: sw(7),
    borderRadius: sw(999),
    borderWidth: StyleSheet.hairlineWidth,
    flexShrink: 0,
  },
  badgeText: {
    fontFamily: Fonts.bold,
    fontSize: sf(9),
    lineHeight: sf(12),
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  meta: {
    marginTop: sw(3),
    fontFamily: Fonts.medium,
    fontSize: sf(11),
    lineHeight: sf(15),
    fontWeight: "500",
    color: PropertyHubTheme.textMuted,
  },
  note: {
    marginTop: sw(4),
    fontFamily: Fonts.medium,
    fontSize: sf(11),
    lineHeight: sf(15),
    fontWeight: "500",
    color: PropertyHubTheme.caption,
  },
  noteChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginTop: sw(6),
    paddingVertical: sw(4),
    paddingHorizontal: sw(8),
    borderRadius: sw(8),
    borderWidth: StyleSheet.hairlineWidth,
    gap: sw(5),
    maxWidth: "100%",
  },
  noteChipText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(10),
    lineHeight: sf(14),
    fontWeight: "600",
    flexShrink: 1,
  },
  chevronWell: {
    width: sw(30),
    height: sw(30),
    borderRadius: sw(10),
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PropertyHubTheme.surface,
    flexShrink: 0,
  },
});
