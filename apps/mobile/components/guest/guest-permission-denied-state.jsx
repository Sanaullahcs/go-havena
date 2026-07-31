import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { Colors, Layout } from "../../constants/tokens";
import { GUEST_PERMISSION_OPTIONS } from "../../constants/guest-permissions";
import { resolveGuestFeatureError } from "../../utils/guest-permission-errors";
import { sf, sw } from "../../utils/responsive";

/** Blue hero — guest permission card only. */
const GUEST_BLOCKED_HERO = [Colors.brandPrimaryDeep, Colors.brandGradientEnd];

const HERO_THEMES = {
  blue: {
    gradient: GUEST_BLOCKED_HERO,
    accent: Colors.brandPrimaryDeep,
    titleColor: Colors.surface,
    subtitleColor: "rgba(255,255,255,0.88)",
  },
  red: {
    gradient: ["#FEF2F2", "#FEE2E2"],
    accent: "#DC2626",
    titleColor: "#991B1B",
    subtitleColor: "#B91C1C",
  },
  amber: {
    gradient: ["#FFFBEB", "#FEF3C7"],
    accent: "#B45309",
    titleColor: "#92400E",
    subtitleColor: "#B45309",
  },
};

function featureMeta(feature) {
  const option = GUEST_PERMISSION_OPTIONS.find((item) => item.key === feature);
  return {
    label: option?.label ?? "This feature",
    description: option?.description ?? "Community content shared with guests",
    icon: option?.icon ?? "lock",
  };
}

/** Header banner for feature cards (blue = guest, red = suspended, amber = pending). */
export function FeatureBlockedHero({
  variant = "blue",
  icon,
  title,
  subtitle,
  badgeLabel,
  badgeIcon = "shield-off",
  compact = false,
}) {
  const theme = HERO_THEMES[variant] ?? HERO_THEMES.blue;

  return (
    <LinearGradient
      colors={theme.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={styles.hero}
    >
      <View style={styles.heroIconRing}>
        <Feather name={icon} size={sf(compact ? 18 : 20)} color={theme.accent} />
      </View>
      <View style={styles.heroCopy}>
        <Text style={[styles.heroTitle, { color: theme.titleColor }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.heroSubtitle, { color: theme.subtitleColor }]} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
      <View style={styles.badge}>
        <Feather name={badgeIcon} size={sf(10)} color={theme.accent} />
        <Text style={[styles.badgeText, { color: theme.accent }]}>{badgeLabel}</Text>
      </View>
    </LinearGradient>
  );
}

/** Empty state when a guest lacks permission for a feature. */
export function GuestPermissionDeniedState({ feature, message, compact = false }) {
  const meta = featureMeta(feature);

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <FeatureBlockedHero
        icon={meta.icon}
        title={meta.label}
        subtitle="Not shared with your guest account"
        badgeLabel="Restricted"
        compact={compact}
      />

      <View style={styles.body}>
        <View style={styles.lockRow}>
          <View style={styles.lockIcon}>
            <Feather name="lock" size={sf(14)} color={Colors.brandPrimaryDeep} />
          </View>
          <View style={styles.lockCopy}>
            <Text style={styles.lockTitle}>Access not granted</Text>
            <Text style={styles.lockMessage}>
              {message ||
                `The resident or community admin who invited you did not enable ${meta.label.toLowerCase()} for this visit.`}
            </Text>
          </View>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>What this would include</Text>
          <Text style={styles.infoText}>{meta.description}</Text>
        </View>

        <View style={styles.stepsCard}>
          <Text style={styles.stepsTitle}>Need access?</Text>
          <StepRow index={1} text="Contact the person who invited you as a guest." />
          <StepRow index={2} text="They can update guest permissions and send a new invitation if needed." />
          <StepRow index={3} text="You can still use the other areas enabled on your invite." last />
        </View>
      </View>
    </View>
  );
}

