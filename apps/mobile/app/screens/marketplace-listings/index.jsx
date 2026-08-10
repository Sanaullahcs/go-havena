import React, { useState, useEffect, useMemo } from "react";
import { MarketplaceType } from "../../../constants/marketplace-type";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../../constants/font";
import { Feather } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import KeyboardSafeScreen from "../../../components/layout/keyboard-safe-screen";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSubmitLock } from "../../../hooks/use-submit-lock";
import {
  publishListingWithImages,
  updateListingWithImages,
  fetchListing,
  normalizeListingType,
} from "../../../services/listings-api";
import { useApiAction } from "../../../hooks/use-api-action";
import { pickImages } from "../../../utils/pickImage";
import { MAX_LISTING_PHOTOS } from "../../../constants/listing-photos";
import {
  DEFAULT_LISTING_CONDITION,
  LISTING_CONDITIONS,
} from "../../../constants/listing-conditions";
import {
  ITEM_CATEGORY_SUGGESTIONS,
  SERVICE_CATEGORY_SUGGESTIONS,
} from "../../../constants/listing-categories";
import { hasFieldErrors, LIMITS, validateListingForm } from "../../../utils/form-validation";
import { useTouchedFieldErrors } from "../../../hooks/use-touched-field-errors";
import ListingTypePicker from "../../../components/marketplace/listing-type-picker";
import { MarketplaceTheme as M } from "../../../constants/marketplace-theme";
import CrispImage from "../../../components/ui/crisp-image";
import { useInputLocale } from "../../../hooks/use-input-locale";

const MAX_PHOTOS = MAX_LISTING_PHOTOS;

