import React from "react";
import { View, StyleSheet } from "react-native";
import BackButton from "../ui/back-button";
import { HeaderShell, headerChromeStyles } from "./header-chrome";
import { sw } from "../../utils/responsive";

/** Consistent top bar for signup / verify auth screens. */
export default function AuthFlowHeader({ right, onBack }) {
  return (
    <HeaderShell>
      <View style={[headerChromeStyles.navRow, styles.row]}>
        <BackButton onPress={onBack} iconOnly compact />
        {right ? <View style={headerChromeStyles.right}>{right}</View> : null}
      </View>
    </HeaderShell>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingTop: sw(2),
  },
});
