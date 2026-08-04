import { Pressable, Text, View, StyleSheet, ActivityIndicator } from "react-native";
import { authStyles, Shadows } from "../../constants/auth-styles";
import { Colors } from "../../constants/tokens";

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
        <View
          style={[
            authStyles.button,
            Shadows.button,
            styles.primaryBtn,
            loading && styles.loadingBtn,
          ]}
        >
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#FFFFFF" size="small" />
              <Text style={authStyles.buttonText}>{label}</Text>
            </View>
          ) : (
            <Text style={authStyles.buttonText}>{label}</Text>
          )}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: { width: "100%" },
  primaryBtn: {
    backgroundColor: Colors.brandPrimary,
  },
  loadingBtn: { opacity: 0.95 },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
});
