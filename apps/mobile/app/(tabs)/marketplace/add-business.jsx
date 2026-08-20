import React, { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { MarketplaceType } from "../../../constants/marketplace-type";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from "react-native";
import LocaleTextInput from "../../../components/ui/locale-text-input";
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
  const { t } = useTranslation();
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
        setPhoneDigits(data.phone ?? "");
        setPhoneE164(data.phone ?? "");
        setHours(data.hours ?? "");
        setDescription(data.description ?? "");
        setAmenities(data.amenities ?? "");
      } catch (err) {
        if (!cancelled) await showFailure(t("marketplace.couldNotLoadBusiness"), err);
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
        successTitle: isEdit ? t("marketplace.businessUpdated") : t("marketplace.businessSubmitted"),
        successMessage: isEdit
          ? t("marketplace.businessDetailsSaved")
          : t("marketplace.businessAfterApproval"),
        errorTitle: isEdit ? t("marketplace.updateFailed") : t("marketplace.couldNotAddBusiness"),
        onSuccess: () => router.back(),
      });
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["left", "right"]}>
        <InternalScreenHeader title={isEdit ? t("marketplace.editBusiness") : t("marketplace.addBusiness")} subtitle={t("common.loading")} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color="#0A2A43" />
        </View>
      </SafeAreaView>
    );
  }

  if (editForbidden) {
    return (
      <SafeAreaView style={styles.container} edges={["left", "right"]}>
        <InternalScreenHeader title={t("marketplace.businessProfile")} subtitle={t("marketplace.viewOnly")} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }}>
          <Text style={{ fontFamily: Fonts.bold, fontSize: 18, textAlign: "center", color: "#111827" }}>
            {t("marketplace.cannotEditBusiness")}
          </Text>
          <Text style={{ marginTop: 8, fontFamily: Fonts.regular, fontSize: 14, textAlign: "center", color: "#6B7280", lineHeight: 20 }}>
            {t("marketplace.adminEditHint")}
          </Text>
          <TouchableOpacity
            activeOpacity={0.85}
            style={{ marginTop: 20, backgroundColor: "#0A2A43", borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12 }}
            onPress={() => router.back()}
          >
            <Text style={{ color: "#FFFFFF", fontFamily: Fonts.bold }}>{t("marketplace.goBack")}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <InternalScreenHeader
        title={isEdit ? t("marketplace.editBusiness") : t("marketplace.addBusiness")}
        subtitle={isEdit ? t("marketplace.updateBusinessSubtitle") : t("marketplace.addBusinessSubtitle")}
      />

      <KeyboardSafeScreen
        scrollRef={scrollRef}
        keyboardAvoiding={Platform.OS === "ios"}
        footerKeyboardLift={false}
        contentContainerStyle={styles.contentContainer}
        footerBorderless
        footerStyle={styles.bottomWrap}
        keyboardFieldGap={24}
        footer={
          <TouchableOpacity
            activeOpacity={0.88}
            style={[styles.createButton, (!canSubmit || submitting) && styles.createButtonDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit || submitting}
          >
            <Text style={styles.createButtonText}>
              {submitting ? t("marketplace.saving") : isEdit ? t("marketplace.saveBusiness") : t("marketplace.addBusiness")}
            </Text>
          </TouchableOpacity>
        }
      >
        <Text style={styles.label}>{t("marketplace.businessPhoto")}</Text>
        <TouchableOpacity
          activeOpacity={0.85}
          style={styles.uploadBox}
          onPress={() =>
            pickImage(setSelectedFile, {
              allowCamera: true,
              allowFile: true,
              promptTitle: t("marketplace.businessPhotoPrompt"),
              promptMessage: t("marketplace.businessPhotoPromptMsg"),
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
              <Text style={styles.uploadText}>{t("marketplace.uploadImage")}</Text>
              <Text style={styles.uploadHint}>{t("marketplace.cameraGalleryFile")}</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={[styles.label, styles.sectionTop]}>
          {t("marketplace.businessName")} <Text style={styles.required}>*</Text>
        </Text>
        <LocaleTextInput
          value={business}
          onChangeText={(v) => { setBusiness(v); touch("business"); clearError("business"); }}
          placeholder={t("marketplace.placeholderBusinessName")}
          placeholderTextColor="rgba(153, 161, 175, 1)"
          style={[styles.input, showError("business", liveErrors) && styles.inputError]}
        />
        {showError("business", liveErrors) ? <Text style={styles.errorText}>{showError("business", liveErrors)}</Text> : null}

        <Text style={[styles.label, styles.sectionTop]}>
          {t("marketplace.category")} <Text style={styles.required}>*</Text>
        </Text>
        <LocaleTextInput
          value={category}
          onChangeText={(v) => { setCategory(v); touch("category"); clearError("category"); }}
          placeholder={t("marketplace.placeholderCategory")}
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
            {t("marketplace.address")} <Text style={styles.required}>*</Text>
          </Text>
        </View>
        <LocaleTextInput
          value={address}
          onChangeText={(v) => { setAddress(v); touch("address"); clearError("address"); }}
          placeholder={t("marketplace.placeholderAddress")}
          placeholderTextColor="rgba(153, 161, 175, 1)"
          style={[styles.input, showError("address", liveErrors) && styles.inputError]}
        />
        {showError("address", liveErrors) ? <Text style={styles.errorText}>{showError("address", liveErrors)}</Text> : null}

        <Text style={[styles.label, styles.sectionTop]}>
          {t("marketplace.phoneNumber")} <Text style={styles.required}>*</Text>
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
          {t("marketplace.businessHours")} <Text style={styles.required}>*</Text>
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
            {t("marketplace.description")} <Text style={styles.required}>*</Text>
          </Text>
          <LocaleTextInput
            value={description}
            onChangeText={(v) => {
              setDescription(v);
              touch("description");
              clearError("description");
            }}
            placeholder={t("marketplace.placeholderDescription")}
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
          {t("marketplace.amenitiesCsv")}
        </Text>
        <LocaleTextInput
          value={amenities}
          onChangeText={setAmenities}
          placeholder={t("marketplace.placeholderAmenities")}
          placeholderTextColor="rgba(153, 161, 175, 1)"
          style={styles.input}
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
    backgroundColor: "rgba(20, 184, 166, 1)",
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
