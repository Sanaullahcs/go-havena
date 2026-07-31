import React, { useState, useMemo, useRef } from "react";
import { MarketplaceType } from "../../../constants/marketplace-type";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  Modal,
  Pressable,
} from "react-native";
import { Image } from "expo-image";
import CrispImage from "../../../components/ui/crisp-image";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Fonts } from "../../../constants/font";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import KeyboardSafeScreen from "../../../components/layout/keyboard-safe-screen";
import { getCurrentRole } from "../../../constants/role-session";
import { pickImage } from "../../../utils/pickImage";
import { useSubmitLock } from "../../../hooks/use-submit-lock";
import { useTouchedFieldErrors } from "../../../hooks/use-touched-field-errors";
import { useApiAction } from "../../../hooks/use-api-action";
import { publishDealWithImage, updateDeal, fetchDeal } from "../../../services/deals-api";
import { fetchMyBusiness } from "../../../services/businesses-api";
import { formatDisplayDate, toApiDate } from "../../../utils/form-datetime";
import { validateDealForm, LIMITS, hasFieldErrors } from "../../../utils/form-validation";

export default function CreateDeal() {
  const router = useRouter();
  const { role: roleParam, editId } = useLocalSearchParams();
  const activeRole =
    roleParam === "admin" || roleParam === "resident"
      ? roleParam
      : getCurrentRole();
  const isAdmin = activeRole === "admin";
  const dealId = editId ? Number(editId) : null;
  const isEdit = Boolean(dealId);
  const { submitting, run } = useSubmitLock();
  const { runAction, showFailure } = useApiAction();
  const [business, setBusiness] = useState("");
  const [ownBusiness, setOwnBusiness] = useState(null);
  const [dealTitle, setDealTitle] = useState("");
  const [discountLabel, setDiscountLabel] = useState("");
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [validUntilDate, setValidUntilDate] = useState(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [tempPickerDate, setTempPickerDate] = useState(new Date());
  const [selectedFile, setSelectedFile] = useState(null);
  const [existingImageUrl, setExistingImageUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const { touch, clearError, showError, validateOnSubmit } = useTouchedFieldErrors();
  const scrollRef = useRef(null);
  const maxDescriptionLength = LIMITS.dealDescription;

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const mine = await fetchMyBusiness();
        if (!cancelled && mine) {
          setOwnBusiness(mine);
          if (!dealId) setBusiness(mine.name);
        }

        // If editing an existing deal, load its data
        if (dealId) {
          const data = await fetchDeal(dealId);
          if (!cancelled) {
            setBusiness(data.vendor ?? mine?.name ?? "");
            setDealTitle(data.title ?? "");
            setDiscountLabel(data.offerTag ?? "");
            setCategory(data.category ?? "");
            setLocation(data.location ?? "");
            setDescription(data.description ?? "");
            if (data.endsAt) {
              const d = new Date(String(data.endsAt).replace(" ", "T"));
              if (!Number.isNaN(d.getTime())) {
                setValidUntilDate(d);
              }
            }
            if (data.imageUrl) {
              setExistingImageUrl(data.imageUrl);
            }
          }
        }
      } catch (err) {
        if (!cancelled) await showFailure("Could not load data", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [dealId, isAdmin]);

  const previewTitle = dealTitle.trim() || "Your deal title";
  const previewDescription = description.trim() || "Your deal description will appear here.";
  const previewDiscount = discountLabel.trim() || "Discount";

  const liveErrors = useMemo(
    () =>
      validateDealForm(
        {
          dealTitle,
          discountLabel,
          category,
          description,
          hasBusiness: Boolean(ownBusiness || business.trim()),
          hasImage: Boolean(selectedFile?.uri || existingImageUrl),
        },
        { businessStatus: ownBusiness?.status },
      ),
    [dealTitle, discountLabel, category, description, ownBusiness, business, selectedFile, existingImageUrl],
  );

  const canSubmit = useMemo(() => !hasFieldErrors(liveErrors), [liveErrors]);

  const handleCreate = () => {
    if (submitting) return;
    if (!validateOnSubmit(liveErrors)) return;
    if (ownBusiness?.status === "rejected") {
      Alert.alert(
        "Business Rejected",
        "Your business has been rejected. You cannot create deals until it is approved.",
      );
      return;
    }
    if (ownBusiness?.status === "pending") {
      Alert.alert(
        "Business Pending",
        "Your business is still pending approval. You can create deals once it is approved.",
      );
      return;
    }

    const endsAt = toApiDate(validUntilDate);

    run(async () => {
      const payload = {
        title: dealTitle.trim(),
        vendor: business.trim() || undefined,
        business_id: ownBusiness?.id ?? undefined,
        description: description.trim(),
        discount_label: discountLabel.trim(),
        category: category.trim() || undefined,
        location: location.trim() || undefined,
        ends_at: endsAt,
        type: "deal",
      };

      await runAction({
        action: () =>
          isEdit
            ? updateDeal(dealId, payload, { asAdmin: isAdmin })
            : publishDealWithImage(selectedFile, payload, { asAdmin: isAdmin }),
        successTitle: isEdit ? "Deal updated" : "Deal published!",
        successMessage: isEdit ? "Your deal was saved." : "Your deal is now live in the marketplace.",
        errorTitle: isEdit ? "Update failed" : "Could not create deal",
        onSuccess: () => router.back(),
      });
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["left", "right"]}>
        <InternalScreenHeader title={isEdit ? "Edit Deal" : "Create Deal"} subtitle="Loading…" />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color="#0052DF" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <InternalScreenHeader
        title={isEdit ? "Edit Deal" : "Create Deal"}
        subtitle={isEdit ? "Update your deal details" : "Add a new deal to the marketplace"}
      />

      <KeyboardSafeScreen
        scrollRef={scrollRef}
        contentContainerStyle={styles.contentContainer}
        footerBorderless
        footerStyle={styles.bottomWrap}
        footer={
          <TouchableOpacity
            activeOpacity={0.88}
            style={[styles.createButton, (!canSubmit || submitting) && styles.createButtonDisabled]}
            onPress={handleCreate}
            disabled={!canSubmit || submitting}
          >
            <Text style={styles.createButtonText}>
              {submitting ? "Saving..." : isEdit ? "Save Deal" : "Create Deal"}
            </Text>
          </TouchableOpacity>
        }
      >
        <Text style={styles.label}>
          Deal Image <Text style={styles.required}>*</Text>
        </Text>
        <TouchableOpacity
          activeOpacity={0.85}
          style={[styles.uploadBox, showError("image", liveErrors) && styles.uploadBoxError]}
          onPress={() => {
            pickImage((file) => {
              setSelectedFile(file);
              touch("image");
              clearError("image");
            });
          }}
        >
          {selectedFile ? (
            <Image
              source={{ uri: selectedFile.uri }}
              style={{ width: "100%", height: "100%", borderRadius: 10 }}
              contentFit="contain"
            />
          ) : existingImageUrl ? (
            <CrispImage
              source={existingImageUrl}
              style={{ width: "100%", height: "100%", borderRadius: 10 }}
              contentFit="contain"
            />
          ) : (
            <>
              <Image
                source={require("../../../assets/images/download-image-icon.png")}
                style={{ width: 32, height: 32 }}
              />
              <Text style={styles.uploadText}>Upload image</Text>
            </>
          )}
        </TouchableOpacity>
        {showError("image", liveErrors) ? <Text style={styles.errorText}>{showError("image", liveErrors)}</Text> : null}

        <Text style={[styles.label, styles.sectionTop]}>
          Business <Text style={styles.required}>*</Text>
        </Text>
        <View style={[styles.businessPill, !ownBusiness && styles.businessPillEmpty]}>
          <Image
            source={require("../../../assets/images/over-business.png")}
            style={{ width: 16, height: 16 }}
          />
          <Text style={styles.businessPillText} numberOfLines={1}>
            {business || "No business registered yet"}
          </Text>
          {ownBusiness?.status === "pending" ? (
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingBadgeText}>Pending approval</Text>
            </View>
          ) : null}
        </View>
        {showError("business", liveErrors) ? <Text style={styles.errorText}>{showError("business", liveErrors)}</Text> : null}

        <Text style={[styles.label, styles.sectionTop]}>
          Deal Title <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          value={dealTitle}
          onChangeText={(t) => { setDealTitle(t); touch("dealTitle"); clearError("dealTitle"); }}
          placeholder="e.g. 20% off all coffee"
          placeholderTextColor="rgba(153, 161, 175, 1)"
          style={[styles.input, showError("dealTitle", liveErrors) && styles.inputError]}
        />
        {showError("dealTitle", liveErrors) ? <Text style={styles.errorText}>{showError("dealTitle", liveErrors)}</Text> : null}

        <View
          style={[
            styles.labelRow,
            styles.sectionTop,
            { flexDirection: "row", alignItems: "center", gap: 4 },
          ]}
        >
          <Image
            source={require("../../../assets/images/discount-black.png")}
            style={{ width: 16, height: 16 }}
          />
          <Text style={styles.label}>
            Discount Label <Text style={styles.required}>*</Text>
          </Text>
        </View>
        <TextInput
          value={discountLabel}
          onChangeText={(t) => { setDiscountLabel(t); touch("discountLabel"); clearError("discountLabel"); }}
          placeholder="30% OFF"
          placeholderTextColor="rgba(153, 161, 175, 1)"
          style={[styles.input, showError("discountLabel", liveErrors) && styles.inputError]}
        />
        {showError("discountLabel", liveErrors) ? <Text style={styles.errorText}>{showError("discountLabel", liveErrors)}</Text> : null}

        <Text style={[styles.label, styles.sectionTop]}>
          Category <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          value={category}
          onChangeText={(t) => { setCategory(t); touch("category"); clearError("category"); }}
          placeholder="e.g. Food & Beverage, Fitness, Retail"
          placeholderTextColor="rgba(153, 161, 175, 1)"
          style={[styles.input, showError("category", liveErrors) && styles.inputError]}
        />
        {showError("category", liveErrors) ? <Text style={styles.errorText}>{showError("category", liveErrors)}</Text> : null}

        <Text style={[styles.label, styles.sectionTop]}>Location</Text>
        <TextInput
          value={location}
          onChangeText={setLocation}
          placeholder="e.g. 123 Main St, Miami, FL"
          placeholderTextColor="rgba(153, 161, 175, 1)"
          style={styles.input}
        />

        <Text style={[styles.label, styles.sectionTop]}>
          Description <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          value={description}
          onChangeText={(t) => { setDescription(t); touch("description"); clearError("description"); }}
          placeholder="Describe the deal and how customers can use it..."
          placeholderTextColor="rgba(153, 161, 175, 1)"
          style={[styles.textArea, showError("description", liveErrors) && styles.inputError]}
          multiline
          maxLength={maxDescriptionLength}
          textAlignVertical="top"
        />
        {showError("description", liveErrors) ? <Text style={styles.errorText}>{showError("description", liveErrors)}</Text> : null}
        <Text style={styles.counterText}>
          {description.length}/{maxDescriptionLength}
        </Text>

        <Text style={[styles.label, styles.sectionTop]}>
          Valid Until
        </Text>
        <TouchableOpacity
          activeOpacity={0.75}
          style={[styles.datePicker, validUntilDate && styles.datePickerFilled]}
          onPress={() => {
            setTempPickerDate(validUntilDate ?? new Date());
            setDatePickerOpen(true);
          }}
        >
          <Ionicons
            name="calendar-outline"
            size={16}
            color={validUntilDate ? "#0052DF" : "#9CA3AF"}
          />
          <Text style={[styles.datePickerText, validUntilDate && styles.datePickerTextFilled]}>
            {formatDisplayDate(validUntilDate) || "Select expiry date"}
          </Text>
          {validUntilDate ? (
            <TouchableOpacity
              hitSlop={8}
              onPress={(e) => {
                e.stopPropagation();
                setValidUntilDate(null);
              }}
            >
              <Ionicons name="close-circle" size={16} color="#9CA3AF" />
            </TouchableOpacity>
          ) : (
            <Ionicons name="chevron-down" size={14} color="#9CA3AF" />
          )}
        </TouchableOpacity>

        {/* Android inline picker */}
        {Platform.OS === "android" && datePickerOpen ? (
          <DateTimePicker
            value={tempPickerDate}
            mode="date"
            minimumDate={new Date()}
            display="default"
            onValueChange={(_event, selected) => {
              setDatePickerOpen(false);
              if (selected) setValidUntilDate(selected);
            }}
            onDismiss={() => setDatePickerOpen(false)}
          />
        ) : null}

        {/* iOS modal sheet */}
        {Platform.OS === "ios" && datePickerOpen ? (
          <Modal transparent animationType="slide" onRequestClose={() => setDatePickerOpen(false)}>
            <Pressable style={styles.dateModalOverlay} onPress={() => setDatePickerOpen(false)} />
            <View style={styles.dateModalSheet}>
              <View style={styles.dateModalToolbar}>
                <TouchableOpacity onPress={() => setDatePickerOpen(false)}>
                  <Text style={styles.dateModalCancel}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.dateModalTitle}>Expiry Date</Text>
                <TouchableOpacity onPress={() => {
                  setValidUntilDate(tempPickerDate);
                  setDatePickerOpen(false);
                }}>
                  <Text style={styles.dateModalDone}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={tempPickerDate}
                mode="date"
                minimumDate={new Date()}
                display="spinner"
                onValueChange={(_event, selected) => {
                  if (selected) setTempPickerDate(selected);
                }}
                style={{ height: 200 }}
              />
            </View>
          </Modal>
        ) : null}

        <View style={styles.previewCard}>
          <Text style={styles.previewLabel}>Preview</Text>
          <View style={styles.previewRow}>
            <View style={styles.previewTextWrap}>
              <Text style={styles.previewTitle}>{previewTitle}</Text>
              <Text style={styles.previewDescription}>{previewDescription}</Text>
            </View>
            <View style={styles.discountBadge}>
              <Text style={styles.discountBadgeText}>{previewDiscount}</Text>
            </View>
          </View>
        </View>
      </KeyboardSafeScreen>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  header: {
    backgroundColor: "#F8FAFC",
    paddingVertical: 20,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderColor: "#F3F4F6",
    flexDirection: "column",
    gap: 16,
  },
  titleWrap: {
    gap: 4,
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.title,
    lineHeight: MarketplaceType.titleLine,
    color: "#0F172A",
    fontWeight: 700,
  },
  subtitle: {
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.body,
    lineHeight: MarketplaceType.headingLine,
    color: "#667085",
    flexShrink: 1,
  },
  contentContainer: {
    padding: 24,
    paddingBottom: 40,
  },
  label: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.heading,
    lineHeight: MarketplaceType.stat,
    color: "rgba(0, 0, 0, 1)",
    fontWeight: 700,
  },
  required: {
    color: "#F04438",
  },
  sectionTop: {
    marginTop: 14,
  },
  uploadBox: {
    marginTop: 12,
    height: 108,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "rgba(209, 213, 220, 1)",
    backgroundColor: "rgba(249, 250, 251, 1)",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  uploadBoxError: {
    borderColor: "#F04438",
    backgroundColor: "#FFF5F5",
  },
  uploadText: {
    fontFamily: Fonts.medium,
    fontSize: MarketplaceType.body,
    lineHeight: MarketplaceType.headingLine,
    color: "rgba(106, 114, 130, 1)",
    fontWeight: 500,
  },
  input: {
    marginTop: 8,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(249, 250, 251, 1)",
    borderWidth: 1,
    borderColor: "#EEF2F6",
    paddingHorizontal: 16,
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.caption,
    lineHeight: MarketplaceType.captionLine,
    color: "#111827",
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  textArea: {
    marginTop: 8,
    minHeight: 100,
    borderRadius: 10,
    backgroundColor: "rgba(249, 250, 251, 1)",
    borderWidth: 1,
    borderColor: "#EEF2F6",
    paddingHorizontal: 16,
    paddingTop: 12,
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.caption,
    lineHeight: MarketplaceType.captionLine,
    color: "#111827",
  },
  counterText: {
    marginTop: 8,
    alignSelf: "flex-end",
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.caption,
    lineHeight: MarketplaceType.captionLine,
    color: "rgba(106, 114, 130, 1)",
  },
  previewCard: {
    marginTop: 12,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "rgba(254, 230, 133, 1)",
    backgroundColor: "rgba(254, 243, 198, 1)",
    padding: 18,
  },
  previewLabel: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.caption,
    lineHeight: MarketplaceType.captionLine,
    color: "rgba(123, 51, 6, 1)",
    marginBottom: 7,
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  previewTextWrap: {
    flex: 1,
  },
  previewTitle: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.body,
    lineHeight: MarketplaceType.headingLine,
    color: "rgba(0, 0, 0, 1)",
    fontWeight: 700,
  },
  previewDescription: {
    marginTop: 2,
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.caption,
    lineHeight: MarketplaceType.captionLine,
    color: "rgba(74, 85, 101, 1)",
    fontWeight: 400,
  },
  discountBadge: {
    borderRadius: 10,
    backgroundColor: "#FF9800",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  discountBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.body,
    lineHeight: MarketplaceType.headingLine,
    color: "#FFFFFF",
    fontWeight: 700,
  },
  bottomWrap: {
    paddingHorizontal: 6,
    paddingTop: 12,
    paddingBottom: 4,
    backgroundColor: "#FFFFFF",
  },
  createButton: {
    height: 56,
    borderRadius: 14,
    backgroundColor: "rgba(0, 82, 223, 1)",
    alignItems: "center",
    justifyContent: "center",
  },
  createButtonDisabled: {
    opacity: 0.45,
  },
  createButtonText: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.heading,
    lineHeight: MarketplaceType.stat,
    color: "#FFFFFF",
    fontWeight: 700,
  },
  inputError: {
    borderColor: "#F04438",
    backgroundColor: "#FFF5F5",
  },
  errorText: {
    marginTop: 4,
    fontFamily: Fonts.regular,
    fontSize: 11,
    color: "#F04438",
    lineHeight: 16,
  },
  datePicker: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#EEF2F6",
    backgroundColor: "rgba(249,250,251,1)",
    paddingHorizontal: 14,
  },
  datePickerFilled: {
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
  },
  datePickerText: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: "#9CA3AF",
  },
  datePickerTextFilled: {
    color: "#111827",
    fontFamily: Fonts.medium,
  },
  dateModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  dateModalSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
  },
  dateModalToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  dateModalTitle: {
    fontFamily: Fonts.bold,
    fontSize: 15,
    color: "#111827",
  },
  dateModalCancel: {
    fontFamily: Fonts.regular,
    fontSize: 15,
    color: "#6B7280",
  },
  dateModalDone: {
    fontFamily: Fonts.bold,
    fontSize: 15,
    color: "#0052DF",
  },
  businessPill: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 14,
  },
  businessPillEmpty: {
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
  },
  businessPillText: {
    flex: 1,
    fontFamily: Fonts.medium,
    fontSize: MarketplaceType.caption,
    color: "#1D4ED8",
  },
  pendingBadge: {
    borderRadius: 999,
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pendingBadgeText: {
    fontFamily: Fonts.medium,
    fontSize: 10,
    color: "#92400E",
  },
});
