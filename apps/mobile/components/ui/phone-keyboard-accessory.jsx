import { InputAccessoryView, Keyboard, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { Colors } from "../../constants/tokens";

/** Shared nativeID so phone/OTP pads don't show the stock gray “Done” toolbar. */
export const PHONE_KEYBOARD_ACCESSORY_ID = "havenaPhoneKeyboardAccessory";

/**
 * iOS phone-pad / number-pad have no return key. RN/Expo often injects a bulky
 * gray accessory with “Done”. Replace it with a compact dismiss row (or hide).
 */
export default function PhoneKeyboardAccessory({ mode = "compact" }) {
  const { t } = useTranslation();
  if (Platform.OS !== "ios") return null;

  if (mode === "hidden") {
    return (
      <InputAccessoryView nativeID={PHONE_KEYBOARD_ACCESSORY_ID}>
        <View style={styles.hidden} />
      </InputAccessoryView>
    );
  }

  return (
    <InputAccessoryView nativeID={PHONE_KEYBOARD_ACCESSORY_ID}>
      <View style={styles.bar}>
        <View style={styles.flex} />
        <Pressable
          onPress={() => Keyboard.dismiss()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t("common.dismiss")}
        >
          <Text style={styles.dismiss}>{t("common.dismiss")}</Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}

const styles = StyleSheet.create({
  hidden: {
    height: 0.5,
    backgroundColor: "transparent",
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#F8FAFC",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
  },
  flex: { flex: 1 },
  dismiss: {
    fontFamily: Fonts.semiBold,
    fontSize: 16,
    fontWeight: "600",
    color: Colors.brandPrimaryDeep,
  },
});
