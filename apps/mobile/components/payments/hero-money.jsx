import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "../../constants/font";
import { sf, sw } from "../../utils/responsive";

/** "Rs 18,000" → prefix + figures, so the digits stay large. */
function splitMoney(text) {
  const value = String(text ?? "").trim();
  const match = value.match(/^(.*?)([\d•][\d,.\s•]*)$/);
  if (!match) return { symbol: "", amount: value };
  return { symbol: match[1].trim(), amount: match[2].trim() };
}

/**
 * Hero amount for the bills and utilities headers.
 * The figure does not shrink to fit — a long total stays readable.
 */
export default function HeroMoney({ text, size = 42 }) {
  const { symbol, amount } = splitMoney(text);
  const figure = sf(size);
  const mark = sf(Math.round(size * 0.42));

  return (
    <View style={styles.row}>
      {symbol ? (
        <Text style={[styles.symbol, { fontSize: mark, lineHeight: mark + sf(4) }]}>{symbol}</Text>
      ) : null}
      <Text style={[styles.amount, { fontSize: figure, lineHeight: figure + sf(8) }]} numberOfLines={1}>
        {amount}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "baseline",
    marginTop: sw(8),
    gap: sw(6),
  },
  symbol: {
    fontFamily: Fonts.semiBold,
    color: "rgba(255,255,255,0.88)",
    letterSpacing: 0.2,
    includeFontPadding: false,
  },
  amount: {
    flexShrink: 1,
    fontFamily: Fonts.bold,
    color: "#FFFFFF",
    letterSpacing: -0.6,
    includeFontPadding: false,
    fontVariant: ["tabular-nums"],
  },
});
