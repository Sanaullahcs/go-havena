import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import BackButton from "../ui/back-button";
import { Fonts } from "../../constants/font";
import { HeaderShell, headerChromeStyles } from "./header-chrome";
import { sw, sf } from "../../utils/responsive";

/**
 * Consistent top navigation for stack / modal screens.
 *
 * layout="inline"    -- back + title on one row (default for most screens)
 * layout="stacked"   -- back + title (line 1) + subtitle (line 2)
 * layout="back-only" -- just the back control
 */
export default function ScreenHeader({
  title,
  subtitle,
  onBack,
  right,
  layout = "stacked",
  backLabel,
  showBackLabel = false,
  showBack = true,
  iconOnly = true,
  compact = false,
  style,
  padded = true,
  titleAlign = "left",
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const handleBack = onBack ?? (() => router.back());
  const resolvedBackLabel = backLabel ?? t("common.back");

  const titleStyle = [styles.title, compact && styles.titleCompact];
  const subtitleStyle = [styles.subtitle, compact && styles.subtitleCompact];

  const backControl = showBack ? (
    <BackButton
      onPress={handleBack}
      label={resolvedBackLabel}
      showLabel={showBackLabel}
      iconOnly={iconOnly}
      compact
    />
  ) : null;

  if (layout === "back-only") {
    return (
      <HeaderShell style={style} padded={padded}>
        <View style={headerChromeStyles.navRow}>
          {backControl}
          <View style={headerChromeStyles.right}>{right ?? null}</View>
        </View>
      </HeaderShell>
    );
  }

  if (layout === "inline" && titleAlign === "center") {
    return (
      <HeaderShell style={style} padded={padded}>
        <View style={headerChromeStyles.navRow}>
          <View style={headerChromeStyles.sideSlot}>{backControl}</View>
          <View style={headerChromeStyles.centerSlot}>
            {title ? (
              <Text style={[titleStyle, headerChromeStyles.centerText]}>{title}</Text>
            ) : null}
            {subtitle ? (
              <Text style={[subtitleStyle, headerChromeStyles.centerText]}>{subtitle}</Text>
            ) : null}
          </View>
          <View style={headerChromeStyles.sideSlot}>{right ?? null}</View>
        </View>
      </HeaderShell>
    );
  }

  const showStackedText = layout === "stacked" && (title || subtitle);
  const showInlineTitle = layout === "inline" && title;

  return (
    <HeaderShell style={style} padded={padded}>
      <View style={headerChromeStyles.navRow}>
        {showBack ? <View style={styles.leadSlot}>{backControl}</View> : null}

        {showStackedText ? (
          <View style={headerChromeStyles.textBlock}>
            {title ? <Text style={titleStyle}>{title}</Text> : null}
            {subtitle ? <Text style={subtitleStyle}>{subtitle}</Text> : null}
          </View>
        ) : null}

        {showInlineTitle ? (
          <Text style={[titleStyle, styles.inlineTitle]}>{title}</Text>
        ) : null}

        {right ? <View style={headerChromeStyles.right}>{right}</View> : null}
      </View>
    </HeaderShell>
  );
}

const styles = StyleSheet.create({
  leadSlot: {
    flexShrink: 0,
  },
  inlineTitle: {
    flex: 1,
    minWidth: 0,
    paddingEnd: sw(4),
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: sf(17),
    lineHeight: sf(26),
    fontWeight: "700",
    color: "#101828",
    letterSpacing: 0,
    includeFontPadding: true,
  },
  subtitle: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(18),
    color: "#6B7280",
    marginTop: sw(2),
    includeFontPadding: true,
  },
  titleCompact: {
    fontSize: sf(15),
    lineHeight: sf(24),
  },
  subtitleCompact: {
    fontSize: sf(11),
    lineHeight: sf(17),
  },
});
