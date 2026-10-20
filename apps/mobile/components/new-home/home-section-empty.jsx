import { View, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { HomeTheme as T } from "../../constants/home-theme";
import { sf, sw, hp } from "../../utils/responsive";

/** Empty section card — matches Notices / Deals Corner home placeholders. */
export default function HomeSectionEmpty({ message, hint, icon, variant = "default" }) {
  const accent = variant === "accent";

  return (
    <View style={[styles.box, accent && styles.boxAccent]}>
      {icon ? (
        <View style={[styles.iconWell, accent && styles.iconWellAccent]}>
          <Feather name={icon} size={sf(18)} color={accent ? T.white : T.teal} />
        </View>
      ) : null}
      <Text style={[styles.message, accent && styles.messageAccent]}>{message}</Text>
      {hint ? <Text style={[styles.hint, accent && styles.hintAccent]}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    width: "100%",
    alignSelf: "stretch",
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: sw(14),
    backgroundColor: T.white,
    paddingVertical: hp(2.4),
    paddingHorizontal: sw(18),
    alignItems: "center",
    minHeight: hp(13),
    justifyContent: "center",
  },
  iconWell: {
    width: sw(40),
    height: sw(40),
    borderRadius: sw(12),
    backgroundColor: T.mint,
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.28)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: sw(10),
  },
  iconWellAccent: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderColor: "rgba(255,255,255,0.35)",
  },
  boxAccent: {
    backgroundColor: T.teal,
    borderColor: T.teal,
  },
  message: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    lineHeight: sf(20),
    color: T.navy,
    textAlign: "center",
  },
  messageAccent: {
    color: T.white,
  },
  hint: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(17),
    color: T.gray,
    marginTop: hp(0.5),
    textAlign: "center",
    maxWidth: "92%",
  },
  hintAccent: {
    color: "rgba(255,255,255,0.88)",
  },
});
