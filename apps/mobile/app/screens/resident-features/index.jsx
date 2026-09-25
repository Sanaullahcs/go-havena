import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Fonts } from "../../../constants/font";
import { Colors } from "../../../constants/tokens";
import AuthSubmitButton from "../../../components/ui/auth-submit-button";
import { navigateAfterAuth } from "../../../constants/onboarding-routes";
import { fetchMyResidentFeatures, saveMyResidentFeatures } from "../../../services/resident-features-api";
import { fetchMe } from "../../../services/auth-api";
import { confirmSignOut } from "../../../services/sign-out";
import { useAppDialog } from "../../../providers/app-dialog-provider";
import { flagsFromUser } from "../../../constants/resident-features";
import { getApiErrorMessage } from "../../../utils/api-error-core";

export const options = { headerShown: false };

function groupCatalog(catalog) {
  const groups = [];
  const index = new Map();
  catalog.forEach((item) => {
    const existing = index.get(item.group);
    if (existing === undefined) {
      index.set(item.group, groups.length);
      groups.push({ label: item.group_label, features: [item] });
    } else {
      groups[existing].features.push(item);
    }
  });
  return groups;
}

export default function ResidentFeaturesScreen() {
  const router = useRouter();
  const { showDialog } = useAppDialog();
  const [catalog, setCatalog] = useState([]);
  const [values, setValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await fetchMyResidentFeatures();
      setCatalog(payload.catalog ?? []);
      setValues(payload.features ?? flagsFromUser({ resident_features: payload }));
      setError(null);
    } catch (err) {
      setError(getApiErrorMessage(err) || "Could not load resident features.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onSave = async () => {
    setSaving(true);
    try {
      await saveMyResidentFeatures(values);
      const user = await fetchMe();
      navigateAfterAuth(router, user, { role: "admin" });
    } catch (err) {
      setError(getApiErrorMessage(err) || "Could not save resident features.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.eyebrow}>Community setup</Text>
        <Text style={styles.title}>Resident Features</Text>
        <Text style={styles.subtitle}>
          All features are enabled by default. Turn off any module you do not want residents to use.
        </Text>

        {loading ? (
          <ActivityIndicator style={styles.loader} color="#1B4F8A" />
        ) : (
          groupCatalog(catalog).map((group) => (
            <View key={group.label} style={styles.group}>
              <Text style={styles.groupLabel}>{group.label}</Text>
              {group.features.map((feature) => (
                <View key={feature.key} style={styles.row}>
                  <View style={styles.copy}>
                    <Text style={styles.featureTitle}>{feature.label}</Text>
                    <Text style={styles.featureDesc}>{feature.description}</Text>
                  </View>
                  <Switch
                    value={values[feature.key] !== false}
                    onValueChange={(enabled) =>
                      setValues((current) => ({ ...current, [feature.key]: enabled }))
                    }
                    trackColor={{ false: "#CBD5E1", true: "#059669" }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              ))}
            </View>
          ))
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <AuthSubmitButton
          label="Save and continue"
          loadingLabel="Saving…"
          onPress={onSave}
          enabled={!loading}
          loading={saving}
        />
        <Text style={styles.signOut} onPress={() => confirmSignOut(showDialog)}>
          Sign out
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F8FAFC" },
  scroll: { padding: 20, paddingBottom: 40 },
  eyebrow: { color: "#1B4F8A", fontFamily: Fonts.semiBold, fontSize: 12, textTransform: "uppercase" },
  title: { marginTop: 6, color: Colors.navy ?? "#0F172A", fontFamily: Fonts.bold, fontSize: 26 },
  subtitle: { marginTop: 8, color: "#64748B", fontFamily: Fonts.regular, fontSize: 14, lineHeight: 20 },
  loader: { marginVertical: 32 },
  group: { marginTop: 22 },
  groupLabel: {
    color: "#94A3B8",
    fontFamily: Fonts.semiBold,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  copy: { flex: 1 },
  featureTitle: { fontFamily: Fonts.semiBold, fontSize: 14, color: "#0F172A" },
  featureDesc: { marginTop: 3, fontFamily: Fonts.regular, fontSize: 12, color: "#64748B", lineHeight: 17 },
  error: { marginTop: 12, color: "#DC2626", fontFamily: Fonts.medium, fontSize: 13 },
  signOut: { marginTop: 18, textAlign: "center", color: "#64748B", fontFamily: Fonts.medium, fontSize: 13 },
});
