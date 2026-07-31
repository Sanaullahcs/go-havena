import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
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
  backLabel = "Back",
  showBackLabel = false,
  iconOnly = true,
  compact = false,
  style,
  padded = true,
  titleAlign = "left",
}) {
  const router = useRouter();
  const handleBack = onBack ?? (() => router.back());

  const titleStyle = [styles.title, compact && styles.titleCompact];
  const subtitleStyle = [styles.subtitle, compact && styles.subtitleCompact];

  if (layout === "back-only") {
    return (
      <HeaderShell style={style} padded={padded}>
        <View style={headerChromeStyles.navRow}>
          <BackButton
            onPress={handleBack}
            label={backLabel}
            showLabel={showBackLabel}
            iconOnly={iconOnly}
            compact
          />
          <View style={headerChromeStyles.right}>{right ?? null}</View>
        </View>
      </HeaderShell>
    );
  }

  if (layout === "inline" && titleAlign === "center") {
    return (
      <HeaderShell style={style} padded={padded}>
        <View style={headerChromeStyles.navRow}>
          <View style={headerChromeStyles.sideSlot}>
            <BackButton
              onPress={handleBack}
              label={backLabel}
              showLabel={showBackLabel}
              iconOnly={iconOnly}
              compact
            />
          </View>
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
        <View style={styles.leadSlot}>
          <BackButton
            onPress={handleBack}
            label={backLabel}
            showLabel={showBackLabel}
            iconOnly={iconOnly}
            compact
          />
        </View>

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
    paddingRight: sw(4),
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: sf(17),
    lineHeight: sf(22),
    fontWeight: "700",
    color: "#101828",
    letterSpacing: -0.2,
  },
  subtitle: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(16),
    color: "#6B7280",
    marginTop: sw(2),
  },
  titleCompact: {
    fontSize: sf(15),
    lineHeight: sf(20),
  },
  subtitleCompact: {
    fontSize: sf(11),
    lineHeight: sf(14),
  },
});