/** Empty state when a suspended or blocked resident cannot access community content. */
export function AccountRestrictedState({
  featureLabel = "Community content",
  featureDescription,
  featureIcon = "lock",
  title,
  message,
  statusLabel = "Suspended",
  statusIcon = "shield-off",
  subtitle = "Not available while your account is restricted",
  lockIcon = "lock",
  variant = "red",
  meta = [],
  highlight,
  restrictedSince,
  stepsTitle = "Need access restored?",
  steps = [
    "Contact your community administrator about this suspension.",
    "After access is restored, pull down to refresh or reopen this screen.",
  ],
  actions = null,
  compact = false,
}) {
  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <FeatureBlockedHero
        variant={variant}
        icon={featureIcon}
        title={featureLabel}
        subtitle={subtitle}
        badgeLabel={statusLabel}
        badgeIcon={statusIcon}
        compact={compact}
      />

      <View style={styles.body}>
        <View style={styles.lockRow}>
          <View style={styles.lockIcon}>
            <Feather name={lockIcon} size={sf(14)} color={Colors.brandPrimaryDeep} />
          </View>
          <View style={styles.lockCopy}>
            <Text style={styles.lockTitle}>{title || "Your account is suspended"}</Text>
            <Text style={styles.lockMessage}>
              {message ||
                "Your community administrator suspended your account. Community features stay hidden until access is restored."}
            </Text>
          </View>
        </View>

        {restrictedSince ? (
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Restricted since</Text>
            <Text style={styles.infoText}>{restrictedSince}</Text>
          </View>
        ) : null}

        {meta.length ? (
          <View style={styles.infoCard}>
            {meta.map((item) => (
              <View key={item.label} style={styles.metaRow}>
                <Text style={styles.metaLabel}>{item.label}</Text>
                <Text style={[styles.metaValue, item.tone === "danger" && styles.metaValueDanger]}>
                  {item.value}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {featureDescription ? (
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>What you cannot access</Text>
            <Text style={styles.infoText}>{featureDescription}</Text>
          </View>
        ) : null}

        {highlight ? (
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>{highlight.label}</Text>
            <Text style={styles.infoText}>{highlight.value}</Text>
          </View>
        ) : null}

        {steps?.length ? (
          <View style={styles.stepsCard}>
            <Text style={styles.stepsTitle}>{stepsTitle}</Text>
            {steps.map((text, index) => (
              <StepRow
                key={`${index}-${text}`}
                index={index + 1}
                text={text}
                last={index === steps.length - 1}
              />
            ))}
          </View>
        ) : null}

        {actions}
      </View>
    </View>
  );
}

export function StepRow({ index, text, last = false }) {
  return (
    <View style={[styles.stepRow, !last && styles.stepRowSpaced]}>
      <View style={styles.stepBadge}>
        <Text style={styles.stepBadgeText}>{index}</Text>
      </View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

/** Permission-denied UI or generic load error with optional retry. */
export default function GuestFeatureErrorState({
  error,
  fallbackFeature,
  defaultTitle = "Could not load content",
  onRetry,
  compact = false,
}) {
  const resolved = resolveGuestFeatureError(error, fallbackFeature, defaultTitle);

  if (resolved.isAccountRestricted) {
    return (
      <AccountRestrictedState
        featureLabel={resolved.featureLabel}
        featureDescription={resolved.featureDescription}
        featureIcon={resolved.featureIcon}
        title={resolved.title}
        message={resolved.message}
        statusLabel={resolved.statusLabel}
        meta={resolved.meta}
        highlight={resolved.highlight}
        restrictedSince={resolved.restrictedSince}
        compact={compact}
      />
    );
  }

  if (resolved.isPermissionDenied) {
    return (
      <GuestPermissionDeniedState
        feature={resolved.feature ?? fallbackFeature}
        message={resolved.message}
        compact={compact}
      />
    );
  }

  return (
    <View style={[styles.genericWrap, compact && styles.wrapCompact]}>
      <LinearGradient colors={["#EFF6FF", "#ECFDF5"]} style={styles.genericIcon}>
        <Feather name={resolved.icon} size={sf(30)} color={Colors.brandPrimaryDeep} />
      </LinearGradient>
      <Text style={styles.genericTitle}>{resolved.title}</Text>
      <Text style={styles.genericMessage}>{resolved.message}</Text>
      {!resolved.hideRetry && onRetry ? (
        <TouchableOpacity style={styles.retryBtn} activeOpacity={0.9} onPress={onRetry}>
          <Feather name="refresh-cw" size={sf(14)} color={Colors.brandPrimaryDeep} />
          <Text style={styles.retryBtnText}>Try again</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: sw(16),
    marginTop: sw(12),
    marginBottom: sw(20),
    borderRadius: Layout.cardRadius,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#EEF2F6",
    backgroundColor: Colors.surface,
  },
  wrapCompact: {
    marginHorizontal: sw(12),
    marginTop: sw(8),
  },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(10),
    paddingHorizontal: sw(14),
    paddingVertical: sw(12),
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
  },
  heroIconRing: {
    width: sw(40),
    height: sw(40),
    borderRadius: sw(12),
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    backgroundColor: Colors.surface,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(4),
    paddingHorizontal: sw(8),
    paddingVertical: sw(5),
    borderRadius: Layout.pillRadius,
    backgroundColor: "rgba(255,255,255,0.92)",
    flexShrink: 0,
  },
  badgeText: {
    fontFamily: Fonts.semibold,
    fontSize: sf(9),
    color: Colors.brandPrimaryDeep,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  heroTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(15),
    color: Colors.surface,
    marginBottom: sw(2),
  },
  heroSubtitle: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    lineHeight: sf(15),
    color: "rgba(255,255,255,0.88)",
  },
  body: {
    paddingHorizontal: sw(14),
    paddingTop: sw(12),
    paddingBottom: sw(14),
    gap: sw(10),
    backgroundColor: Colors.surfaceMuted,
  },
  lockRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(12),
  },
  lockIcon: {
    width: sw(32),
    height: sw(32),
    borderRadius: sw(10),
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.borderInput,
  },
  lockCopy: {
    flex: 1,
  },
  lockTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(15),
    color: Colors.textPrimary,
    marginBottom: sw(4),
  },
  lockMessage: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(19),
    color: Colors.textSecondary,
  },
  infoCard: {
    backgroundColor: Colors.surface,
    borderRadius: sw(12),
    borderWidth: 1,
    borderColor: "#EEF2F6",
    padding: sw(12),
  },
  infoLabel: {
    fontFamily: Fonts.semibold,
    fontSize: sf(11),
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: sw(6),
  },
  infoText: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(19),
    color: Colors.textBody,
  },
  stepsCard: {
    backgroundColor: Colors.surface,
    borderRadius: sw(12),
    borderWidth: 1,
    borderColor: "#EEF2F6",
    padding: sw(12),
  },
  stepsTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    color: Colors.textPrimary,
    marginBottom: sw(10),
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(10),
  },
  stepRowSpaced: {
    marginBottom: sw(10),
  },
  stepBadge: {
    width: sw(22),
    height: sw(22),
    borderRadius: sw(11),
    backgroundColor: Colors.roleAdminBg,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: sf(11),
    color: Colors.brandPrimaryDeep,
  },
  stepText: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(19),
    color: Colors.textSecondary,
  },
  genericWrap: {
    alignItems: "center",
    paddingHorizontal: sw(24),
    paddingVertical: sw(32),
    gap: sw(10),
  },
  genericIcon: {
    width: sw(72),
    height: sw(72),
    borderRadius: sw(22),
    alignItems: "center",
    justifyContent: "center",
    marginBottom: sw(4),
  },
  genericTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(18),
    color: Colors.textPrimary,
    textAlign: "center",
  },
  genericMessage: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(19),
    color: Colors.textSecondary,
    textAlign: "center",
  },
  retryBtn: {
    marginTop: sw(8),
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    paddingHorizontal: sw(16),
    paddingVertical: sw(11),
    borderRadius: Layout.buttonRadius,
    backgroundColor: Colors.roleAdminBg,
  },
  retryBtnText: {
    fontFamily: Fonts.semibold,
    fontSize: sf(13),
    color: Colors.brandPrimaryDeep,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: sw(12),
    marginBottom: sw(8),
  },
  metaLabel: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: Colors.textMuted,
  },
  metaValue: {
    flex: 1,
    textAlign: "right",
    fontFamily: Fonts.semibold,
    fontSize: sf(12),
    color: Colors.textPrimary,
  },
  metaValueDanger: {
    color: Colors.brandPrimaryDeep,
  },
});
