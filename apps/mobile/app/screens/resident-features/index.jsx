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
import { useTranslation } from "react-i18next";
import { Fonts } from "../../../constants/font";
import BackButton from "../../../components/ui/back-button";
import AuthSubmitButton from "../../../components/ui/auth-submit-button";
import ScreenStatusBar from "../../../components/layout/screen-status-bar";
import { navigateAfterAuth } from "../../../constants/onboarding-routes";
import { fetchMyResidentFeatures, saveMyResidentFeatures } from "../../../services/resident-features-api";
import { fetchMe } from "../../../services/auth-api";
import { confirmLeaveOnboarding, confirmSignOut } from "../../../services/sign-out";
import { useAppDialog } from "../../../providers/app-dialog-provider";
import { flagsFromUser } from "../../../constants/resident-features";
import { getApiErrorMessage } from "../../../utils/api-error-core";
import { HomeTheme as T } from "../../../constants/home-theme";

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
  const { t } = useTranslation();
  const router = useRouter();
  const dialog = useAppDialog();
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
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <ScreenStatusBar style="dark" opaque androidBackgroundColor={T.canvas} />

      <View style={styles.headerRow}>
        <BackButton iconOnly compact onPress={() => confirmLeaveOnboarding(dialog)} />
        <Text style={styles.headerTitle} numberOfLines={1}>
          {t("onboarding.residentFeatures")}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.eyebrow}>{t("onboarding.communitySetup")}</Text>
        <Text style={styles.subtitle}>{t("onboarding.residentFeaturesHint")}</Text>

        {loading ? (
          <ActivityIndicator style={styles.loader} color={T.navy} />
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
                    trackColor={{ false: "#CBD5E1", true: T.teal }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              ))}
            </View>
          ))
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <AuthSubmitButton
          label={t("onboarding.saveAndContinue")}
          loadingLabel={t("onboarding.saving")}
          onPress={onSave}
          enabled={!loading}
          loading={saving}
        />
        <Text style={styles.signOut} onPress={() => confirmSignOut(dialog)}>
          {t("guests.signOut", { defaultValue: "Sign out" })}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: T.canvas,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 2,
    paddingBottom: 12,
  },
  headerTitle: {
    flex: 1,
    minWidth: 0,
    fontFamily: Fonts.bold,
    fontSize: 17,
    lineHeight: 22,
    color: T.navy,
    fontWeight: "700",
  },
  scroll: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  eyebrow: {
    color: T.navy,
    fontFamily: Fonts.semiBold,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    fontWeight: "600",
  },
  subtitle: {
    marginTop: 8,
    color: T.gray,
    fontFamily: Fonts.regular,
    fontSize: 13,
    lineHeight: 19,
  },
  loader: {
    marginVertical: 32,
  },
  group: {
    marginTop: 22,
  },
  groupLabel: {
    color: T.gray,
    fontFamily: Fonts.semiBold,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 8,
    fontWeight: "600",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    backgroundColor: T.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: T.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  copy: {
    flex: 1,
  },
  featureTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: 14,
    color: T.navy,
    fontWeight: "600",
  },
  featureDesc: {
    marginTop: 3,
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: T.gray,
    lineHeight: 17,
  },
  error: {
    marginTop: 12,
    color: "#DC2626",
    fontFamily: Fonts.medium,
    fontSize: 13,
  },
  signOut: {
    marginTop: 18,
    textAlign: "center",
    color: T.gray,
    fontFamily: Fonts.medium,
    fontSize: 13,
  },
});
