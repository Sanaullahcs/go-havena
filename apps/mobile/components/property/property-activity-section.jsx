import React from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { PropertyHubTheme } from "../../constants/property-management-theme";
import ApprovalQueueIcon from "./approval-queue-icon";
import PropertyServiceIcon from "./property-service-icon";
import { sf, sw } from "../../utils/responsive";
import { arrowForward } from "../../utils/rtl";

const TONE = {
  success: {
    badgeBg: PropertyHubTheme.successBg,
    badgeColor: PropertyHubTheme.successText,
    accent: PropertyHubTheme.teal,
    noteBg: PropertyHubTheme.successBg,
    icon: "check-circle",
  },
  pending: {
    badgeBg: PropertyHubTheme.pendingBg,
    badgeColor: PropertyHubTheme.pendingText,
    accent: "#F59E0B",
    noteBg: PropertyHubTheme.pendingBg,
    icon: "clock",
  },
  danger: {
    badgeBg: PropertyHubTheme.dangerBg,
    badgeColor: PropertyHubTheme.dangerText,
    accent: "#EF4444",
    noteBg: PropertyHubTheme.dangerBg,
    icon: "x-circle",
  },
  approval: {
    badgeBg: PropertyHubTheme.pendingBg,
    badgeColor: PropertyHubTheme.pendingText,
    accent: PropertyHubTheme.teal,
    noteBg: PropertyHubTheme.mint,
    noteColor: PropertyHubTheme.deepTeal,
    icon: "clock",
    ctaBg: PropertyHubTheme.teal,
  },
};

