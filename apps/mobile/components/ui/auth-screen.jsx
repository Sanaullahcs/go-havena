import { View, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { AppSafeAreaFull } from "../layout/app-safe-area";
import { authStyles, Gradients } from "../../constants/auth-styles";

export default function AuthScreen({ children }) {
  return (
    <AppSafeAreaFull style={styles.safe}>
      <LinearGradient
        colors={Gradients.authScreen}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={authStyles.gradient}
      >
        {children}
      </LinearGradient>
    </AppSafeAreaFull>
  );
}

export function AuthScreenBody({ children }) {
  return <View style={authStyles.body}>{children}</View>;
}

export function AuthBrandBlock({ children }) {
  return <View style={authStyles.brandBlock}>{children}</View>;
}

export function AuthScrollBody({ children }) {
  return <View style={authStyles.scrollBody}>{children}</View>;
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
});
