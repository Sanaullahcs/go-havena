import React, { useMemo, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import BackButton from "../../../components/ui/back-button";
import UnitEntriesSection from "../../../components/onboarding/unit-entries-section";
import KeyboardSafeScreen from "../../../components/layout/keyboard-safe-screen";
import ScreenStatusBar from "../../../components/layout/screen-status-bar";
import { Fonts } from "../../../constants/font";
import { HomeTheme as T } from "../../../constants/home-theme";
import { ScreenBrand as B } from "../../../constants/screen-brand";
import { joinCommunity } from "../../../services/auth-api";
import { getUser } from "../../../services/auth-session";
import { membershipForCommunity } from "../../../services/community-access";
import { fetchMe, uploadUtilityBill } from "../../../services/profile-api";
import {
  completeOnboardingUnits,
  fetchCommunityUnits,
} from "../../../services/property-services-api";
import { navigateAfterAuth } from "../../../constants/onboarding-routes";
import { useApiAction } from "../../../hooks/use-api-action";
import { useSubmitLock } from "../../../hooks/use-submit-lock";
import { LIMITS } from "../../../utils/form-validation";
import { useTouchedFieldErrors } from "../../../hooks/use-touched-field-errors";
import { sf, sw } from "../../../utils/responsive";

function emptyEntry() {
  return {
    key: `unit-${Date.now()}`,
    unit_number: "",
    locked: false,
    is_new_unit: true,
    residence_type: "",
    utilityFile: null,
  };
}

export default function JoinCommunityUnitsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { dialog, showFailure, showSuccess } = useApiAction();
  const { submitting, run } = useSubmitLock();
  const { validateOnSubmit } = useTouchedFieldErrors();
  const { communityId, communityName = "", returnTo } = useLocalSearchParams();
  const numericCommunityId = Number(communityId);
  const name = String(communityName || t("community.myCommunity"));

  const [unitEntries, setUnitEntries] = useState(() => [emptyEntry()]);

  const errors = useMemo(() => {
    const next = {};
    const seen = new Set();
    unitEntries.forEach((entry, index) => {
      const prefix = `unit_${index}`;
      const number = String(entry.unit_number ?? "").trim();
      if (!number) {
        next[`${prefix}_number`] = t("validation.required", {
          field: t("validation.fields.unitNumber"),
        });
      } else if (number.length > LIMITS.profileUnit) {
        next[`${prefix}_number`] = t("validation.maxChars", {
          field: t("validation.fields.unitNumber"),
          max: LIMITS.profileUnit,
        });
      } else {
        const key = number.toLowerCase();
        if (seen.has(key)) {
          next[`${prefix}_number`] = t("onboarding.duplicateUnit");
        }
        seen.add(key);
      }
      if (!entry.residence_type) {
        next[`${prefix}_residence`] = t("validation.required", {
          field: t("onboarding.iAmA"),
        });
      }
      if (!entry.utilityFile?.uri) {
        next[`${prefix}_utility`] = t("validation.utilityRequired");
      }
    });
    return next;
  }, [t, unitEntries]);

  const isValid = Object.keys(errors).length === 0 && unitEntries.length > 0;

  const handleBack = () => {
    if (router.canGoBack?.()) {
      router.back();
      return;
    }
    router.replace("/(tabs)/home");
  };

  const submit = () => {
    if (!validateOnSubmit(errors) || !numericCommunityId) return;

    void run(async () => {
      try {
        const catalog = await fetchCommunityUnits(numericCommunityId).catch(() => []);
        const existingNormalized = new Set(
          (catalog ?? []).map((row) =>
            String(row.unit_number ?? "")
              .trim()
              .replace(/\s+/g, " ")
              .toLowerCase(),
          ),
        );

        const payloadUnits = [];
        for (const entry of unitEntries) {
          const number = String(entry.unit_number ?? "").trim();
          const normalized = number.replace(/\s+/g, " ").toLowerCase();
          let utilityUrl = entry.utilityFile?.uri;
          if (utilityUrl && !/^https?:\/\//i.test(utilityUrl) && !utilityUrl.startsWith("/storage/")) {
            const uploaded = await uploadUtilityBill(utilityUrl, entry.utilityFile);
            utilityUrl = uploaded?.data?.utility_bill_url || utilityUrl;
          }
          if (!utilityUrl) {
            throw new Error(t("myUnits.proofUploadFailed"));
          }
          payloadUnits.push({
            unit_number: number,
            is_new_unit: !existingNormalized.has(normalized),
            residence_type: entry.residence_type,
            utility_bill_url: utilityUrl,
          });
        }

        const sessionUser = await getUser();
        const existing = membershipForCommunity(sessionUser, numericCommunityId);
        if (!existing) {
          await joinCommunity(numericCommunityId);
        } else if (existing.status === "approved") {
          const next = await fetchMe().catch(() => sessionUser);
          if (returnTo === "my-community") {
            router.replace("/screens/my-community");
            return;
          }
          navigateAfterAuth(router, next, { mode: "login" });
          return;
        }

        await completeOnboardingUnits({
          communityId: numericCommunityId,
          units: payloadUnits,
        });

        const latest = await fetchMe().catch(() => getUser());
        await showSuccess(
          t("region.joinRequestSentTitle"),
          t("region.joinRequestSentBody", { name }),
        );
        if (returnTo === "my-community") {
          router.replace("/screens/my-community");
          return;
        }
        navigateAfterAuth(router, latest, { mode: "login" });
      } catch (err) {
        await showFailure(t("region.couldNotJoinCommunity"), err);
      }
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <ScreenStatusBar style="dark" opaque androidBackgroundColor={T.canvas} />
      <View style={[styles.hero, { paddingTop: Math.max(insets.top, 12) }]}>
        <View style={styles.headerRow}>
          <BackButton iconOnly compact onPress={handleBack} />
          <Text style={styles.kicker}>{t("nav.joinAnotherCommunity")}</Text>
        </View>
        <Text style={styles.title}>{t("region.selectUnitsTitle", { name })}</Text>
        <Text style={styles.hint}>{t("region.selectUnitsHint")}</Text>
      </View>

      <KeyboardSafeScreen
        contentContainerStyle={styles.scroll}
        footer={
          <TouchableOpacity
            activeOpacity={isValid && !submitting ? 0.9 : 1}
            onPress={submit}
            disabled={!isValid || submitting}
          >
            <View
              style={[
                styles.button,
                isValid && !submitting ? styles.buttonActive : styles.buttonDisabled,
                isValid && !submitting ? B.buttonShadow : null,
              ]}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>{t("region.submitJoinRequest")}</Text>
              )}
            </View>
          </TouchableOpacity>
        }
      >
        <UnitEntriesSection
          entries={unitEntries}
          onChange={setUnitEntries}
          canAdd
          canRemove
          unitMax={LIMITS.profileUnit}
          errors={errors}
          dialog={dialog}
          loadUnits={async () => {
            const rows = await fetchCommunityUnits(numericCommunityId);
            return (rows ?? []).map((unit) => ({
              id: unit.id,
              unit_number: unit.unit_number,
              resident_count: unit.resident_count ?? 0,
            }));
          }}
          createUnit={async (num) => ({
            id: `local-${Date.now()}`,
            unit_number: num,
            resident_count: 0,
          })}
        />
      </KeyboardSafeScreen>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: T.canvas,
  },
  hero: {
    paddingHorizontal: sw(20),
    paddingBottom: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  kicker: {
    flex: 1,
    fontFamily: Fonts.semiBold,
    fontSize: 12,
    letterSpacing: 0.4,
    color: T.teal,
    textTransform: "uppercase",
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: sf(22),
    lineHeight: sf(28),
    color: T.navy,
  },
  hint: {
    marginTop: 8,
    fontFamily: Fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    color: T.gray,
  },
  scroll: {
    paddingHorizontal: sw(20),
    paddingBottom: 24,
  },
  button: {
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonActive: {
    backgroundColor: T.teal,
  },
  buttonDisabled: {
    backgroundColor: "#C5D0DA",
  },
  buttonText: {
    fontFamily: Fonts.bold,
    fontSize: 16,
    color: "#FFFFFF",
  },
});