function ApprovalActivityCard({ item, onPress, isLast }) {
  const tone = TONE.approval;
  const isReview = item.badge === "Review";
  const isScheduleNote = item.key === "bookings";

  return (
    <View style={!isLast ? styles.itemWrap : undefined}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}, ${item.badge}`}
      >
        <View style={styles.approvalCard}>
          <View style={styles.approvalBody}>
            <View style={styles.approvalHeader}>
              <ApprovalQueueIcon
                iconKey={
                  item.iconKey ?? (isReview ? "amenityReview" : "bookingRequest")
                }
                size={sw(44)}
                iconSize={sf(18)}
              />
              <View style={styles.approvalLead}>
                <Text style={styles.approvalTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <View style={styles.requesterRow}>
                  <Feather name="user" size={sf(10)} color={PropertyHubTheme.textMuted} />
                  <Text style={styles.requesterText} numberOfLines={1}>
                    {item.meta}
                  </Text>
                </View>
              </View>
              <View style={[styles.approvalBadge, { backgroundColor: tone.badgeBg }]}>
                <Feather
                  name={isReview ? "eye" : "clock"}
                  size={sf(10)}
                  color={tone.badgeColor}
                />
                <Text style={[styles.approvalBadgeText, { color: tone.badgeColor }]}>
                  {item.badge}
                </Text>
              </View>
            </View>

            {item.note ? (
              isScheduleNote ? (
                <View style={[styles.scheduleChip, { backgroundColor: tone.noteBg }]}>
                  <Feather
                    name="calendar"
                    size={sf(11)}
                    color={tone.noteColor ?? tone.badgeColor}
                  />
                  <Text
                    style={[styles.scheduleText, { color: tone.noteColor ?? tone.badgeColor }]}
                    numberOfLines={1}
                  >
                    {item.note}
                  </Text>
                </View>
              ) : (
                <Text style={styles.approvalMessage} numberOfLines={2}>
                  {item.note}
                </Text>
              )
            ) : null}

            {item.linkLabel ? (
              <View style={[styles.approvalCta, { backgroundColor: tone.ctaBg }]}>
                <Text style={styles.approvalCtaText}>{item.linkLabel}</Text>
                <Feather name={arrowForward()} size={sf(12)} color="#FFFFFF" />
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>
    </View>
  );
}

function StatusActivityCard({ item, onPress, isLast }) {
  const tone = TONE[item.type] ?? TONE.success;

  return (
    <View style={!isLast ? styles.itemWrap : undefined}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={item.title}
      >
        <View style={styles.card}>
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
                <Feather name={arrowForward()} size={sf(12)} color={tone.badgeColor} />
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
        style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
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
                <Feather name={arrowForward()} size={sf(12)} color={PropertyHubTheme.alertLink} />
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

        if (item.type === "approval") {
          return (
            <ApprovalActivityCard
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

const cardShadow = Platform.select({
  ios: {
    shadowColor: PropertyHubTheme.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
  },
  android: { elevation: 1 },
});

const styles = StyleSheet.create({
  list: {
    width: "100%",
  },
  itemWrap: {
    marginBottom: sw(12),
  },
  pressable: {
    width: "100%",
  },
  pressed: {
    opacity: 0.92,
  },
  approvalCard: {
    width: "100%",
    backgroundColor: PropertyHubTheme.surface,
    borderRadius: sw(16),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PropertyHubTheme.border,
    overflow: "hidden",
    ...cardShadow,
  },
  approvalBody: {
    paddingVertical: sw(14),
    paddingHorizontal: sw(14),
  },
  approvalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  approvalLead: {
    flex: 1,
    minWidth: 0,
    marginStart: sw(10),
    marginEnd: sw(8),
  },
  approvalTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    lineHeight: sf(18),
    fontWeight: "700",
    color: PropertyHubTheme.text,
  },
  requesterRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: sw(4),
  },
  requesterText: {
    fontFamily: Fonts.medium,
    fontSize: sf(11),
    lineHeight: sf(15),
    fontWeight: "500",
    color: PropertyHubTheme.textMuted,
    marginStart: sw(5),
    flex: 1,
  },
  approvalBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: sw(5),
    paddingHorizontal: sw(8),
    borderRadius: sw(999),
    flexShrink: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PropertyHubTheme.pendingBorder,
  },
  approvalBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: sf(10),
    lineHeight: sf(13),
    fontWeight: "700",
    marginStart: sw(4),
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  scheduleChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginTop: sw(12),
    paddingVertical: sw(7),
    paddingHorizontal: sw(10),
    borderRadius: sw(10),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PropertyHubTheme.iconBorder,
    gap: sw(6),
  },
  scheduleText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    lineHeight: sf(15),
    fontWeight: "600",
    flexShrink: 1,
  },
  approvalMessage: {
    fontFamily: Fonts.medium,
    fontSize: sf(11),
    lineHeight: sf(16),
    fontWeight: "500",
    color: PropertyHubTheme.textMuted,
    marginTop: sw(10),
  },
  approvalCta: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginTop: sw(12),
    paddingVertical: sw(9),
    paddingHorizontal: sw(14),
    borderRadius: sw(10),
    gap: sw(6),
  },
  approvalCtaText: {
    fontFamily: Fonts.bold,
    fontSize: sf(12),
    lineHeight: sf(16),
    fontWeight: "700",
    color: "#FFFFFF",
  },
  card: {
    width: "100%",
    backgroundColor: PropertyHubTheme.surface,
    borderRadius: sw(14),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PropertyHubTheme.border,
    overflow: "hidden",
    ...cardShadow,
  },
  cardBody: {
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
    marginStart: sw(10),
    marginEnd: sw(6),
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
    marginStart: sw(3),
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
    marginStart: sw(4),
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
    backgroundColor: PropertyHubTheme.alertBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PropertyHubTheme.alertBorder,
    borderRadius: sw(14),
    padding: sw(12),
  },
  alertIconWrap: {
    width: sw(34),
    height: sw(34),
    borderRadius: sw(10),
    backgroundColor: PropertyHubTheme.pendingBadgeBg,
    alignItems: "center",
    justifyContent: "center",
    marginEnd: sw(10),
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
    marginEnd: sw(3),
  },
  alertLink: {
    fontFamily: Fonts.bold,
    fontSize: sf(11),
    lineHeight: sf(14),
    fontWeight: "700",
    color: PropertyHubTheme.alertLink,
    marginEnd: sw(3),
  },
});
