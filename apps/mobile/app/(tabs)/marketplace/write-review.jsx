import React, { useMemo, useState } from "react";
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

function validateReviewForm(review) {
  const errors = {};
  const trimmed = review.trim();
  if (!trimmed) {
    errors.review = "Review is required.";
  } else if (trimmed.length < 10) {
    errors.review = "Please write at least 10 characters.";
  }
  return errors;
}

export default function WriteReviewScreen() {
  const router = useRouter();
  const { vendor = "Local Business" } = useLocalSearchParams();
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState("");
  const { touch, clearError, showError, validateOnSubmit } = useTouchedFieldErrors();
  const { runAction } = useApiAction();

  const liveErrors = useMemo(() => validateReviewForm(review), [review]);
  const canSubmit = useMemo(() => !hasFieldErrors(liveErrors), [liveErrors]);

  const submit = async () => {
    if (!validateOnSubmit(liveErrors)) return;

    await runAction({
      action: async () => Promise.resolve(),
      successTitle: "Review Submitted",
      successMessage: "Thank you for sharing your experience!",
      errorTitle: "Could not submit review",
      onSuccess: () => router.back(),
    });
  };

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <InternalScreenHeader title="Write Review" />

      <KeyboardSafeScreen
        contentContainerStyle={styles.scroll}
        footer={
          <TouchableOpacity
            style={[styles.submitBtn, !canSubmit && styles.submitDisabled]}
            onPress={submit}
            disabled={!canSubmit}
          >
            <Text style={styles.submitText}>Submit Review</Text>
          </TouchableOpacity>
        }
      >
        <Text style={pageStyles.screenSubtitle}>Reviewing {vendor}</Text>

        <Text style={[pageStyles.sectionLabel, { marginTop: 20, marginBottom: 10 }]}>
          Your Rating
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
          Your Review
        </Text>
        <TextInput
          value={review}
          onChangeText={(text) => {
            setReview(text);
            clearError("review");
          }}
          onBlur={() => touch("review")}
          placeholder="Share your experience..."
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
    backgroundColor: "#007BFF",
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