export default function CreateListingScreen() {
  const { t } = useTranslation();
  const inputLocale = useInputLocale();
  const router = useRouter();
  const { editId, type: typeParam } = useLocalSearchParams();
  const listingId = editId ? String(editId) : null;
  const isEditing = Boolean(listingId);

  const { submitting, run } = useSubmitLock();
  const { runAction, showFailure, showSuccess } = useApiAction();
  const [loadingExisting, setLoadingExisting] = useState(isEditing);
  const [listingType, setListingType] = useState("item");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("");
  const [condition, setCondition] = useState(DEFAULT_LISTING_CONDITION);
  const [location, setLocation] = useState("");
  const [photos, setPhotos] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(null);
  const { touch, clearError, showError, validateOnSubmit } = useTouchedFieldErrors();

  const liveErrors = useMemo(
    () =>
      validateListingForm(
        { title, description, price, category, condition, location, photos },
        { listingType },
      ),
    [title, description, price, category, condition, location, photos, listingType],
  );

  const canPost = useMemo(() => !hasFieldErrors(liveErrors), [liveErrors]);

  useEffect(() => {
    if (!listingId) return;

    let cancelled = false;
    (async () => {
      setLoadingExisting(true);
      try {
        const listing = await fetchListing(listingId);
        if (cancelled || !listing) return;

        const apiType = normalizeListingType(listing.type);
        setListingType(apiType === "service" ? "service" : "item");
        setTitle(listing.title ?? "");
        setDescription(listing.description ?? "");
        setPrice(listing.price != null ? String(listing.price) : "");
        setCategory(listing.category ?? "");
        setCondition(listing.condition ?? DEFAULT_LISTING_CONDITION);
        setLocation(listing.location ?? "");
        setPhotos(
          (listing.images ?? []).map((uri) => ({
            uri,
            existing: true,
          })),
        );
      } catch {
        if (!cancelled) {
          showFailure(t("marketplace.couldNotLoadListing"), {
            message: t("marketplace.listingMayBeRemoved"),
          });
          router.back();
        }
      } finally {
        if (!cancelled) setLoadingExisting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [listingId, router, showFailure]);

  useEffect(() => {
    if (listingId) return;
    const nextType = String(typeParam ?? "").toLowerCase();
    if (nextType === "service" || nextType === "item") {
      setListingType(nextType);
    }
  }, [listingId, typeParam]);

  const isService = listingType === "service";
  const categorySuggestions = isService
    ? SERVICE_CATEGORY_SUGGESTIONS
    : ITEM_CATEGORY_SUGGESTIONS;

  const handleAddPhoto = () => {
    if (photos.length >= MAX_PHOTOS) {
      showFailure(t("marketplace.limitReached"), { message: t("marketplace.maxPhotosMsg", { max: MAX_PHOTOS }) });
      return;
    }
    pickImages(
      (assets) => {
        setPhotos((prev) => [...prev, ...assets].slice(0, MAX_PHOTOS));
      },
      {
        showError: (title, m) => showFailure(title, { message: m }),
        max: MAX_PHOTOS,
        currentCount: photos.length,
      },
    );
  };

  const handleRemovePhoto = (index) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePost = () => {
    if (!validateOnSubmit(liveErrors)) return;
    if (submitting) return;

    run(async () => {
      setUploadProgress(photos.length ? { done: 0, total: photos.length } : null);
      const payload = {
        title: title.trim(),
        description: description.trim(),
        price: parseFloat(price),
        type: listingType,
        category: category.trim(),
        location: location.trim() || undefined,
        condition: listingType === "item" ? condition : undefined,
      };

      try {
        await runAction({
          action: () =>
            isEditing
              ? updateListingWithImages(listingId, photos, payload, {
                  onProgress: setUploadProgress,
                })
              : publishListingWithImages(photos, payload, {
                  onProgress: setUploadProgress,
                }),
          silentSuccess: true,
          errorTitle: isEditing ? t("marketplace.couldNotUpdateListing") : t("marketplace.couldNotPostListing"),
          onSuccess: async (result) => {
            const status = result?.data?.status ?? result?.status;
            if (isEditing) {
              await showSuccess(
                t("marketplace.listingUpdated"),
                status === "approved"
                  ? t("marketplace.changesLive")
                  : t("marketplace.changesForReview"),
              );
            } else {
              await showSuccess(
                isService ? t("marketplace.servicePosted") : t("marketplace.listed"),
                status === "approved"
                  ? isService
                    ? t("marketplace.serviceLive")
                    : t("marketplace.listingLive")
                  : isService
                    ? t("marketplace.serviceForReview")
                    : t("marketplace.listingForReview"),
              );
            }
            router.back();
          },
        });
      } finally {
        setUploadProgress(null);
      }
    });
  };

  if (loadingExisting) {
    return (
      <SafeAreaView style={styles.container} edges={["left", "right"]}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={M.teal} />
        </View>
      </SafeAreaView>
    );
  }

  const ctaLabel = uploadProgress
    ? t("marketplace.uploadingProgress", { done: uploadProgress.done, total: uploadProgress.total })
    : submitting
      ? isEditing
        ? t("marketplace.savingSubmit")
        : t("marketplace.postingSubmit")
      : isEditing
        ? t("marketplace.saveChanges")
        : isService
          ? t("marketplace.postService")
          : t("marketplace.postListing");

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <InternalScreenHeader
        title={
          isEditing
            ? t("marketplace.editListing")
            : isService
              ? t("marketplace.offerService")
              : t("marketplace.sellAnItem")
        }
        subtitle={
          isEditing
            ? t("marketplace.updateListingSubtitle")
            : isService
              ? t("marketplace.postServiceSubtitle")
              : t("marketplace.listForCommunity")
        }
      />

      <KeyboardSafeScreen
        contentContainerStyle={styles.content}
        footerBorderless
        footerStyle={styles.bottomWrap}
        footer={
          <TouchableOpacity
            activeOpacity={0.88}
            style={[styles.postButton, (!canPost || submitting) && styles.postButtonDisabled]}
            onPress={handlePost}
            disabled={!canPost || submitting}
          >
            <Text style={styles.postButtonText}>{ctaLabel}</Text>
          </TouchableOpacity>
        }
      >
        <ListingTypePicker
          value={listingType}
          onChange={setListingType}
          disabled={isEditing}
        />

        <View style={styles.sectionTop}>
          <View style={styles.rowBetween}>
            <Text style={styles.label}>{t("marketplace.photos")}</Text>
            <Text style={styles.meta}>{photos.length}/{MAX_PHOTOS}</Text>
          </View>

          <View style={styles.photosRow}>
            {photos.map((photo, index) => (
              <View key={`${photo.uri}-${index}`} style={styles.photoThumb}>
                <CrispImage
                  source={photo.uri}
                  style={styles.photoImage}
                  contentFit="cover"
                />
                {index === 0 ? (
                  <View style={styles.coverBadge}>
                    <Text style={styles.coverBadgeText}>{t("marketplace.cover")}</Text>
                  </View>
                ) : null}
                <TouchableOpacity
                  style={styles.removeBtn}
                  activeOpacity={0.85}
                  onPress={() => handleRemovePhoto(index)}
                  hitSlop={6}
                >
                  <Feather name="x" size={12} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            ))}

            {photos.length < MAX_PHOTOS ? (
              <TouchableOpacity
                activeOpacity={0.85}
                style={[styles.addPhoto, photos.length === 0 && styles.addPhotoEmpty]}
                onPress={handleAddPhoto}
              >
                <Feather name="camera" size={20} color={M.textMuted} />
                <Text style={styles.addPhotoText}>
                  {photos.length === 0 ? t("marketplace.addPhotos") : t("marketplace.addMore")}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <Text style={styles.helper}>
            {t("marketplace.photoCoverHint")}
          </Text>
        </View>

        <Text style={[styles.label, styles.sectionTop]}>
          {t("marketplace.title_label")} <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          value={title}
          onChangeText={(v) => {
            setTitle(v);
            clearError("title");
          }}
          onBlur={() => touch("title")}
          placeholder={
            isService ? "e.g. Lawn mowing & yard cleanup" : "e.g. Vintage dining table"
          }
          placeholderTextColor="#99A1AF"
          style={[styles.input, showError("title", liveErrors) && styles.inputError, inputLocale.style]}
          textAlign={inputLocale.textAlign}
          maxLength={LIMITS.listingTitle}
        />
        {showError("title", liveErrors) ? (
          <Text style={styles.errorText}>{showError("title", liveErrors)}</Text>
        ) : null}

        <Text style={[styles.label, styles.sectionTop]}>
          {t("marketplace.description")} <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          value={description}
          onChangeText={(v) => {
            setDescription(v);
            clearError("description");
          }}
          onBlur={() => touch("description")}
          placeholder={
            isService
              ? t("marketplace.descriptionPlaceholderService")
              : t("marketplace.descriptionPlaceholderItem")
          }
          placeholderTextColor="#99A1AF"
          style={[styles.textArea, showError("description", liveErrors) && styles.inputError, inputLocale.style]}
          textAlign={inputLocale.textAlign}
          multiline
          textAlignVertical="top"
        />
        {showError("description", liveErrors) ? (
          <Text style={styles.errorText}>{showError("description", liveErrors)}</Text>
        ) : null}

        <Text style={[styles.label, styles.sectionTop]}>
          {isService ? t("marketplace.startingPriceUsd") : t("marketplace.priceUsd")}{" "}
          <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          value={price}
          onChangeText={(v) => {
            setPrice(v);
            clearError("price");
          }}
          onBlur={() => touch("price")}
          placeholder={isService ? "25.00" : "0.00"}
          placeholderTextColor="#99A1AF"
          style={[styles.input, showError("price", liveErrors) && styles.inputError]}
          keyboardType="decimal-pad"
        />
        {showError("price", liveErrors) ? (
          <Text style={styles.errorText}>{showError("price", liveErrors)}</Text>
        ) : null}

        <Text style={[styles.label, styles.sectionTop]}>
          {t("marketplace.category")} <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          value={category}
          onChangeText={(v) => {
            setCategory(v);
            clearError("category");
          }}
          onBlur={() => touch("category")}
          placeholder={isService ? "e.g. Cleaning, Tutoring" : "e.g. Furniture, Electronics"}
          placeholderTextColor="#99A1AF"
          style={[styles.input, showError("category", liveErrors) && styles.inputError, inputLocale.style]}
          textAlign={inputLocale.textAlign}
          maxLength={LIMITS.listingCategory}
        />
        {showError("category", liveErrors) ? (
          <Text style={styles.errorText}>{showError("category", liveErrors)}</Text>
        ) : null}
        <View style={styles.chipRow}>
          {categorySuggestions.map((option) => {
            const label = t(option.labelKey);
            const active = category.toLowerCase() === label.toLowerCase();
            return (
              <TouchableOpacity
                key={option.labelKey}
                activeOpacity={0.85}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => {
                  setCategory(label);
                  clearError("category");
                }}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {listingType === "item" ? (
          <>
            <Text style={[styles.label, styles.sectionTop]}>
              {t("marketplace.condition")} <Text style={styles.required}>*</Text>
            </Text>
            <View style={styles.chipRow}>
              {LISTING_CONDITIONS.map((option) => {
                const active = condition === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    activeOpacity={0.9}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => {
                      setCondition(option.value);
                      touch("condition");
                      clearError("condition");
                    }}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {t(option.labelKey)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {showError("condition", liveErrors) ? (
              <Text style={styles.errorText}>{showError("condition", liveErrors)}</Text>
            ) : null}
          </>
        ) : null}

        <Text style={[styles.label, styles.sectionTop]}>{t("marketplace.location")}</Text>
        <TextInput
          value={location}
          onChangeText={(v) => {
            setLocation(v);
            clearError("location");
          }}
          onBlur={() => touch("location")}
          placeholder={
            isService
              ? "e.g. Serving Maple Ridge community"
              : "e.g. Building A lobby"
          }
          placeholderTextColor="#99A1AF"
          style={[styles.input, showError("location", liveErrors) && styles.inputError]}
          maxLength={LIMITS.listingLocation}
        />
        {showError("location", liveErrors) ? (
          <Text style={styles.errorText}>{showError("location", liveErrors)}</Text>
        ) : null}

        <View style={styles.tipCard}>
          <Text style={styles.tipTitle}>{t("marketplace.safetyTips")}</Text>
          <Text style={styles.tipLine}>
            {isService
              ? t("marketplace.safetyTipService")
              : t("marketplace.safetyTipItem")}
          </Text>
        </View>
      </KeyboardSafeScreen>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 28,
  },
  sectionTop: {
    marginTop: 16,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  label: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.body,
    lineHeight: MarketplaceType.bodyLine,
    color: "#111827",
    fontWeight: "700",
  },
  required: {
    color: "#F04438",
  },
  meta: {
    fontFamily: Fonts.medium,
    fontSize: MarketplaceType.caption,
    color: "#6A7282",
  },
  helper: {
    marginTop: 8,
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.caption,
    lineHeight: MarketplaceType.captionLine,
    color: "#6A7282",
  },
  photosRow: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  photoThumb: {
    width: 88,
    height: 88,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#F3F4F6",
    position: "relative",
  },
  photoImage: {
    width: "100%",
    height: "100%",
  },
  coverBadge: {
    position: "absolute",
    left: 6,
    bottom: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "rgba(15,61,95,0.85)",
  },
  coverBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: 9,
    color: "#FFFFFF",
    fontWeight: "700",
  },
  removeBtn: {
    position: "absolute",
    top: 5,
    right: 5,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  addPhoto: {
    width: 88,
    height: 88,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#D1D5DC",
    borderStyle: "dashed",
    backgroundColor: "#F9FAFB",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  addPhotoEmpty: {
    width: "100%",
    height: 108,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#D1D5DC",
  },
  addPhotoText: {
    fontFamily: Fonts.medium,
    fontSize: MarketplaceType.caption,
    color: "#6A7282",
    fontWeight: "500",
  },
  input: {
    marginTop: 8,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#EEF2F6",
    paddingHorizontal: 14,
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.body,
    color: "#111827",
  },
  textArea: {
    marginTop: 8,
    minHeight: 110,
    borderRadius: 10,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#EEF2F6",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.body,
    color: "#111827",
  },
  chipRow: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  chipActive: {
    borderColor: M.teal,
    backgroundColor: M.mint,
  },
  chipText: {
    fontFamily: Fonts.medium,
    fontSize: MarketplaceType.caption,
    color: "#4B5563",
    fontWeight: "500",
  },
  chipTextActive: {
    fontFamily: Fonts.bold,
    color: M.navy,
    fontWeight: "700",
  },
  tipCard: {
    marginTop: 20,
    borderRadius: 12,
    backgroundColor: M.mint,
    padding: 14,
    gap: 6,
  },
  tipTitle: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.body,
    color: M.navy,
    fontWeight: "700",
  },
  tipLine: {
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.caption,
    lineHeight: MarketplaceType.captionLine,
    color: "#374151",
  },
  bottomWrap: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
    backgroundColor: "#FFFFFF",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#EEF2F6",
  },
  postButton: {
    height: 48,
    borderRadius: 12,
    backgroundColor: M.teal,
    alignItems: "center",
    justifyContent: "center",
  },
  postButtonDisabled: {
    opacity: 0.45,
  },
  postButtonText: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.body,
    color: "#FFFFFF",
    fontWeight: "700",
  },
  inputError: {
    borderColor: "#F04438",
    backgroundColor: "#FFF5F5",
  },
  errorText: {
    marginTop: 6,
    fontFamily: Fonts.regular,
    fontSize: 12,
    lineHeight: 16,
    color: "#F04438",
  },
});
