import React, { useState, useCallback, useEffect, useMemo } from "react";
import { MarketplaceType } from "../../../constants/marketplace-type";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Fonts } from "../../../constants/font";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import ScreenHeader from "../../../components/layout/screen-header";
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
import { getListingTypeTheme } from "../../../constants/marketplace-theme";

const MAX_PHOTOS = MAX_LISTING_PHOTOS;

export default function CreateListingScreen() {
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
          showFailure("Could not load listing", {
            message: "This listing may have been removed.",
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
  const typeTheme = getListingTypeTheme(listingType);
  const categorySuggestions = isService
    ? SERVICE_CATEGORY_SUGGESTIONS
    : ITEM_CATEGORY_SUGGESTIONS;

  const handleAddPhoto = () => {
    if (photos.length >= MAX_PHOTOS) {
      showFailure("Limit reached", { message: `You can add up to ${MAX_PHOTOS} photos.` });
      return;
    }
    pickImages(
      (assets) => {
        setPhotos((prev) => [...prev, ...assets].slice(0, MAX_PHOTOS));
      },
      {
        showError: (t, m) => showFailure(t, { message: m }),
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
          errorTitle: isEditing ? "Could not update listing" : "Could not post listing",
          onSuccess: async (result) => {
            const status = result?.data?.status ?? result?.status;
            if (isEditing) {
              await showSuccess(
                "Listing updated",
                status === "approved"
                  ? "Your changes are now live in the marketplace."
                  : "Your changes have been submitted for admin review.",
              );
            } else {
              await showSuccess(
                isService ? "Service posted!" : "Listed!",
                status === "approved"
                  ? isService
                    ? "Your service is now live in the marketplace."
                    : "Your listing is now live in the marketplace."
                  : isService
                    ? "Your service has been submitted for review."
                    : "Your listing has been submitted for review.",
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
          <ActivityIndicator size="large" color="#14B8A6" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <ScreenHeader
        layout="inline"
        title={
          isEditing
            ? "Edit Listing"
            : listingType === "service"
              ? "Offer Service"
              : "List Item for Sale"
        }
        iconOnly
      />

      <KeyboardSafeScreen
        contentContainerStyle={styles.scrollContent}
        footerBorderless
        footerStyle={styles.bottomWrap}
        footer={
          <TouchableOpacity
            activeOpacity={0.9}
            style={[
              styles.postButton,
              { backgroundColor: typeTheme.accent },
              (!canPost || submitting) && styles.postButtonDisabled,
            ]}
            onPress={handlePost}
            disabled={!canPost || submitting}
          >
            <Text style={styles.postButtonText}>
              {uploadProgress
                ? `Uploading ${uploadProgress.done}/${uploadProgress.total}…`
                : submitting
                  ? isEditing
                    ? "Saving..."
                    : "Posting..."
                  : isEditing
                    ? "Save changes"
                    : isService
                      ? "Post service"
                      : "Post listing"}
            </Text>
          </TouchableOpacity>
        }
      >
        <ListingTypePicker
          value={listingType}
          onChange={setListingType}
          disabled={isEditing}
        />

        <View style={{ marginTop: 24 }}>
          <View style={styles.photosHeaderRow}>
            <Text style={[styles.label]}>Photos</Text>
            <Text style={styles.photoCount}>
              {photos.length}/{MAX_PHOTOS}
            </Text>
          </View>
          <View style={styles.photosRow}>
            {photos.map((photo, index) => (
              <View key={`${photo.uri}-${index}`} style={styles.photoBoxFilled}>
                <Image
                  source={{ uri: photo.uri }}
                  style={styles.photoPreview}
                  contentFit="cover"
                />
                <TouchableOpacity
                  style={styles.photoRemoveBtn}
                  activeOpacity={0.85}
                  onPress={() => handleRemovePhoto(index)}
                >
                  <Text style={styles.photoRemoveText}>×</Text>
                </TouchableOpacity>
              </View>
            ))}
            {photos.length < MAX_PHOTOS ? (
              <TouchableOpacity
                activeOpacity={0.85}
                style={[
                  styles.photoBox,
                  photos.length === 0 && styles.photoBoxPrimary,
                ]}
                onPress={handleAddPhoto}
              >
                <Image
                  source={require("../../../assets/images/gallary-icon.png")}
                  style={{ width: 32, height: 32 }}
                />
                {photos.length > 0 ? (
                  <Text style={styles.addMoreText}>Add</Text>
                ) : null}
              </TouchableOpacity>
            ) : null}
          </View>
          <Text style={styles.helperText}>
            {photos.length >= MAX_PHOTOS
              ? "Maximum photos added"
              : `Tap to add up to ${MAX_PHOTOS} photos (select multiple at once)`}
          </Text>
        </View>

   

        <Text style={[styles.label, styles.fieldGap]}>
          Title <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          value={title}
          onChangeText={(t) => {
            setTitle(t);
            clearError("title");
          }}
          onBlur={() => touch("title")}
          placeholder={
            isService ? "e.g., Lawn Mowing & Yard Cleanup" : "e.g., Vintage Dining Table"
          }
          placeholderTextColor="rgba(3, 2, 19, 0.5)"
          style={[styles.input, showError("title", liveErrors) && styles.inputError]}
          maxLength={LIMITS.listingTitle}
        />
        {showError("title", liveErrors) ? <Text style={styles.errorText}>{showError("title", liveErrors)}</Text> : null}

        <Text style={[styles.label, styles.fieldGap]}>
          Description <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          value={description}
          onChangeText={(t) => {
            setDescription(t);
            clearError("description");
          }}
          onBlur={() => touch("description")}
          placeholder={
            isService
              ? "Describe what you offer, experience, availability, and what's included."
              : "Describe the item, its condition, dimensions, etc."
          }
          placeholderTextColor="rgba(3, 2, 19, 0.5)"
          style={[styles.textArea, showError("description", liveErrors) && styles.inputError]}
          multiline
          textAlignVertical="top"
        />
        {showError("description", liveErrors) ? <Text style={styles.errorText}>{showError("description", liveErrors)}</Text> : null}

        <View style={[styles.labelRow, styles.fieldGap]}>
          <Image
            source={require("../../../assets/images/mini-dollar.png")}
            style={{ width: 16, height: 16 }}
          />
          <Text style={styles.label}>
            {isService ? "Starting price (USD)" : "Price (USD)"}{" "}
            <Text style={styles.required}>*</Text>
          </Text>
        </View>
        <TextInput
          value={price}
          onChangeText={(t) => {
            setPrice(t);
            clearError("price");
          }}
          onBlur={() => touch("price")}
          placeholder={isService ? "$ 25.00 / visit" : "$ 0.00"}
          placeholderTextColor="rgba(3, 2, 19, 0.5)"
          style={[styles.input, showError("price", liveErrors) && styles.inputError]}
          keyboardType="decimal-pad"
        />
        {showError("price", liveErrors) ? <Text style={styles.errorText}>{showError("price", liveErrors)}</Text> : null}

        <View style={[styles.labelRow, styles.fieldGap]}>
          <Image
            source={require("../../../assets/images/mini-category.png")}
            style={{ width: 16, height: 16 }}
          />
          <Text style={styles.label}>
            Category <Text style={styles.required}>*</Text>
          </Text>
        </View>
        <TextInput
          value={category}
          onChangeText={(t) => {
            setCategory(t);
            clearError("category");
          }}
          onBlur={() => touch("category")}
          placeholder={isService ? "e.g., Cleaning, Tutoring, Repairs" : "e.g., Furniture, Electronics"}
          placeholderTextColor="rgba(3, 2, 19, 0.5)"
          style={[styles.input, showError("category", liveErrors) && styles.inputError]}
          maxLength={LIMITS.listingCategory}
        />
        {showError("category", liveErrors) ? <Text style={styles.errorText}>{showError("category", liveErrors)}</Text> : null}
        <View style={styles.categorySuggestions}>
          {categorySuggestions.map((option) => {
            const active = category.toLowerCase() === option.toLowerCase();
            return (
              <TouchableOpacity
                key={option}
                activeOpacity={0.85}
                style={[styles.categoryChip, active && { borderColor: typeTheme.accent, backgroundColor: typeTheme.soft }]}
                onPress={() => setCategory(option)}
              >
                <Text style={[styles.categoryChipText, active && { color: typeTheme.accent, fontFamily: Fonts.bold, fontWeight: "700" }]}>
                  {option}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {listingType === "item" ? (
          <>
            <Text style={[styles.label, styles.fieldGap]}>
              Condition <Text style={styles.required}>*</Text>
            </Text>
            <View style={styles.conditionWrap}>
              {LISTING_CONDITIONS.map((option) => {
                const active = condition === option;
                return (
                  <TouchableOpacity
                    key={option}
                    activeOpacity={0.9}
                    style={[styles.conditionChip, active && { borderColor: typeTheme.accent, backgroundColor: typeTheme.soft }]}
                onPress={() => {
                      setCondition(option);
                      touch("condition");
                      clearError("condition");
                    }}
                  >
                    <Text
                      style={[styles.conditionChipText, active && { color: typeTheme.accent, fontFamily: Fonts.bold, fontWeight: "700" }]}
                    >
                      {option}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {showError("condition", liveErrors) ? <Text style={styles.errorText}>{showError("condition", liveErrors)}</Text> : null}
          </>
        ) : null}

        <View style={[styles.labelRow, styles.fieldGap]}>
          <Image
            source={require("../../../assets/images/mini-location.png")}
            style={{ width: 16, height: 16 }}
          />
          <Text style={styles.label}>Location (Optional)</Text>
        </View>
        <TextInput
          value={location}
          onChangeText={(t) => {
            setLocation(t);
            clearError("location");
          }}
          onBlur={() => touch("location")}
          placeholder={
            isService ? "e.g., Serving Maple Ridge community" : "e.g., Building A, Unit 304"
          }
          placeholderTextColor="rgba(3, 2, 19, 0.5)"
          style={[styles.input, showError("location", liveErrors) && styles.inputError]}
          maxLength={LIMITS.listingLocation}
        />
        {showError("location", liveErrors) ? <Text style={styles.errorText}>{showError("location", liveErrors)}</Text> : null}

        <View style={[styles.tipCard, { borderColor: typeTheme.border, backgroundColor: typeTheme.soft }]}>
          <View style={styles.tipHeaderRow}>
            <View style={[styles.tipIcon, { backgroundColor: "#FFFFFF" }]}>
              <Feather name="shield" size={14} color={typeTheme.accent} />
            </View>
            <Text style={styles.tipTitle}>Safety Tips</Text>
          </View>
          {isService ? (
            <>
              <Text style={styles.tipLine}>• Agree on scope and price before starting work</Text>
              <Text style={styles.tipLine}>• Meet in public areas within the community</Text>
              <Text style={styles.tipLine}>• Don't share personal banking details</Text>
            </>
          ) : (
            <>
              <Text style={styles.tipLine}>• Meet in public areas within the community</Text>
              <Text style={styles.tipLine}>• Don't share personal banking details</Text>
              <Text style={styles.tipLine}>• Trust your instincts</Text>
            </>
          )}
        </View>
      </KeyboardSafeScreen>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerWrap: {
    paddingTop: 24,
    paddingBottom: 20,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  backRow: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  titleText: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.heading,
    lineHeight: MarketplaceType.bodyMdLine,
    color: "rgba(0, 0, 0, 1)",
    fontWeight: "700",
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  conditionWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  conditionChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(229, 231, 235, 0.9)",
    backgroundColor: "#FFFFFF",
  },
  conditionChipActive: {
    borderColor: "#14B8A6",
    backgroundColor: "rgba(20, 184, 166, 0.08)",
  },
  conditionChipText: {
    fontFamily: Fonts.medium,
    fontSize: MarketplaceType.caption,
    color: "#4B5563",
  },
  conditionChipTextActive: {
    color: "#14B8A6",
    fontFamily: Fonts.bold,
    fontWeight: "700",
  },
  categorySuggestions: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(229, 231, 235, 0.9)",
    backgroundColor: "#FFFFFF",
  },
  categoryChipActive: {
    borderColor: "#14B8A6",
    backgroundColor: "rgba(20, 184, 166, 0.08)",
  },
  categoryChipText: {
    fontFamily: Fonts.medium,
    fontSize: MarketplaceType.caption,
    color: "#4B5563",
  },
  categoryChipTextActive: {
    color: "#14B8A6",
    fontFamily: Fonts.bold,
    fontWeight: "700",
  },
  label: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.bodyMd,
    lineHeight: MarketplaceType.bodyMdLine,
    color: "rgba(0, 0, 0, 1)",
    fontWeight: "700",
  },
  photosHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  photoCount: {
    fontFamily: Fonts.medium,
    fontSize: MarketplaceType.caption,
    lineHeight: MarketplaceType.captionLine,
    color: "#6A7282",
  },
  addMoreText: {
    marginTop: 4,
    fontFamily: Fonts.medium,
    fontSize: MarketplaceType.caption,
    color: "#14B8A6",
  },
  required: {
    color: "#EF4444",
  },
  photosRow: {
    marginTop: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  photoBox: {
    width: 95,
    height: 95,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "rgba(209, 213, 220, 0.6)",
    backgroundColor: "#F9FAFB",
    alignItems: "center",
    justifyContent: "center",
  },
  photoBoxFilled: {
    width: 95,
    height: 95,
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
  },
  photoPreview: {
    width: "100%",
    height: "100%",
  },
  photoRemoveBtn: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  photoRemoveText: {
    color: "#FFFFFF",
    fontSize: 16,
    lineHeight: 18,
    fontFamily: Fonts.bold,
  },
  photoBoxPrimary: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E8F2FB",
    borderColor: "rgba(20, 184, 166, 0.6)",
    borderStyle: "solid",
    boxShadow:
      "0px 1px 2px -1px rgba(0, 0, 0, 0.1), 0px 1px 3px 0px rgba(0, 0, 0, 0.1)",
  },
  helperText: {
    marginTop: 8,
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.caption,
    lineHeight: MarketplaceType.captionLine,
    color: "rgba(74, 85, 101, 1)",
  },
  fieldGap: {
    marginTop: 24,
  },
  input: {
    marginTop: 8,
    height: 50,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "rgba(20, 184, 166, 0.6)",
    backgroundColor: "rgba(255, 255, 255, 0.6)",
    paddingHorizontal: 16,
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.body,
    color: "#111827",
    boxShadow:
      "0px 1px 2px -1px rgba(0, 0, 0, 0.1), 0px 1px 3px 0px rgba(0, 0, 0, 0.1)",
  },
  textArea: {
    marginTop: 8,
    minHeight: 130,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "rgba(20, 184, 166, 0.6)",
    backgroundColor: "rgba(255, 255, 255, 0.6)",
    paddingHorizontal: 16,
    paddingTop: 12,
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.body,
    color: "#111827",
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 24,
  },
  tipCard: {
    marginTop: 24,
    borderWidth: 1,
    borderColor: "rgba(229, 231, 235, 0.6)",
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 1)",
    padding: 16,
    boxShadow:
      "0px 1px 2px -1px rgba(0, 0, 0, 0.1), 0px 1px 3px 0px rgba(0, 0, 0, 0.1)",
  },
  tipHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  tipIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: "#D1FAF5",
    alignItems: "center",
    justifyContent: "center",
  },
  tipTitle: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.bodyMd,
    lineHeight: MarketplaceType.bodyMdLine,
    color: "#111827",
    fontWeight: "700",
  },
  tipLine: {
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.caption,
    lineHeight: MarketplaceType.captionLine,
    color: "rgba(54, 65, 83, 1)",
  },
  bottomWrap: {
    paddingHorizontal: 6,
    paddingTop: 12,
    paddingBottom: 4,
    backgroundColor: "#FFFFFF",
  },
  postButton: {
    height: 50,
    borderRadius: 12,
    backgroundColor: "rgba(20, 184, 166, 1)",
    alignItems: "center",
    justifyContent: "center",
    boxShadow:
      "0px 4px 6px -4px rgba(0, 0, 0, 0.1), 0px 10px 15px -3px rgba(0, 0, 0, 0.1)",
  },
  postButtonDisabled: {
    opacity: 0.45,
  },
  postButtonText: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.body,
    lineHeight: MarketplaceType.headingLine,
    color: "#FFFFFF",
    fontWeight: "700",
  },
  inputError: {
    borderColor: "#DC2626",
  },
  errorText: {
    marginTop: 4,
    fontFamily: Fonts.regular,
    fontSize: 12,
    lineHeight: 16,
    color: "#DC2626",
  },
});
