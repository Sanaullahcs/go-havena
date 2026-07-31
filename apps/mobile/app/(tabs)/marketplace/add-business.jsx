import React, { useState, useEffect, useMemo, useRef } from "react";
import { MarketplaceType } from "../../../constants/marketplace-type";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { Fonts } from "../../../constants/font";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import KeyboardSafeScreen, {
  useScrollFieldIntoView,
} from "../../../components/layout/keyboard-safe-screen";
import { pickImage } from "../../../utils/pickImage";
import { useSubmitLock } from "../../../hooks/use-submit-lock";
import { useTouchedFieldErrors } from "../../../hooks/use-touched-field-errors";
import { useApiAction } from "../../../hooks/use-api-action";
import {
  fetchBusiness,
  fetchMyBusiness,
  publishBusinessWithImage,
  updateBusiness,
} from "../../../services/businesses-api";
import BusinessPhoneInput from "../../../components/ui/business-phone-input";
import BusinessHoursInput from "../../../components/ui/business-hours-input";
import { DEFAULT_PHONE_COUNTRY } from "../../../constants/phone-countries";
import { MarketplaceRoutes } from "../../../constants/marketplace-routes";
import { getCurrentRole } from "../../../constants/role-session";
import { getUser } from "../../../services/auth-session";
import { isValidPhone } from "../../../utils/phone";
import { validateBusinessForm, LIMITS, hasFieldErrors } from "../../../utils/form-validation";

