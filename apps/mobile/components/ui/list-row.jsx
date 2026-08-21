import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { internalType } from "../../constants/internal-styles";
import { sw, sf } from "../../utils/responsive";
import { chevronForward } from "../../utils/rtl";

export default function ListRow({
  title,
  subtitle,
  icon,
  iconColor = "#1B4F8A",
  iconBg = "#D1FAF5",
  onPress,
  right,
  danger = false,
  flat = false,
  style,
}) {
  const rowStyle = [styles.row, flat && styles.rowFlat, style];
  const chevron = right ?? (onPress ? <Feather name={chevronForward()} size={sf(16)} color="#CBD5E1" /> : null);

  const inner = (
    <View style={rowStyle}>
      <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
        <Feather name={icon} size={sf(16)} color={iconColor} />
      </View>
      <View style={styles.text}>
        <Text style={[styles.title, danger && styles.titleDanger]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {chevron ? <View style={styles.chevronWrap}>{chevron}</View> : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
      >
        {inner}
      </Pressable>
    );
  }

  return inner;
}

const styles = StyleSheet.create({
  pressable: {
    width: "100%",
    alignSelf: "stretch",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    paddingVertical: sw(10),
    paddingHorizontal: sw(14),
    backgroundColor: "#FFFFFF",
  },
  rowFlat: {
    backgroundColor: "transparent",
  },
  pressed: { opacity: 0.88 },
  iconWrap: {
    width: sw(36),
    height: sw(36),
    borderRadius: sw(10),
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginEnd: sw(12),
  },
  text: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  chevronWrap: {
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    marginStart: sw(8),
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: internalType.rowTitle,
    lineHeight: sf(18),
    color: "#101828",
    fontWeight: "700",
  },
  titleDanger: { color: "#DC2626" },
  subtitle: {
    fontFamily: Fonts.regular,
    fontSize: internalType.rowSub,
    lineHeight: sf(16),
    color: "#6A7282",
    marginTop: sw(2),
  },
});
