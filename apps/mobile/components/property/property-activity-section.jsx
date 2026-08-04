import React from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { PropertyHubTheme } from "../../constants/property-management-theme";
import PropertyServiceIcon from "./property-service-icon";
import { sf, sw } from "../../utils/responsive";

const TONE = {
  success: {
    badgeBg: "#ECFDF5",
    badgeColor: "#047857",
    accent: "#10B981",
    noteBg: "#F0FDF4",
    icon: "check-circle",
  },
  pending: {
    badgeBg: "#FFFBEB",
    badgeColor: "#B45309",
    accent: "#F59E0B",
    noteBg: "#FFFBEB",
    icon: "clock",
  },
  danger: {
    badgeBg: "#FEF2F2",
    badgeColor: "#B91C1C",
    accent: "#EF4444",
    noteBg: "#FEF2F2",
    icon: "x-circle",
  },
  approval: {
    badgeBg: "#D1FAF5",
    badgeColor: "#0A2A43",
    accent: "#0A2A43",
    noteBg: "#D1FAF5",
    icon: "inbox",
  },
};

function StatusActivityCard({ item, onPress, isLast }) {
  const tone = TONE[item.type] ?? TONE.success;

  return (
    <View style={!isLast ? styles.itemWrap : undefined}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={item.title}
      >
        <View style={styles.card}>
          <View style={[styles.accent, { backgroundColor: tone.accent }]} />
          <View style={styles.cardBody}>
            <View style={styles.statusHeader}>
              <PropertyServiceIcon serviceKey={item.key} size={sw(36)} iconSize={sf(15)} />
              <View style={styles.leadCopy}>
                <Text style={styles.activityTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <View style={styles.metaRow}>
                  <Feather name="calendar" size={sf(10)} color={PropertyHubTheme.textMuted} />
                  <Text style={styles.activityMeta} numberOfLines={1}>
                    {item.meta}
                  </Text>
                </View>
              </View>
              {item.badge ? (
                <View style={[styles.statusBadge, { backgroundColor: tone.badgeBg }]}>
                  <Feather name={tone.icon} size={sf(10)} color={tone.badgeColor} />
                  <Text style={[styles.statusBadgeText, { color: tone.badgeColor }]}>
                    {item.badge}
                  </Text>
                </View>
              ) : null}
            </View>

            {item.note ? (
              <View style={[styles.noteWrap, { backgroundColor: tone.noteBg }]}>
                <Text style={[styles.activityNote, { color: tone.badgeColor }]} numberOfLines={2}>
                  {item.note}
                </Text>
              </View>
            ) : null}

            {item.linkLabel ? (
              <View style={styles.linkRow}>
                <Text style={[styles.inlineLink, { color: tone.badgeColor }]}>
                  {item.linkLabel}
                </Text>
                <Feather name="arrow-right" size={sf(12)} color={tone.badgeColor} />
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>
    </View>
  );
}

function AlertActivityCard({ item, onPress, isLast }) {
  return (
    <View style={!isLast ? styles.itemWrap : undefined}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={item.title}
      >
        <View style={styles.alertCard}>
          <View style={styles.alertIconWrap}>
            <Feather name="alert-circle" size={sf(15)} color={PropertyHubTheme.alertLink} />
          </View>
          <View style={styles.alertCopy}>
            <Text style={styles.alertTitle}>{item.title}</Text>
            <Text style={styles.alertMeta}>{item.meta}</Text>
            {item.linkLabel ? (
              <View style={styles.linkRow}>
                <Text style={styles.alertLink}>{item.linkLabel}</Text>
                <Feather name="arrow-right" size={sf(12)} color={PropertyHubTheme.alertLink} />
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>
    </View>
  );
}

/** Role-aware activity cards — booking status, approvals, and rule alerts. */
export default function PropertyActivitySection({ items, onAction }) {
  if (!items.length) return null;

  return (
    <View style={styles.list}>
      {items.map((item, index) => {
        const handlePress = () => onAction(item);
        const isLast = index === items.length - 1;

        if (item.type === "alert") {
          return (
            <AlertActivityCard
              key={item.id}
              item={item}
              onPress={handlePress}
              isLast={isLast}
            />
          );
        }

        return (
          <StatusActivityCard
            key={item.id}
            item={item}
            onPress={handlePress}
            isLast={isLast}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    width: "100%",
  },
  itemWrap: {
    marginBottom: sw(12),
  },
  pressed: {
    opacity: 0.92,
  },
  card: {
    flexDirection: "row",
    alignItems: "stretch",
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: sw(14),
    borderWidth: 1,
    borderColor: "#E8ECF2",
    overflow: "hidden",
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
  accent: {
    width: sw(3),
    alignSelf: "stretch",
  },
  cardBody: {
    flex: 1,
    paddingVertical: sw(12),
    paddingHorizontal: sw(12),
  },
  statusHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  leadCopy: {
    flex: 1,
    minWidth: 0,
    marginLeft: sw(10),
    marginRight: sw(6),
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: sw(3),
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: sw(4),
    paddingHorizontal: sw(7),
    borderRadius: sw(999),
    flexShrink: 0,
  },
  statusBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: sf(10),
    lineHeight: sf(13),
    fontWeight: "700",
    marginLeft: sw(3),
  },
  activityTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    lineHeight: sf(17),
    fontWeight: "700",
    color: PropertyHubTheme.text,
  },
  activityMeta: {
    fontFamily: Fonts.regular,
    fontSize: sf(10),
    lineHeight: sf(14),
    color: PropertyHubTheme.textMuted,
    marginLeft: sw(4),
    flex: 1,
  },
  noteWrap: {
    marginTop: sw(10),
    borderRadius: sw(8),
    paddingVertical: sw(6),
    paddingHorizontal: sw(8),
  },
  activityNote: {
    fontFamily: Fonts.medium,
    fontSize: sf(10),
    lineHeight: sf(14),
    fontWeight: "500",
  },
  alertCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    width: "100%",
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
    borderRadius: sw(14),
    padding: sw(12),
  },
  alertIconWrap: {
    width: sw(34),
    height: sw(34),
    borderRadius: sw(10),
    backgroundColor: "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
    marginRight: sw(10),
  },
  alertCopy: {
    flex: 1,
    minWidth: 0,
  },
  alertTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    lineHeight: sf(17),
    fontWeight: "700",
    color: PropertyHubTheme.alertTitle,
  },
  alertMeta: {
    fontFamily: Fonts.regular,
    fontSize: sf(10),
    lineHeight: sf(14),
    color: PropertyHubTheme.alertText,
    marginTop: sw(3),
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: sw(8),
    alignSelf: "flex-start",
  },
  inlineLink: {
    fontFamily: Fonts.bold,
    fontSize: sf(11),
    lineHeight: sf(14),
    fontWeight: "700",
    marginRight: sw(3),
  },
  alertLink: {
    fontFamily: Fonts.bold,
    fontSize: sf(11),
    lineHeight: sf(14),
    fontWeight: "700",
    color: PropertyHubTheme.alertLink,
    marginRight: sw(3),
  },
});
