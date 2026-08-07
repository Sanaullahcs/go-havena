import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { MarketplaceType } from "../../../constants/marketplace-type";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import KeyboardSafeScreen from "../../../components/layout/keyboard-safe-screen";
import { Fonts } from "../../../constants/font";
import { pageStyles, PageType } from "../../../constants/page-styles";
import { useApiAction } from "../../../hooks/use-api-action";
import { useTouchedFieldErrors } from "../../../hooks/use-touched-field-errors";
import { hasFieldErrors } from "../../../utils/form-validation";

function validateReviewForm(review, t) {
  const errors = {};
  const trimmed = review.trim();
  if (!trimmed) {
    errors.review = t("validation.reviewRequired");
  } else if (trimmed.length < 10) {
    errors.review = t("validation.reviewMinLength");
  }
  return errors;
}

export default function WriteReviewScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { vendor = "" } = useLocalSearchParams();
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState("");
  const { touch, clearError, showError, validateOnSubmit } = useTouchedFieldErrors();
  const { runAction } = useApiAction();

  const liveErrors = useMemo(() => validateReviewForm(review, t), [review, t]);
  const canSubmit = useMemo(() => !hasFieldErrors(liveErrors), [liveErrors]);

  const submit = async () => {
    if (!validateOnSubmit(liveErrors)) return;

    await runAction({
      action: async () => Promise.resolve(),
      successTitle: t("deals.reviewSubmitted"),
      successMessage: t("deals.thankYouReview"),
      errorTitle: t("deals.couldNotSubmitReview"),
      onSuccess: () => router.back(),
    });
  };

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <InternalScreenHeader title={t("deals.writeReview")} />

      <KeyboardSafeScreen
        contentContainerStyle={styles.scroll}
        footer={
          <TouchableOpacity
            style={[styles.submitBtn, !canSubmit && styles.submitDisabled]}
            onPress={submit}
            disabled={!canSubmit}
          >
            <Text style={styles.submitText}>{t("deals.submitReview")}</Text>
          </TouchableOpacity>
        }
      >
        <Text style={pageStyles.screenSubtitle}>{t("deals.reviewingVendor", { vendor: vendor || t("deals.localBusiness") })}</Text>

        <Text style={[pageStyles.sectionLabel, { marginTop: 20, marginBottom: 10 }]}>
          {t("deals.yourRating")}
        </Text>
        <View style={styles.starsRow}>
          {[1, 2, 3, 4, 5].map((star) => (
            <TouchableOpacity key={star} onPress={() => setRating(star)}>
              <Text style={[styles.star, star <= rating && styles.starActive]}>
                {star <= rating ? "★" : "☆"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[pageStyles.sectionLabel, { marginTop: 20, marginBottom: 8 }]}>
          {t("deals.yourReview")}
        </Text>
        <TextInput
          value={review}
          onChangeText={(text) => {
            setReview(text);
            clearError("review");
          }}
          onBlur={() => touch("review")}
          placeholder={t("deals.shareExperience")}
          placeholderTextColor="#9CA3AF"
          style={[styles.input, showError("review", liveErrors) && styles.inputError]}
          multiline
          textAlignVertical="top"
        />
        {showError("review", liveErrors) ? (
          <Text style={styles.errorText}>{showError("review", liveErrors)}</Text>
        ) : null}
      </KeyboardSafeScreen>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FFFFFF" },
  scroll: { paddingHorizontal: 20, paddingBottom: 16 },
  starsRow: { flexDirection: "row", gap: 8 },
  star: { fontSize: MarketplaceType.star, color: "#D1D5DB" },
  starActive: { color: "#F59E0B" },
  input: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 12,
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.bodyMd,
    color: "#101828",
  },
  inputError: {
    borderColor: "#EF4444",
  },
  errorText: {
    marginTop: 6,
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: "#DC2626",
  },
  submitBtn: {
    backgroundColor: "#14B8A6",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  submitDisabled: { opacity: 0.45 },
  submitText: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.bodyMd,
    color: "#FFFFFF",
  },
});
