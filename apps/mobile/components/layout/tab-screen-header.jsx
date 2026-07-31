import React from "react";
import { View, Text, StyleSheet } from "react-native";
import BurgerButton from "../ui/burger-button";
import { Fonts } from "../../constants/font";
import { PageType } from "../../constants/page-styles";
import { HeaderShell, headerChromeStyles } from "./header-chrome";
import { sw, sf } from "../../utils/responsive";

/**
 * Tab header — menu + title + optional subtitle + right actions.
 */
export default function TabScreenHeader({
  title,
  subtitle,
  onMenuPress,
  leadIcon,
  right,
  style,
}) {
  return (
    <HeaderShell style={style}>
      <View style={headerChromeStyles.navRow}>
        <View style={styles.leadSlot}>
          <BurgerButton onPress={onMenuPress} compact />
        </View>
        {leadIcon ? <View style={styles.leadIcon}>{leadIcon}</View> : null}
        <View style={headerChromeStyles.textBlock}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {right ? <View style={headerChromeStyles.right}>{right}</View> : null}
      </View>
    </HeaderShell>
  );
}

const styles = StyleSheet.create({
  leadSlot: {
    flexShrink: 0,
  },
  leadIcon: {
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginRight: sw(-4),
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
    fontSize: PageType.caption,
    lineHeight: sf(15),
    color: "#6B7280",
    marginTop: sw(2),
  },
});
