import { View, Text, StyleSheet } from "react-native";
import { Fonts } from "../../constants/font";
import { HomeTheme as T } from "../../constants/home-theme";
import { sf, sw, hp } from "../../utils/responsive";

export default function HomeSectionEmpty({ message, hint }) {
  return (
    <View style={styles.box}>
      <Text style={styles.message}>{message}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
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
  message: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    lineHeight: sf(18),
    color: T.navy,
    fontWeight: "600",
    textAlign: "center",
  },
  hint: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    lineHeight: sf(15),
    color: T.gray,
    marginTop: hp(0.3),
    textAlign: "center",
  },
});