export default function AddBusinessScreen() {
  const router = useRouter();
  const { editId } = useLocalSearchParams();
  const businessId = editId ? Number(editId) : null;
  const isEdit = Boolean(businessId);

  const [business, setBusiness] = useState("");
  const [category, setCategory] = useState("");
  const [address, setAddress] = useState("");
  const [phoneDigits, setPhoneDigits] = useState("");
  const [phoneCountry, setPhoneCountry] = useState(DEFAULT_PHONE_COUNTRY);
  const [phoneE164, setPhoneE164] = useState("");
  const [hours, setHours] = useState("");
  const [description, setDescription] = useState("");
  const [amenities, setAmenities] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const { touch, clearError, showError, validateOnSubmit } = useTouchedFieldErrors();
  const [loading, setLoading] = useState(isEdit);
  const [editForbidden, setEditForbidden] = useState(false);
  const scrollRef = useRef(null);
  const descriptionOffsetY = useRef(0);
  const scrollFieldIntoView = useScrollFieldIntoView(scrollRef);
  const { submitting, run } = useSubmitLock();
  const { runAction, showFailure } = useApiAction();

  const maxDescriptionLength = LIMITS.businessDescription;

  useEffect(() => {
    if (businessId) return;
    let cancelled = false;
    (async () => {
      try {
        const mine = await fetchMyBusiness();
        if (!cancelled && mine) {
          setTimeout(() => {
            if (!cancelled) {
              router.replace({
                pathname: MarketplaceRoutes.ADD_BUSINESS,
                params: { editId: String(mine.id) },
              });
            }
          }, 0);
        }
      } catch {
        // allow create form if lookup fails
      }
    })();
    return () => { cancelled = true; };
  }, [businessId, router]);

  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;
    (async () => {
      try {
        const [data, user] = await Promise.all([
          fetchBusiness(businessId),
          getUser(),
        ]);
        if (cancelled) return;

        const isAdmin = getCurrentRole() === "admin";
        const isOwner = Number(data.ownerId) === Number(user?.id);
        if (isAdmin && !isOwner) {
          setEditForbidden(true);
          return;
        }

        setBusiness(data.name ?? "");
        setCategory(data.category ?? "");
        setAddress(data.address ?? "");
        // phone stored as plain string in API — load into digits field
        setPhoneDigits(data.phone ?? "");
        setPhoneE164(data.phone ?? "");
        setHours(data.hours ?? "");
        setDescription(data.description ?? "");
        setAmenities(data.amenities ?? "");
      } catch (err) {
        if (!cancelled) await showFailure("Could not load business", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  const liveErrors = useMemo(
    () =>
      validateBusinessForm(
        { business, category, address, hours, description },
        { phoneDigits, phoneCountry, isValidPhoneFn: isValidPhone },
      ),
    [business, category, address, hours, description, phoneDigits, phoneCountry],
  );

  const canSubmit = useMemo(() => !hasFieldErrors(liveErrors), [liveErrors]);

  const handleSubmit = () => {
    if (submitting) return;
    if (!validateOnSubmit(liveErrors)) return;

    // Store E.164 or national digits — backend accepts either
    const phoneValue = phoneE164 || phoneDigits;

    const payload = {
      name: business.trim(),
      category: category.trim(),
      address: address.trim(),
      phone: phoneValue,
      hours: hours.trim(),
      description: description.trim(),
      amenities: amenities.trim() || undefined,
    };

    run(async () => {
      await runAction({
        action: () =>
          isEdit
            ? updateBusiness(businessId, payload)
            : publishBusinessWithImage(selectedFile, payload),
        successTitle: isEdit ? "Business updated" : "Business submitted",
        successMessage: isEdit
          ? "Your business details were saved."
          : "Your business will appear after admin approval.",
        errorTitle: isEdit ? "Update failed" : "Could not add business",
        onSuccess: () => router.back(),
      });
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["left", "right"]}>
        <InternalScreenHeader title={isEdit ? "Edit Business" : "Add Business"} subtitle="Loading…" />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color="#0052DF" />
        </View>
      </SafeAreaView>
    );
  }

  if (editForbidden) {
    return (
      <SafeAreaView style={styles.container} edges={["left", "right"]}>
        <InternalScreenHeader title="Business Profile" subtitle="View only" />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }}>
          <Text style={{ fontFamily: Fonts.bold, fontSize: 18, textAlign: "center", color: "#111827" }}>
            You cannot edit this business
          </Text>
          <Text style={{ marginTop: 8, fontFamily: Fonts.regular, fontSize: 14, textAlign: "center", color: "#6B7280", lineHeight: 20 }}>
            Admins can approve, reject, re-approve, or delete resident businesses from the business list.
          </Text>
          <TouchableOpacity
            activeOpacity={0.85}
            style={{ marginTop: 20, backgroundColor: "#0052DF", borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12 }}
            onPress={() => router.back()}
          >
            <Text style={{ color: "#FFFFFF", fontFamily: Fonts.bold }}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <InternalScreenHeader
        title={isEdit ? "Edit Business" : "Add Business"}
        subtitle={isEdit ? "Update your business details" : "Add a new local business to the marketplace"}
      />

      <KeyboardSafeScreen
        scrollRef={scrollRef}
        contentContainerStyle={styles.contentContainer}
        footerBorderless
        footerStyle={styles.bottomWrap}
        keyboardFieldGap={40}
        footer={
          <TouchableOpacity
            activeOpacity={0.88}
            style={[styles.createButton, (!canSubmit || submitting) && styles.createButtonDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit || submitting}
          >
            <Text style={styles.createButtonText}>
              {submitting ? "Saving..." : isEdit ? "Save Business" : "Add Business"}
            </Text>
          </TouchableOpacity>
        }
      >
        <Text style={styles.label}>Business Photo</Text>
        <TouchableOpacity
          activeOpacity={0.85}
          style={styles.uploadBox}
          onPress={() =>
            pickImage(setSelectedFile, {
              allowCamera: true,
              allowFile: true,
              promptTitle: "Business photo",
              promptMessage: "Choose Camera, Gallery, or File",
            })
          }
        >
          {selectedFile ? (
            <Image
              source={{ uri: selectedFile.uri }}
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
              <Text style={styles.uploadHint}>Camera · Gallery · File</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={[styles.label, styles.sectionTop]}>
          Business Name <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          value={business}
          onChangeText={(t) => { setBusiness(t); touch("business"); clearError("business"); }}
          placeholder="e.g., The Daily Grind"
          placeholderTextColor="rgba(153, 161, 175, 1)"
          style={[styles.input, showError("business", liveErrors) && styles.inputError]}
        />
        {showError("business", liveErrors) ? <Text style={styles.errorText}>{showError("business", liveErrors)}</Text> : null}

        <Text style={[styles.label, styles.sectionTop]}>
          Category <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          value={category}
          onChangeText={(t) => { setCategory(t); touch("category"); clearError("category"); }}
          placeholder="e.g. Coffee Shop, Fitness, Restaurant"
          placeholderTextColor="rgba(153, 161, 175, 1)"
          style={[styles.input, showError("category", liveErrors) && styles.inputError]}
        />
        {showError("category", liveErrors) ? <Text style={styles.errorText}>{showError("category", liveErrors)}</Text> : null}

        <View
          style={[
            styles.labelRow,
            styles.sectionTop,
            { flexDirection: "row", alignItems: "center", gap: 4 },
          ]}
        >
          <Image
            source={require("../../../assets/images/black-location.png")}
            style={{ width: 16, height: 16 }}
          />
          <Text style={styles.label}>
            Address <Text style={styles.required}>*</Text>
          </Text>
        </View>
        <TextInput
          value={address}
          onChangeText={(t) => { setAddress(t); touch("address"); clearError("address"); }}
          placeholder="123 Main Street, Miami, FL 33101"
          placeholderTextColor="rgba(153, 161, 175, 1)"
          style={[styles.input, showError("address", liveErrors) && styles.inputError]}
        />
        {showError("address", liveErrors) ? <Text style={styles.errorText}>{showError("address", liveErrors)}</Text> : null}

        <Text style={[styles.label, styles.sectionTop]}>
          Phone Number <Text style={styles.required}>*</Text>
        </Text>
        <BusinessPhoneInput
          value={phoneDigits}
          country={phoneCountry}
          showError={!!showError("phone", liveErrors)}
          onChangePhone={({ digits, country, e164 }) => {
            setPhoneDigits(digits);
            setPhoneCountry(country);
            setPhoneE164(e164 ?? "");
            touch("phone");
            clearError("phone");
          }}
        />
        {showError("phone", liveErrors) ? <Text style={styles.errorText}>{showError("phone", liveErrors)}</Text> : null}

        <Text style={[styles.label, styles.sectionTop]}>
          Business Hours <Text style={styles.required}>*</Text>
        </Text>
        <BusinessHoursInput
          value={hours}
          onChange={(v) => { setHours(v); touch("hours"); clearError("hours"); }}
        />
        {showError("hours", liveErrors) ? <Text style={styles.errorText}>{showError("hours", liveErrors)}</Text> : null}

        <View
          onLayout={(e) => {
            descriptionOffsetY.current = e.nativeEvent.layout.y;
          }}
        >
          <Text style={[styles.label, styles.sectionTop]}>
            Description <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            value={description}
            onChangeText={(t) => {
              setDescription(t);
              touch("description");
              clearError("description");
            }}
            placeholder="Tell customers about your business..."
            placeholderTextColor="rgba(153, 161, 175, 1)"
            style={[styles.textArea, showError("description", liveErrors) && styles.inputError]}
            multiline
            maxLength={maxDescriptionLength}
            textAlignVertical="top"
            onFocus={() => scrollFieldIntoView(descriptionOffsetY.current)}
          />
          {showError("description", liveErrors) ? (
            <Text style={styles.errorText}>{showError("description", liveErrors)}</Text>
          ) : null}
          <Text style={styles.counterText}>
            {description.length}/{maxDescriptionLength}
          </Text>
        </View>

        <Text style={[styles.label, styles.sectionTop]}>
          Amenities (comma separated)
        </Text>
        <TextInput
          value={amenities}
          onChangeText={setAmenities}
          placeholder="WiFi, Outdoor Seating, Takeout, Pet Friendly"
          placeholderTextColor="rgba(153, 161, 175, 1)"
          style={styles.input}
          // Last field: scroll to end so it sits just above the CTA (no dead gap).
          onFocus={() => scrollFieldIntoView()}
        />
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
  uploadText: {
    fontFamily: Fonts.medium,
    fontSize: MarketplaceType.body,
    lineHeight: MarketplaceType.headingLine,
    color: "rgba(106, 114, 130, 1)",
    fontWeight: 500,
  },
  uploadHint: {
    fontFamily: Fonts.regular,
    fontSize: 11,
    lineHeight: 14,
    color: "#94A3B8",
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
    paddingTop: 8,
    paddingBottom: 0,
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
});
