import { StyleSheet, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import BackButton from "../ui/back-button";
import KeyboardSafeScreen from "./keyboard-safe-screen";
import { onboardingStyles } from "../../constants/onboarding-styles";

export default function OnboardingScreen({
  children,
  showBack = true,
  footer,
  scroll = true,
  contentStyle,
}) {
  const insets = useSafeAreaInsets();

  const body = scroll ? (
    <KeyboardSafeScreen
      contentContainerStyle={[onboardingStyles.scroll, contentStyle]}
      footer={footer}
    >
      {children}
    </KeyboardSafeScreen>
  ) : (
    <View style={[styles.flex, onboardingStyles.scroll, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView style={onboardingStyles.screen} edges={["left", "right"]}>
      {showBack ? (
        <View style={[onboardingStyles.topBar, { paddingTop: insets.top + 8 }]}>
          <BackButton />
        </View>
      ) : (
        <View style={{ paddingTop: insets.top }} />
      )}
      {body}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
