import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";

import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import i18n from "../../i18n";
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
    label: option ? i18n.t(option.labelKey) : i18n.t("guests.thisFeature"),
    description: option ? i18n.t(option.descriptionKey) : i18n.t("guests.communityContentShared"),
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
    <View
      style={[
        styles.hero,
        {
          backgroundColor:
            variant === "blue"
              ? Colors.brandPrimaryDeep
              : variant === "red"
                ? "#FEF2F2"
                : "#FFFBEB",
        },
      ]}
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
    </View>
  );
}

/** Empty state when a guest lacks permission for a feature. */
export function GuestPermissionDeniedState({ feature, message, compact = false }) {
  const { t } = useTranslation();
  const meta = featureMeta(feature);

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <FeatureBlockedHero
        icon={meta.icon}
        title={meta.label}
        subtitle={t('guests.notSharedWithGuest')}
        badgeLabel={t('guests.restricted')}
        compact={compact}
      />

      <View style={styles.body}>
        <View style={styles.lockRow}>
          <View style={styles.lockIcon}>
            <Feather name="lock" size={sf(14)} color={Colors.brandPrimaryDeep} />
          </View>
          <View style={styles.lockCopy}>
            <Text style={styles.lockTitle}>{t('guests.accessNotGranted')}</Text>
            <Text style={styles.lockMessage}>
              {message ||
                t('guests.accessNotGrantedMessage', { feature: meta.label.toLowerCase() })}
            </Text>
          </View>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>{t('guests.whatThisIncludes')}</Text>
          <Text style={styles.infoText}>{meta.description}</Text>
        </View>

        <View style={styles.stepsCard}>
          <Text style={styles.stepsTitle}>{t('guests.needAccess')}</Text>
          <StepRow index={1} text={t('guests.contactInviter')} />
          <StepRow index={2} text={t('guests.updatePermissions')} />
          <StepRow index={3} text={t('guests.useOtherAreas')} last />
        </View>
      </View>
    </View>
  );
}

/** Empty state when a suspended or blocked resident cannot access community content. */
export function AccountRestrictedState({
  featureLabel: featureLabelProp,
  featureDescription,
  featureIcon = "lock",
  title: titleProp,
  message: messageProp,
  statusLabel: statusLabelProp,
  statusIcon = "shield-off",
  subtitle: subtitleProp,
  lockIcon = "lock",
  variant = "red",
  meta = [],
  highlight,
  restrictedSince,
  stepsTitle: stepsTitleProp,
  steps: stepsProp,
  actions = null,
  compact = false,
}) {
  const { t } = useTranslation();
  const featureLabel = featureLabelProp ?? t('guests.communityContent');
  const statusLabel = statusLabelProp ?? t('guests.suspended');
  const subtitle = subtitleProp ?? t('guests.accountRestrictedSubtitle');
  const title = titleProp ?? t('guests.accountSuspendedTitle');
  const message = messageProp ?? t('guests.accountSuspendedMessage');
  const stepsTitle = stepsTitleProp ?? t('guests.needAccessRestored');
  const steps = stepsProp ?? [
    t('guests.contactAdminAboutSuspension'),
    t('guests.afterAccessRestored'),
  ];

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
            <Text style={styles.lockTitle}>{title}</Text>
            <Text style={styles.lockMessage}>{message}</Text>
          </View>
        </View>

        {restrictedSince ? (
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>{t('guests.restrictedSince')}</Text>
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
            <Text style={styles.infoLabel}>{t('guests.whatYouCannotAccess')}</Text>
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
  defaultTitle,
  onRetry,
  compact = false,
}) {
  const { t } = useTranslation();
  const resolvedDefaultTitle = defaultTitle ?? t('guests.couldNotLoadContent');
  const resolved = resolveGuestFeatureError(error, fallbackFeature, resolvedDefaultTitle);

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
      <View style={styles.genericIcon}>
        <Feather name={resolved.icon} size={sf(30)} color={Colors.brandPrimaryDeep} />
      </View>
      <Text style={styles.genericTitle}>{resolved.title}</Text>
      <Text style={styles.genericMessage}>{resolved.message}</Text>
      {!resolved.hideRetry && onRetry ? (
        <TouchableOpacity style={styles.retryBtn} activeOpacity={0.9} onPress={onRetry}>
          <Feather name="refresh-cw" size={sf(14)} color={Colors.brandPrimaryDeep} />
          <Text style={styles.retryBtnText}>{t('guests.tryAgain')}</Text>
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
