import { Text, TextInput } from "react-native";
import { Fonts } from "../constants/font";

/** Make every Text / TextInput inherit the Havena UI face unless a style overrides it. */
export function applyDefaultBrandFont() {
  const fontFamily = Fonts.regular;
  Text.defaultProps = {
    ...(Text.defaultProps || {}),
    style: [{ fontFamily }, Text.defaultProps?.style],
  };
  TextInput.defaultProps = {
    ...(TextInput.defaultProps || {}),
    style: [{ fontFamily }, TextInput.defaultProps?.style],
  };
}
