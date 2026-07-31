import { Pressable, Text, View, StyleSheet, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { authStyles, Gradients, Shadows } from "../../constants/auth-styles";

export default function PrimaryButton({
  label,
  onPress,
  disabled = false,
  loading = false,
}) {
  const isInactive = disabled && !loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.pressable,
        pressed && !disabled && !loading && { opacity: 0.92 },
      ]}
    >
      {isInactive ? (
        <View style={[authStyles.button, authStyles.buttonDisabled]}>
          <Text style={authStyles.buttonText}>{label}</Text>
        </View>
      ) : (
        <LinearGradient
          colors={Gradients.cta}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[authStyles.button, Shadows.button, loading && styles.loadingBtn]}
        >
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#FFFFFF" size="small" />
              <Text style={authStyles.buttonText}>{label}</Text>
            </View>
          ) : (
            <Text style={authStyles.buttonText}>{label}</Text>
          )}
        </LinearGradient>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: { width: "100%" },
  loadingBtn: { opacity: 0.95 },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
});
