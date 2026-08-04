import { View, StyleSheet } from "react-native";
import { AppSafeAreaFull } from "../layout/app-safe-area";
import { authStyles } from "../../constants/auth-styles";

export default function AuthScreen({ children }) {
  return (
    <AppSafeAreaFull style={styles.safe}>
      <View
        style={authStyles.gradient}
      >
        {children}
      </View>
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
