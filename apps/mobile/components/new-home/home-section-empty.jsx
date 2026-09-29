import { View, Text, StyleSheet } from "react-native";
import { Fonts } from "../../constants/font";
import { HomeTheme as T } from "../../constants/home-theme";
import { sf, sw, hp } from "../../utils/responsive";

/** @param {{ message: string, hint?: string, variant?: "default" | "accent" }} props */
export default function HomeSectionEmpty({ message, hint, variant = "default" }) {
  const accent = variant === "accent";

  return (
    <View style={[styles.box, accent && styles.boxAccent]}>
      <Text style={[styles.message, accent && styles.messageAccent]}>{message}</Text>
      {hint ? (
        <Text style={[styles.hint, accent && styles.hintAccent]}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.border,
    borderRadius: sw(12),
    backgroundColor: T.white,
    paddingVertical: hp(1.6),
    paddingHorizontal: sw(14),
    alignItems: "center",
  },
  boxAccent: {
    backgroundColor: T.teal,
    borderColor: T.teal,
  },
  message: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    lineHeight: sf(18),
    color: T.navy,
    fontWeight: "600",
    textAlign: "center",
  },
  messageAccent: {
    color: T.white,
  },
  hint: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    lineHeight: sf(15),
    color: T.gray,
    marginTop: hp(0.3),
    textAlign: "center",
  },
  hintAccent: {
    color: T.white,
  },
});
