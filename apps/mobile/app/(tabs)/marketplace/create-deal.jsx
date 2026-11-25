import React, { useCallback, useState, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { MarketplaceType } from "../../../constants/marketplace-type";
import { MARKETPLACE_FORM_GUTTER } from "../../../constants/marketplace-theme";
import {
  marketplaceFieldInput,
  marketplaceTextArea,
} from "../../../constants/marketplace-form-fields";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Platform } from "react-native";
import LocaleTextInput from "../../../components/ui/locale-text-input";
import { Image } from "expo-image";
import CrispImage from "../../../components/ui/crisp-image";
import { Fonts } from "../../../constants/font";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { Ionicons } from "@expo/vector-icons";
import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import KeyboardSafeScreen, {
  useScrollFieldRefIntoView,
} from "../../../components/layout/keyboard-safe-screen";
import { getCurrentRole } from "../../../constants/role-session";
import { pickImage } from "../../../utils/pickImage";
import { useSubmitLock } from "../../../hooks/use-submit-lock";
import { useTouchedFieldErrors } from "../../../hooks/use-touched-field-errors";
import { useApiAction } from "../../../hooks/use-api-action";
import { publishDealWithImage, updateDeal, fetchDeal, uploadDealMenuAssets } from "../../../services/deals-api";
import { fetchMyBusiness } from "../../../services/businesses-api";
import { dateOnly, formatDisplayDate, toApiDate } from "../../../utils/form-datetime";
import FormDatePickerSheet from "../../../components/forms/form-date-picker-sheet";
import { validateDealForm, LIMITS, hasFieldErrors } from "../../../utils/form-validation";
import { menuItemsFromApi } from "../../../utils/deal-menu";
import DealMenuEditor from "../../../components/marketplace/deal-menu-editor";

