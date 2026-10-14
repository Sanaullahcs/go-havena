import { View, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { HomeTheme as T } from "../../constants/home-theme";
import { sf, sw, hp } from "../../utils/responsive";

/** @param {{ message: string, hint?: string, icon?: string, variant?: "default" | "accent" | "quiet" }} props */
export default function HomeSectionEmpty({ message, hint, icon, variant = "default" }) {
  const accent = variant === "accent";
  const quiet = variant === "quiet";

  return (
    <View style={[styles.box, accent && styles.boxAccent, quiet && styles.boxQuiet]}>
      {icon && !quiet ? (
        <View style={styles.iconWell}>
          <Feather name={icon} size={sf(15)} color={T.teal} />
        </View>
      ) : null}
      <Text style={[styles.message, accent && styles.messageAccent, quiet && styles.messageQuiet]}>{message}</Text>
      {hint && !quiet ? (
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
  iconWell: {
    width: sw(32),
    height: sw(32),
    borderRadius: sw(16),
    backgroundColor: T.mint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: sw(8),
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
  boxQuiet: {
    borderWidth: 0,
    backgroundColor: "transparent",
    alignItems: "flex-start",
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  messageQuiet: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(18),
    fontWeight: "400",
    color: T.gray,
    textAlign: "left",
  },
});
