import { View, StyleSheet } from "react-native";
import { useEffect } from "react";
import AuthLogo from "../ui/auth-logo";
import ScreenStatusBar from "./screen-status-bar";
import { applySplashChrome, SPLASH_CHROME_COLOR } from "./system-chrome";

/** Shown while fonts load — keeps white chrome if native splash hides early. */
export default function BootSplash() {
  useEffect(() => {
    applySplashChrome();
  }, []);

  return (
    <>
      <ScreenStatusBar style="dark" variant="splash" />
      <View style={styles.fill}>
        <AuthLogo size={86} compact variant="splash" />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: SPLASH_CHROME_COLOR,
    alignItems: "center",
    justifyContent: "center",
  },
});