export default function CreateDeal() {
  const router = useRouter();
  const { t } = useTranslation();
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
  const [selectedFile, setSelectedFile] = useState(null);
  const [existingImageUrl, setExistingImageUrl] = useState(null);
  const [step, setStep] = useState("details");
  const [menuImageFile, setMenuImageFile] = useState(null);
  const [menuImageUrl, setMenuImageUrl] = useState(null);
  const [menuItems, setMenuItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const { touch, clearError, showError, validateOnSubmit } = useTouchedFieldErrors();
  const scrollRef = useRef(null);
  const menuEditorRef = useRef(null);
  const dealTitleRef = useRef(null);
  const discountRef = useRef(null);
  const categoryRef = useRef(null);
  const locationRef = useRef(null);
  const descriptionBlockRef = useRef(null);
  const [footerHeight, setFooterHeight] = useState(88);
  const { scrollIntoView, onScroll, clearPending } = useScrollFieldRefIntoView(scrollRef, {
    footerHeight,
    topPad: 24,
  });
  const keepFieldVisible = useCallback(
    (fieldRef) => {
      scrollIntoView(fieldRef);
    },
    [scrollIntoView],
  );
  const descriptionFocusedRef = useRef(false);
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
              const d = dateOnly(String(data.endsAt).replace(" ", "T"));
              if (d) setValidUntilDate(d);
            }
            if (data.imageUrl) {
              setExistingImageUrl(data.imageUrl);
            }
            setMenuImageUrl(data.menuImageUrl ?? null);
            setMenuItems(menuItemsFromApi(data.menuItems));
          }
        }
      } catch (err) {
        if (!cancelled) await showFailure(t("deals.couldNotLoadData"), err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [dealId, isAdmin]);

  const previewTitle = dealTitle.trim() || t("deals.yourDealTitle");
  const previewDescription = description.trim() || t("deals.yourDealDescription");
  const previewDiscount = discountLabel.trim() || t("deals.discount");

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
        { businessStatus: ownBusiness?.status, isAdmin },
      ),
    [dealTitle, discountLabel, category, description, ownBusiness, business, selectedFile, existingImageUrl, isAdmin],
  );

  const canSubmit = useMemo(() => !hasFieldErrors(liveErrors), [liveErrors]);

  const blockIfBusinessNotReady = () => {
    if (!isAdmin && ownBusiness?.status === "rejected") {
      Alert.alert(
        t("deals.businessRejectedTitle"),
        t("deals.businessRejectedMsg"),
      );
      return true;
    }
    if (!isAdmin && ownBusiness?.status === "pending") {
      Alert.alert(
        t("deals.businessPendingTitle"),
        t("deals.businessPendingMsg"),
      );
      return true;
    }
    return false;
  };

  const goToMenuStep = () => {
    if (submitting) return;
    if (!validateOnSubmit(liveErrors)) return;
    if (blockIfBusinessNotReady()) return;
    setDatePickerOpen(false);
    setStep("menu");
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: false }));
  };

  const goToDetailsStep = () => {
    if (submitting) return;
    setStep("details");
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: false }));
  };

  const handleCreate = () => {
    if (submitting) return;
    if (!validateOnSubmit(liveErrors)) return;
    if (blockIfBusinessNotReady()) return;

    const pendingMenu = menuEditorRef.current?.flushPending?.() ?? { ok: true, items: menuItems };
    if (!pendingMenu.ok) return;

    const endsAt = toApiDate(validUntilDate);
    const itemsToPublish = pendingMenu.items ?? menuItems;

    run(async () => {
      await runAction({
        action: async () => {
          const menu = await uploadDealMenuAssets(
            {
              menuImageFile,
              existingMenuImageUrl: menuImageUrl,
              items: itemsToPublish,
            },
            { asAdmin: isAdmin },
          );

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
            menu_image_url: menu.menu_image_url,
            menu_items: menu.menu_items,
          };

          return isEdit
            ? updateDeal(dealId, payload, { asAdmin: isAdmin })
            : publishDealWithImage(selectedFile, payload, { asAdmin: isAdmin });
        },
        successTitle: isEdit ? t("deals.dealUpdated") : t("deals.dealPublished"),
        successMessage: isEdit ? t("deals.dealSaved") : t("deals.dealLive"),
        errorTitle: isEdit ? t("deals.updateFailed") : t("deals.couldNotCreateDeal"),
        onSuccess: () => router.back(),
      });
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["left", "right"]}>
        <InternalScreenHeader title={isEdit ? t("deals.editDeal") : t("deals.createDeal")} subtitle={t("common.loading")} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color="#1B4F8A" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <InternalScreenHeader
        title={step === "menu" ? t("deals.addMenu") : isEdit ? t("deals.editDeal") : t("deals.createDeal")}
        subtitle={
          step === "menu"
            ? t("deals.addMenuSubtitle")
            : isEdit
              ? t("deals.updateDealSubtitle")
              : t("deals.addDealSubtitle")
        }
      />

      <KeyboardSafeScreen
        scrollRef={scrollRef}
        keyboardAvoiding={Platform.OS === "ios"}
        contentContainerStyle={styles.contentContainer}
        footerBorderless
        footerStyle={styles.bottomWrap}
        keyboardFieldGap={footerHeight}
        dismissKeyboardOnPress
        onFooterHeight={(next) => {
          setFooterHeight((prev) => (Math.abs(prev - next) < 2 ? prev : next));
        }}
        scrollProps={{ onScroll, scrollEventThrottle: 16 }}
        footer={
          step === "menu" ? (
            <View style={styles.footerActions}>
              <TouchableOpacity
                activeOpacity={0.88}
                style={[styles.backButton, submitting && styles.createButtonDisabled]}
                onPress={goToDetailsStep}
                disabled={submitting}
              >
                <Text style={styles.backButtonText}>{t("common.back")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.88}
                style={[styles.createButton, (!canSubmit || submitting) && styles.createButtonDisabled]}
                onPress={handleCreate}
                disabled={!canSubmit || submitting}
              >
                <Text style={styles.createButtonText}>
                  {submitting ? t("deals.saving") : isEdit ? t("deals.saveDeal") : t("deals.createDeal")}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              activeOpacity={0.88}
              style={[styles.createButton, (!canSubmit || submitting) && styles.createButtonDisabled]}
              onPress={goToMenuStep}
              disabled={!canSubmit || submitting}
            >
              <Text style={styles.createButtonText}>{t("deals.next")}</Text>
            </TouchableOpacity>
          )
        }
      >
        {step === "menu" ? (
          <DealMenuEditor
            ref={menuEditorRef}
            menuImageFile={menuImageFile}
            menuImageUrl={menuImageUrl}
            onChangeMenuImage={(file) => {
              setMenuImageFile(file);
              setMenuImageUrl(null);
            }}
            onRemoveMenuImage={() => {
              setMenuImageFile(null);
              setMenuImageUrl(null);
            }}
            items={menuItems}
            onChangeItems={setMenuItems}
            onFieldFocus={keepFieldVisible}
            onFieldBlur={clearPending}
          />
        ) : (
          <>
        <Text style={styles.label}>
          {t("deals.dealImage")} <Text style={styles.required}>*</Text>
        </Text>
        <TouchableOpacity
          activeOpacity={0.85}
          style={[styles.uploadBox, showError("image", liveErrors) && styles.uploadBoxError]}
          onPress={() => {
            pickImage(
              (file) => {
                setSelectedFile(file);
                touch("image");
                clearError("image");
              },
              {
                allowCamera: true,
                allowFile: true,
                documentPick: true,
                uploadBaseName: "deal-cover",
                promptTitle: t("deals.dealImage"),
                promptMessage: t("deals.uploadImage"),
              },
            );
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
              <Text style={styles.uploadText}>{t("deals.uploadImage")}</Text>
            </>
          )}
        </TouchableOpacity>
        {showError("image", liveErrors) ? <Text style={styles.errorText}>{showError("image", liveErrors)}</Text> : null}

        <Text style={[styles.label, styles.sectionTop]}>
          {t("deals.business")} <Text style={styles.required}>*</Text>
        </Text>
        <View style={[styles.businessPill, !ownBusiness && styles.businessPillEmpty]}>
          <Image
            source={require("../../../assets/images/over-business.png")}
            style={{ width: 16, height: 16 }}
          />
          <Text style={styles.businessPillText} numberOfLines={1}>
            {business || t("deals.noBusinessRegistered")}
          </Text>
          {ownBusiness?.status === "pending" ? (
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingBadgeText}>{t("deals.pendingApproval")}</Text>
            </View>
          ) : null}
        </View>
        {showError("business", liveErrors) ? <Text style={styles.errorText}>{showError("business", liveErrors)}</Text> : null}

        <View ref={dealTitleRef} collapsable={false}>
        <Text style={[styles.label, styles.sectionTop]}>
          {t("deals.dealTitle")} <Text style={styles.required}>*</Text>
        </Text>
        <LocaleTextInput
          value={dealTitle}
          onChangeText={(v) => { setDealTitle(v); touch("dealTitle"); clearError("dealTitle"); }}
          placeholder={t("deals.placeholderTitle")}
          placeholderTextColor="rgba(153, 161, 175, 1)"
          style={[styles.field, marketplaceFieldInput, showError("dealTitle", liveErrors) && styles.inputError]}
          onFocus={() => keepFieldVisible(dealTitleRef)}
          onBlur={clearPending}
        />
        {showError("dealTitle", liveErrors) ? <Text style={styles.errorText}>{showError("dealTitle", liveErrors)}</Text> : null}
        </View>

        <View ref={discountRef} collapsable={false}>
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
            {t("deals.discountLabel")} <Text style={styles.required}>*</Text>
          </Text>
        </View>
        <LocaleTextInput
          value={discountLabel}
          onChangeText={(v) => { setDiscountLabel(v); touch("discountLabel"); clearError("discountLabel"); }}
          placeholder={t("deals.placeholderDiscount")}
          placeholderTextColor="rgba(153, 161, 175, 1)"
          style={[styles.field, marketplaceFieldInput, showError("discountLabel", liveErrors) && styles.inputError]}
          onFocus={() => keepFieldVisible(discountRef)}
          onBlur={clearPending}
        />
        {showError("discountLabel", liveErrors) ? <Text style={styles.errorText}>{showError("discountLabel", liveErrors)}</Text> : null}
        </View>

        <View ref={categoryRef} collapsable={false}>
        <Text style={[styles.label, styles.sectionTop]}>
          {t("deals.category")} <Text style={styles.required}>*</Text>
        </Text>
        <LocaleTextInput
          value={category}
          onChangeText={(v) => { setCategory(v); touch("category"); clearError("category"); }}
          placeholder={t("deals.placeholderCategory")}
          placeholderTextColor="rgba(153, 161, 175, 1)"
          style={[styles.field, marketplaceFieldInput, showError("category", liveErrors) && styles.inputError]}
          onFocus={() => keepFieldVisible(categoryRef)}
          onBlur={clearPending}
        />
        {showError("category", liveErrors) ? <Text style={styles.errorText}>{showError("category", liveErrors)}</Text> : null}
        </View>

        <View ref={locationRef} collapsable={false}>
        <Text style={[styles.label, styles.sectionTop]}>{t("deals.location")}</Text>
        <LocaleTextInput
          value={location}
          onChangeText={setLocation}
          placeholder={t("deals.placeholderLocation")}
          placeholderTextColor="rgba(153, 161, 175, 1)"
          style={[styles.field, marketplaceFieldInput]}
          onFocus={() => keepFieldVisible(locationRef)}
          onBlur={clearPending}
        />
        </View>

        <View ref={descriptionBlockRef} collapsable={false}>
          <Text style={[styles.label, styles.sectionTop]}>
            {t("deals.description")} <Text style={styles.required}>*</Text>
          </Text>
          <LocaleTextInput
            value={description}
            onChangeText={(v) => { setDescription(v); touch("description"); clearError("description"); }}
            placeholder={t("deals.placeholderDescription")}
            placeholderTextColor="rgba(153, 161, 175, 1)"
            style={[
              styles.field,
              marketplaceTextArea,
              showError("description", liveErrors) && styles.inputError,
            ]}
            multiline
            scrollEnabled
            maxLength={maxDescriptionLength}
            textAlignVertical="top"
            onFocus={() => {
              descriptionFocusedRef.current = true;
              keepFieldVisible(descriptionBlockRef);
            }}
            onBlur={() => {
              descriptionFocusedRef.current = false;
              clearPending();
            }}
            onContentSizeChange={() => {
              if (descriptionFocusedRef.current) keepFieldVisible(descriptionBlockRef);
            }}
          />
          {showError("description", liveErrors) ? <Text style={styles.errorText}>{showError("description", liveErrors)}</Text> : null}
          <Text style={styles.counterText}>
            {description.length}/{maxDescriptionLength}
          </Text>
        </View>

        <Text style={[styles.label, styles.sectionTop]}>
          {t("deals.validUntil")}
        </Text>
        <TouchableOpacity
          activeOpacity={0.75}
          style={[styles.datePicker, validUntilDate && styles.datePickerFilled]}
          onPress={() => setDatePickerOpen(true)}
        >
          <Ionicons
            name="calendar-outline"
            size={16}
            color={validUntilDate ? "#1B4F8A" : "#9CA3AF"}
          />
          <Text style={[styles.datePickerText, validUntilDate && styles.datePickerTextFilled]}>
            {formatDisplayDate(validUntilDate) || t("deals.selectExpiryDate")}
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

        <FormDatePickerSheet
          visible={datePickerOpen}
          value={validUntilDate}
          title={t("deals.expiryDate")}
          minimumDate={dateOnly(new Date())}
          onCancel={() => setDatePickerOpen(false)}
          onConfirm={(next) => {
            setValidUntilDate(next);
            setDatePickerOpen(false);
          }}
        />

        <View style={styles.previewCard}>
          <Text style={styles.previewLabel}>{t("deals.preview")}</Text>
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
          </>
        )}
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
    paddingHorizontal: MARKETPLACE_FORM_GUTTER,
    paddingTop: 24,
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
  field: {
    marginTop: 8,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
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
    paddingHorizontal: MARKETPLACE_FORM_GUTTER,
    paddingTop: 12,
    paddingBottom: 4,
    backgroundColor: "#FFFFFF",
  },
  footerActions: {
    gap: 10,
  },
  backButton: {
    height: 56,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  backButtonText: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.heading,
    lineHeight: MarketplaceType.stat,
    color: "#111827",
    fontWeight: 700,
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
    borderColor: "rgba(20, 184, 166, 0.28)",
    backgroundColor: "#D1FAF5",
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
  businessPill: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "rgba(20, 184, 166, 0.28)",
    backgroundColor: "#D1FAF5",
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
    color: "#1B4F8A",
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
