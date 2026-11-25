import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Pressable, Keyboard, Modal, Platform, ScrollView, useWindowDimensions } from "react-native";
import LocaleTextInput from "../../../components/ui/locale-text-input";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import ScreenHeader from "../../../components/layout/screen-header";
import KeyboardSafeScreen from "../../../components/layout/keyboard-safe-screen";
import UserAvatar from "../../../components/ui/user-avatar";
import { Fonts } from "../../../constants/font";
import { Colors, Layout } from "../../../constants/tokens";
import { Image } from "expo-image";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { createPost, fetchPost, POST_TYPE_OPTIONS, parsePostBodyForEdit, updatePost, uploadPostImage } from "../../../services/feed-api";
import { fetchMe } from "../../../services/profile-api";
import { getProfileFields } from "../../../utils/profile-display";
import { ensureFeedCommunityContext } from "../../../services/feed-context";
import { getUser } from "../../../services/auth-session";
import { useSubmitLock } from "../../../hooks/use-submit-lock";
import { useTouchedFieldErrors } from "../../../hooks/use-touched-field-errors";
import { useApiAction } from "../../../hooks/use-api-action";
import { pickImage } from "../../../utils/pickImage";
import PostImageCropSheet from "../../../components/feed/post-image-crop-sheet";
import { sw, sf, hp } from "../../../utils/responsive";
import { androidFeelingSheetMetrics } from "../../../utils/feeling-sheet-layout";
import { hasFieldErrors, LIMITS, validateFeedPostForm } from "../../../utils/form-validation";
import GuestFeatureErrorState from "../../../components/guest/guest-permission-denied-state";
import { isFeatureAccessBlockedError } from "../../../utils/guest-permission-errors";
import { resolveLoadRestriction } from "../../../utils/account-access-sync";
import { useLanguage } from "../../../providers/language-provider";
import { syncKeyboardForFocusedInput } from "../../../utils/native-app-locale";
import { rnShadow } from "../../../utils/shadow";
import PollDurationPicker, { DEFAULT_POLL_DURATION } from "../../../components/feed/poll-duration-picker";
import PollVotingMethodPicker from "../../../components/feed/poll-voting-method-picker";
import { toPollDurationApiPayload } from "../../../utils/poll-duration";

const TYPE_ICONS = {
  Recommendations: "star",
  Events: "calendar",
  Help: "help-circle",
  Neighborhood: "map-pin",
  Announcements: "bell",
  Poll: "bar-chart-2",
};

const ATTACH_OPTIONS = [
  { id: "photo", labelKey: "feed.createPost.photo", icon: "image", tint: "#1B4F8A", soft: "#D1FAF5" },
  { id: "location", labelKey: "feed.createPost.location", icon: "map-pin", tint: "#047857", soft: "#ECFDF5" },
  { id: "emoji", labelKey: "feed.createPost.feelingLabel", icon: "smile", tint: "#C2410C", soft: "#FFF7ED" },
];

const FEELINGS = [
  { emoji: "😊", labelKey: "happy" },
  { emoji: "🥰", labelKey: "loved" },
  { emoji: "🙏", labelKey: "grateful" },
  { emoji: "🎉", labelKey: "excited" },
  { emoji: "😌", labelKey: "relaxed" },
  { emoji: "💪", labelKey: "motivated" },
  { emoji: "😎", labelKey: "proud" },
  { emoji: "😴", labelKey: "tired" },
];

const VALID_CATEGORIES = new Set(["general", "event", "help", "update", "announcement"]);
/** Matches backend `poll.options` max (FeedController). */
const MAX_POLL_OPTIONS = 20;
const MIN_POLL_OPTIONS = 2;

/**
 * Plain object (not StyleSheet.create). The global text-metrics patch adds
 * lineHeight to StyleSheet text styles, and iOS TextInput then top-aligns
 * placeholder/typed text. Fixed-height chrome lives on the wrapper View.
 */
const POLL_INPUT_TEXT = {
  width: "100%",
  margin: 0,
  paddingHorizontal: 0,
  paddingTop: 0,
  paddingBottom: 0,
  paddingVertical: 0,
  fontFamily: Fonts.regular,
  fontSize: 14,
  color: Colors.textPrimary,
  textAlignVertical: "center",
  includeFontPadding: false,
};

export default function CreatePost() {
  const router = useRouter();
  const { t } = useTranslation();
  const { category: categoryParam, postId: postIdParam } = useLocalSearchParams();
  const editPostId = postIdParam ? String(Array.isArray(postIdParam) ? postIdParam[0] : postIdParam) : null;
  const isEditing = Boolean(editPostId);
  const initialCategory = VALID_CATEGORIES.has(String(categoryParam))
    ? String(categoryParam)
    : "general";
  const { language: appLanguage } = useLanguage();
  const { submitting, run } = useSubmitLock();
  const { showFailure } = useApiAction();
  const [postText, setPostText] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [successModal, setSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [attachedImage, setAttachedImage] = useState(null);
  const [cropSheetOpen, setCropSheetOpen] = useState(false);
  const [previewWidth, setPreviewWidth] = useState(0);
  const [initialRemoteImageUrl, setInitialRemoteImageUrl] = useState(null);
  const [loadingPost, setLoadingPost] = useState(isEditing);
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [feeling, setFeeling] = useState(null);
  const [location, setLocation] = useState(null);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollDescription, setPollDescription] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [pollDuration, setPollDuration] = useState(DEFAULT_POLL_DURATION);
  const [pollVotingMethod, setPollVotingMethod] = useState("single");
  const [feelingModal, setFeelingModal] = useState(false);
  const [feelingHeaderHeight, setFeelingHeaderHeight] = useState(0);
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const isAndroid = Platform.OS === "android";
  const feelingSheet = isAndroid
    ? androidFeelingSheetMetrics({
        windowHeight,
        windowWidth,
        topInset: insets.top,
        bottomInset: insets.bottom,
        headerHeight: feelingHeaderHeight || sw(4) + sw(16) + sf(22) + sw(16),
        paddingTop: sw(12),
        contentPadding: sw(28),
        topGap: sw(16),
        horizontalPadding: sw(20),
        columnGap: sw(10),
      })
    : null;
  const [user, setUser] = useState(null);
  const [restrictionError, setRestrictionError] = useState(null);
  const { touch, clearError, showError, validateOnSubmit, resetTouched } = useTouchedFieldErrors();

  useFocusEffect(
    useCallback(() => {
      resolveLoadRestriction("feed").then(setRestrictionError);
      // Keep OS keyboard locale in sync with the active app language.
      syncKeyboardForFocusedInput(appLanguage);
    }, [appLanguage]),
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await ensureFeedCommunityContext();
        const data = await fetchMe();
        if (!cancelled) setUser(data);
      } catch {
        const cached = await getUser();
        if (!cancelled) setUser(cached);
      }
    })();

    const hideSubscription = Keyboard.addListener("keyboardDidHide", () => setShowDone(false));
    return () => {
      cancelled = true;
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!editPostId) return undefined;

    let cancelled = false;

    (async () => {
      try {
        setLoadingPost(true);
        const post = await fetchPost(editPostId);
        if (cancelled || !post) return;

        const parsed = parsePostBodyForEdit(post.content ?? post.body ?? "");
        setPostText(parsed.text);
        setFeeling(parsed.feeling);
        setLocation(parsed.location);
        setSelectedCategory(post.category ?? "general");

        if (post.image_url) {
          setAttachedImage({ uri: post.image_url });
          setInitialRemoteImageUrl(post.image_url);
        }
      } catch (err) {
        if (!cancelled) {
          await showFailure(t("feed.createPost.couldNotLoad"), err);
          router.back();
        }
      } finally {
        if (!cancelled) setLoadingPost(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [editPostId, router, showFailure]);

  const approvedMembership = useMemo(
    () => (user?.memberships ?? []).find((membership) => membership.status === "approved"),
    [user],
  );

  const isPoll = selectedCategory === "poll";
  // Poll is always in POST_TYPE_OPTIONS (6th chip). Only hide while editing — polls cannot be edited.
  const postTypeOptions = isEditing
    ? POST_TYPE_OPTIONS.filter((option) => option.category !== "poll")
    : POST_TYPE_OPTIONS;
  const liveErrors = useMemo(() => {
    if (!isPoll) return validateFeedPostForm({ body: postText, hasImage: Boolean(attachedImage) });
    const errors = {};
    if (!pollQuestion.trim()) errors.body = t("feed.createPost.pollNeedQuestion");
    else if (pollQuestion.trim().length > 200) {
      errors.body = t("validation.maxChars", { field: t("feed.createPost.pollQuestion"), max: 200 });
    }
    const filled = pollOptions.map((option) => option.trim()).filter(Boolean);
    const unique = new Set(filled.map((option) => option.toLowerCase()));
    if (filled.some((option) => option.length > 80)) {
      errors.options = t("feed.createPost.pollNeedOptions");
    } else if (filled.length >= 2 && unique.size !== filled.length) {
      errors.options = t("feed.createPost.pollDuplicateOptions");
    } else if (filled.length < 2) {
      errors.options = t("feed.createPost.pollNeedOptions");
    }
    if (pollDescription.trim().length > 500) {
      errors.description = t("validation.maxChars", { field: t("feed.createPost.pollDescription"), max: 500 });
    }
    return errors;
  }, [attachedImage, isPoll, pollDescription, pollOptions, pollQuestion, postText, t]);

  const previousCategoryRef = useRef(selectedCategory);
  useEffect(() => {
    if (selectedCategory === "poll" && previousCategoryRef.current !== "poll") {
      resetTouched();
    }
    previousCategoryRef.current = selectedCategory;
  }, [selectedCategory, resetTouched]);

  const optionsError = showError("options", liveErrors);

  const canPost = useMemo(
    () => !hasFieldErrors(liveErrors) && !submitting,
    [liveErrors, submitting],
  );
  const profileFields = useMemo(() => getProfileFields(user), [user]);
  const displayName = user?.display_name ?? user?.name ?? t("common.you");
  const community = approvedMembership?.community?.name ?? t("community.yourCommunity");
  const accessBlocked = Boolean(
    restrictionError && isFeatureAccessBlockedError(restrictionError),
  );

  const markDone = () => setShowDone(true);

  const handleLocation = () => {
    if (location) {
      setLocation(null);
      return;
    }
    const parts = [
      profileFields.communityName,
      profileFields.regionTitle,
    ].filter((part) => part && part !== "My Community");
    const label = parts.join(", ") || community;
    setLocation(label);
    markDone();
  };

  const selectFeeling = (item) => {
    setFeeling(item);
    setFeelingModal(false);
    markDone();
  };

  const handleAttachmentPress = async (action) => {
    if (action === "photo") {
      const asset = await pickImage(undefined, {
        allowCamera: true,
        promptTitle: t("feed.createPost.addPhoto"),
        promptMessage: t("feed.createPost.photoPrompt"),
        showError: (title, message) => showFailure(title, { message }),
        preserveGalleryOriginal: true,
      });
      if (asset?.uri) {
        setAttachedImage(asset);
        markDone();
      }
      return;
    }
    if (action === "location") {
      handleLocation();
      return;
    }
    if (action === "emoji") {
      setFeelingModal(true);
      return;
    }
  };

  const removeImage = () => {
    setCropSheetOpen(false);
    setAttachedImage(null);
    setShowDone(
      postText.trim().length > 0 || Boolean(feeling) || Boolean(location),
    );
  };

  const previewRatio =
    attachedImage?.galleryOriginal && attachedImage.width > 0 && attachedImage.height > 0
      ? attachedImage.width / attachedImage.height
      : null;
  const previewHeight = previewRatio && previewWidth > 0
    ? Math.min(hp(42), Math.max(sw(120), previewWidth / previewRatio))
    : hp(24);

  const handlePost = () => {
    if (submitting || loadingPost) return;
    if (!validateOnSubmit(liveErrors)) return;

    run(async () => {
      Keyboard.dismiss();

      const communityId = await ensureFeedCommunityContext();
      if (!communityId) {
        throw new Error(t("feed.createPost.joinCommunityError"));
      }

      if (isPoll) {
        const { message } = await createPost({
          category: "poll",
          poll: {
            question: pollQuestion.trim(),
            description: pollDescription.trim(),
            ...toPollDurationApiPayload(pollDuration),
            voting_method: pollVotingMethod,
            options: pollOptions.map((option) => option.trim()).filter(Boolean),
          },
        });
        setSuccessMessage(message);
        setSuccessModal(true);
        return;
      }

      let imageUrl;
      let removeImage = false;
      const hasLocalImage = attachedImage?.uri && !/^https?:\/\//i.test(attachedImage.uri);

      if (hasLocalImage) {
        const uploaded = await uploadPostImage(attachedImage.uri, attachedImage);
        imageUrl = uploaded.image_url;
      } else if (attachedImage?.uri) {
        imageUrl = attachedImage.uri;
      } else if (initialRemoteImageUrl) {
        removeImage = true;
      }

      const base = postText.trim() || (attachedImage?.uri ? t("feed.createPost.sharedPhoto") : "");
      const extras = [];
      if (feeling) extras.push(`— ${t("feed.createPost.feeling", { label: t(`feed.createPost.feelings.${feeling.labelKey}`) })} ${feeling.emoji}`);
      if (location) extras.push(`📍 ${location}`);
      const content = [base, ...extras].filter(Boolean).join("\n");

      if (isEditing) {
        const { message } = await updatePost(editPostId, {
          content,
          category: selectedCategory,
          language: appLanguage,
          imageUrl,
          removeImage,
        });
        setSuccessMessage(message);
      } else {
        const { message } = await createPost({
          content,
          category: selectedCategory,
          language: appLanguage,
          imageUrl,
        });
        setSuccessMessage(message);
      }

      setSuccessModal(true);
    }).catch(async (err) => {
      await showFailure(isEditing ? t("feed.createPost.couldNotUpdate") : t("feed.createPost.couldNotPost"), err);
    });
  };

  const closeSuccessModal = () => {
    setSuccessModal(false);
    setPostText("");
    setAttachedImage(null);
    setInitialRemoteImageUrl(null);
    setSelectedCategory("general");
    setFeeling(null);
    setLocation(null);
    setPollQuestion("");
    setPollDescription("");
    setPollOptions(["", ""]);
    setPollDuration(DEFAULT_POLL_DURATION);
    setPollVotingMethod("single");
    setShowDone(false);
    router.back();
  };

  return (
    <>
      <SafeAreaView style={styles.screen} edges={["left", "right"]}>
        <ScreenHeader
          layout="inline"
          title={isEditing ? t("feed.createPost.editTitle") : t("feed.createPost.title")}
          iconOnly
          showBackLabel={false}
          style={styles.header}
          right={
            showDone ? (
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => {
                  Keyboard.dismiss();
                  setShowDone(false);
                }}
              >
                <Text style={styles.doneBtn}>{t("common.done")}</Text>
              </TouchableOpacity>
            ) : null
          }
        />

        {accessBlocked ? (
          <GuestFeatureErrorState
            error={restrictionError}
            fallbackFeature="feed"
            defaultTitle={t("feed.createPost.cannotCreate")}
            onRetry={() => resolveLoadRestriction("feed").then(setRestrictionError)}
          />
        ) : (
        <KeyboardSafeScreen
          contentContainerStyle={styles.scrollContent}
          footer={
            <TouchableOpacity
              activeOpacity={0.9}
              disabled={!canPost || loadingPost}
              onPress={handlePost}
              style={[styles.postButton, (!canPost || loadingPost) && styles.postButtonDisabled]}
            >
              <Feather name="send" size={sf(15)} color="#FFFFFF" />
              <Text style={styles.postButtonText}>
                {loadingPost
                  ? t("feed.createPost.loading")
                  : submitting
                    ? isEditing
                      ? t("feed.createPost.saving")
                      : t("feed.createPost.posting")
                    : isEditing
                      ? t("feed.createPost.saveChanges")
                      : isPoll
                      ? t("feed.createPost.publishPoll")
                      : t("feed.createPost.sharePost")}
              </Text>
            </TouchableOpacity>
          }
        >
          <View style={styles.card}>
            <View style={styles.authorRow}>
              <UserAvatar source={user?.avatar_url} name={displayName} size={sw(44)} />
              <View style={styles.authorCopy}>
                <Text style={styles.authorName} numberOfLines={1}>{displayName}</Text>
                <View style={styles.authorMetaRow}>
                  <Feather name="users" size={sf(11)} color={Colors.textMuted} />
                  <Text style={styles.authorMeta} numberOfLines={1}>{community}</Text>
                </View>
              </View>
            </View>

            {!isPoll ? (
              <>
                <LocaleTextInput
                  placeholder={t("feed.createPost.placeholder")}
                  placeholderTextColor={Colors.textMuted}
                  multiline
                  value={postText}
                  onChangeText={(text) => {
                    setPostText(text);
                    clearError("body");
                    setShowDone(text.trim().length > 0 || Boolean(attachedImage));
                  }}
                  onBlur={() => touch("body")}
                  style={[styles.postInput, showError("body", liveErrors) && styles.inputError]}
                  maxLength={LIMITS.feedPost}
                />

                {attachedImage?.uri ? (
                  <View
                    style={styles.previewWrap}
                    onLayout={(event) => {
                      const nextWidth = event.nativeEvent.layout.width;
                      if (nextWidth > 0 && nextWidth !== previewWidth) setPreviewWidth(nextWidth);
                    }}
                  >
                    <Image
                      source={{ uri: attachedImage.uri }}
                      style={[styles.previewImage, previewRatio ? { height: previewHeight } : null]}
                      contentFit={previewRatio ? "contain" : "cover"}
                    />
                    {attachedImage.galleryOriginal ? (
                      <TouchableOpacity
                        style={styles.previewCrop}
                        activeOpacity={0.9}
                        onPress={() => setCropSheetOpen(true)}
                        accessibilityRole="button"
                        accessibilityLabel={t("imagePicker.crop")}
                      >
                        <Feather name="crop" size={sf(14)} color="#FFFFFF" />
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity style={styles.previewRemove} activeOpacity={0.9} onPress={removeImage}>
                      <Feather name="x" size={sf(14)} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>
                ) : null}

                {feeling || location ? (
                  <View style={styles.pillRow}>
                    {feeling ? (
                      <View style={styles.selPill}>
                        <Text style={styles.selPillText}>
                          {feeling.emoji} {t("feed.createPost.feeling", { label: t(`feed.createPost.feelings.${feeling.labelKey}`) })}
                        </Text>
                        <TouchableOpacity onPress={() => setFeeling(null)} hitSlop={8}>
                          <Feather name="x" size={sf(13)} color={Colors.textMuted} />
                        </TouchableOpacity>
                      </View>
                    ) : null}
                    {location ? (
                      <View style={styles.selPill}>
                        <Feather name="map-pin" size={sf(12)} color="#047857" />
                        <Text style={styles.selPillText} numberOfLines={1}>{location}</Text>
                        <TouchableOpacity onPress={() => setLocation(null)} hitSlop={8}>
                          <Feather name="x" size={sf(13)} color={Colors.textMuted} />
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {showError("body", liveErrors) || postText.length > 0 ? (
                  <View style={styles.inputFoot}>
                    {showError("body", liveErrors) ? (
                      <Text style={styles.errorText}>{showError("body", liveErrors)}</Text>
                    ) : (
                      <View />
                    )}
                    {postText.length > 0 ? (
                      <Text style={styles.counter}>
                        {postText.length}/{LIMITS.feedPost}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </>
            ) : null}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionLabel}>{t("feed.createPost.postType")}</Text>
            <View style={styles.typeChips}>
              {/* Permanent order: Recommendations, Events, Help, Neighborhood, Announcements, Poll */}
              {postTypeOptions.map((option) => {
                const selected = selectedCategory === option.category;
                return (
                  <Pressable
                    key={option.category}
                    style={[
                      styles.typeChip,
                      {
                        backgroundColor: selected ? option.bg : "#FFFFFF",
                        borderColor: selected ? option.border : Colors.borderSubtle,
                      },
                    ]}
                    onPress={() => setSelectedCategory(option.category)}
                  >
                    <Feather
                      name={TYPE_ICONS[option.label] ?? "tag"}
                      size={sf(12)}
                      color={selected ? option.text : Colors.textPrimary}
                    />
                    <Text
                      style={[
                        styles.typeChipText,
                        { color: selected ? option.text : Colors.textPrimary },
                      ]}
                    >
                      {t(option.labelKey)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {isPoll ? (
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>{t("feed.createPost.createPoll")}</Text>

              <Text style={styles.pollFieldLabel}>
                {t("feed.createPost.pollQuestion")}
                <Text style={styles.requiredMark}> *</Text>
              </Text>
              <View
                style={[
                  styles.pollInputBox,
                  showError("body", liveErrors) && styles.pollInputBoxError,
                ]}
              >
                <LocaleTextInput
                  placeholder={t("feed.createPost.pollQuestionPlaceholder")}
                  placeholderTextColor={Colors.textMuted}
                  value={pollQuestion}
                  onChangeText={(text) => {
                    setPollQuestion(text);
                    clearError("body");
                  }}
                  onBlur={() => touch("body")}
                  style={POLL_INPUT_TEXT}
                  maxLength={200}
                  underlineColorAndroid="transparent"
                  textAlignVertical="center"
                  allowFontScaling={false}
                />
              </View>
              <Text style={styles.pollCharCount}>{pollQuestion.length}/200</Text>
              {showError("body", liveErrors) ? (
                <Text style={styles.errorText}>{showError("body", liveErrors)}</Text>
              ) : null}

              <Text style={[styles.pollFieldLabel, { marginTop: sw(12) }]}>
                {t("feed.createPost.pollDescription")}
              </Text>
              <View
                style={[
                  styles.pollTextAreaBox,
                  showError("description", liveErrors) && styles.pollInputBoxError,
                ]}
              >
                <LocaleTextInput
                  placeholder={t("feed.createPost.pollDescriptionPlaceholder")}
                  placeholderTextColor={Colors.textMuted}
                  multiline
                  value={pollDescription}
                  onChangeText={(text) => {
                    setPollDescription(text.slice(0, 500));
                    clearError("description");
                  }}
                  onBlur={() => touch("description")}
                  style={styles.pollDescriptionInput}
                  maxLength={500}
                  underlineColorAndroid="transparent"
                  textAlignVertical="top"
                  allowFontScaling={false}
                />
              </View>
              {pollDescription.length > 0 ? (
                <Text style={styles.pollCharCount}>{pollDescription.length}/500</Text>
              ) : (
                <Text style={styles.pollHelperText}>{t("feed.createPost.pollDescriptionHint")}</Text>
              )}
              {showError("description", liveErrors) ? (
                <Text style={styles.errorText}>{showError("description", liveErrors)}</Text>
              ) : null}

              <View style={styles.pollOptionsHeader}>
                <Text style={styles.pollFieldLabel}>
                  {t("feed.createPost.pollOptions")}
                  <Text style={styles.requiredMark}> *</Text>
                </Text>
                <Text style={styles.pollOptionCount}>
                  {t("feed.createPost.pollOptionCount", { count: pollOptions.length })}
                </Text>
              </View>
              {pollOptions.map((option, index) => (
                <View key={`poll-opt-${index}`} style={styles.pollOptionRow}>
                  <View
                    style={[
                      styles.pollInputBox,
                      styles.pollInputBoxFlex,
                      optionsError && styles.pollInputBoxError,
                    ]}
                  >
                    <LocaleTextInput
                      placeholder={t("feed.createPost.pollOptionPlaceholder", { number: index + 1 })}
                      placeholderTextColor={Colors.textMuted}
                      value={option}
                      onChangeText={(text) => {
                        setPollOptions((current) =>
                          current.map((item, itemIndex) => (itemIndex === index ? text : item)),
                        );
                        clearError("options");
                      }}
                      onBlur={() => touch("options")}
                      style={POLL_INPUT_TEXT}
                      maxLength={80}
                      underlineColorAndroid="transparent"
                      textAlignVertical="center"
                      allowFontScaling={false}
                    />
                  </View>
                  {index >= MIN_POLL_OPTIONS ? (
                    <TouchableOpacity
                      style={styles.pollRemoveBtn}
                      onPress={() =>
                        setPollOptions((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={t("common.delete")}
                    >
                      <Feather name="x" size={sf(14)} color="#B91C1C" />
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.pollRemoveSpacer} />
                  )}
                </View>
              ))}
              {optionsError ? <Text style={styles.errorText}>{optionsError}</Text> : (
                <Text style={styles.pollHelperText}>{t("feed.createPost.pollOptionsHint")}</Text>
              )}
              {pollOptions.length < MAX_POLL_OPTIONS ? (
                <TouchableOpacity
                  style={styles.pollAddOptionBtn}
                  onPress={() => setPollOptions((current) => [...current, ""])}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={t("feed.createPost.addOption")}
                >
                  <View style={styles.pollAddIcon}>
                    <Feather name="plus" size={sf(14)} color={Colors.brandPrimary} />
                  </View>
                  <Text style={styles.pollAddOptionText}>{t("feed.createPost.addOption")}</Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.pollHelperText}>
                  {t("feed.createPost.pollOptionsMax", { max: MAX_POLL_OPTIONS })}
                </Text>
              )}

              <PollVotingMethodPicker
                value={pollVotingMethod}
                onChange={setPollVotingMethod}
                disabled={submitting}
                required
              />

              <View style={{ marginTop: sw(4) }}>
                <PollDurationPicker
                  value={pollDuration}
                  onChange={setPollDuration}
                  disabled={submitting}
                  required
                />
              </View>
            </View>
          ) : null}

          {!isPoll ? (
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>{t("feed.createPost.addToPost")}</Text>
              <View style={styles.attachRow}>
                {ATTACH_OPTIONS.map((item) => {
                  const active =
                    (item.id === "photo" && Boolean(attachedImage)) ||
                    (item.id === "location" && Boolean(location)) ||
                    (item.id === "emoji" && Boolean(feeling));
                  return (
                    <TouchableOpacity
                      key={item.id}
                      activeOpacity={0.85}
                      style={[
                        styles.attachTile,
                        active && { borderColor: item.tint, backgroundColor: item.soft },
                      ]}
                      onPress={() => handleAttachmentPress(item.id)}
                    >
                      <View style={[styles.attachIcon, { backgroundColor: item.soft }]}>
                        <Feather
                          name={active ? "check" : item.icon}
                          size={sf(16)}
                          color={item.tint}
                        />
                      </View>
                      <Text style={styles.attachTileLabel}>{t(item.labelKey)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : null}
        </KeyboardSafeScreen>
        )}
      </SafeAreaView>

      <PostImageCropSheet
        visible={cropSheetOpen && Boolean(attachedImage?.galleryOriginal)}
        asset={attachedImage}
        onUseOriginal={() => setCropSheetOpen(false)}
        onCropped={(next) => {
          setAttachedImage(next);
          setCropSheetOpen(false);
        }}
      />

      <Modal
        visible={feelingModal}
        transparent
        animationType="fade"
        onRequestClose={() => setFeelingModal(false)}
        {...(isAndroid ? { statusBarTranslucent: true, navigationBarTranslucent: true } : null)}
      >
        {isAndroid ? (
          <View style={styles.sheetOverlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setFeelingModal(false)} />
            <View
              style={[
                styles.sheet,
                {
                  maxHeight: feelingSheet.maxHeight,
                  paddingBottom: feelingSheet.paddingBottom,
                },
              ]}
            >
              <View
                onLayout={(event) => {
                  const next = Math.round(event.nativeEvent.layout.height);
                  if (next > 0 && next !== feelingHeaderHeight) setFeelingHeaderHeight(next);
                }}
              >
                <View style={styles.sheetHandle} />
                <Text style={styles.sheetTitle}>{t("feed.createPost.howFeeling")}</Text>
              </View>
              <ScrollView
                style={{ maxHeight: feelingSheet.gridMaxHeight, flexGrow: 0 }}
                contentContainerStyle={styles.feelingGrid}
                showsVerticalScrollIndicator
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
              >
                {FEELINGS.map((item) => {
                  const selected = feeling?.labelKey === item.labelKey;
                  return (
                    <TouchableOpacity
                      key={item.labelKey}
                      activeOpacity={0.85}
                      style={[
                        styles.feelingItem,
                        { width: feelingSheet.cardWidth },
                        selected && styles.feelingItemActive,
                      ]}
                      onPress={() => selectFeeling(item)}
                    >
                      <Text style={styles.feelingEmoji}>{item.emoji}</Text>
                      <Text style={styles.feelingLabel} numberOfLines={2}>
                        {t(`feed.createPost.feelings.${item.labelKey}`)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        ) : (
          <Pressable style={styles.sheetOverlay} onPress={() => setFeelingModal(false)}>
            <Pressable style={styles.sheet}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>{t("feed.createPost.howFeeling")}</Text>
              <View style={styles.feelingGrid}>
                {FEELINGS.map((item) => {
                  const selected = feeling?.labelKey === item.labelKey;
                  return (
                    <TouchableOpacity
                      key={item.labelKey}
                      activeOpacity={0.85}
                      style={[styles.feelingItem, selected && styles.feelingItemActive]}
                      onPress={() => selectFeeling(item)}
                    >
                      <Text style={styles.feelingEmoji}>{item.emoji}</Text>
                      <Text style={styles.feelingLabel}>{t(`feed.createPost.feelings.${item.labelKey}`)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Pressable>
          </Pressable>
        )}
      </Modal>

      <Modal visible={successModal} transparent animationType="fade" onRequestClose={closeSuccessModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalIcon}>
              <Feather name="check" size={sf(26)} color="#FFFFFF" />
            </View>
            <Text style={styles.modalTitle}>{isEditing ? t("feed.createPost.postUpdated") : t("feed.createPost.postCreated")}</Text>
            <Text style={styles.modalSub}>
              {successMessage || t("feed.createPost.postLiveFallback")}
            </Text>
            <TouchableOpacity style={styles.modalButton} onPress={closeSuccessModal}>
              <Text style={styles.modalButtonText}>{t("common.done")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const CARD = {
  backgroundColor: Colors.surface,
  borderRadius: sw(16),
  borderWidth: 1,
  borderColor: Colors.borderSubtle,
  padding: sw(16),
  ...rnShadow({ color: "#000", offset: { width: 0, height: 1 }, opacity: 0.03, radius: 4 }),
  elevation: 1,
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F7F8FC" },
  header: {},
  scrollContent: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: sw(10),
    paddingBottom: sw(16),
    gap: sw(14),
  },
  doneBtn: {
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
    fontSize: sf(14),
    lineHeight: sf(20),
    color: "#fff",
    backgroundColor: Colors.brandPrimaryDeep,
    paddingVertical: sw(5),
    paddingHorizontal: sw(18),
    borderRadius: sw(8),
    overflow: "hidden",
  },

  card: CARD,

  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
    marginBottom: sw(14),
  },
  authorCopy: { flex: 1, minWidth: 0 },
  authorName: {
    fontFamily: Fonts.bold,
    fontWeight: "700",
    fontSize: sf(15),
    lineHeight: sf(20),
    color: Colors.textPrimary,
  },
  authorMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(5),
    marginTop: 2,
  },
  authorMeta: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(16),
    color: Colors.textSecondary,
    flexShrink: 1,
  },
  pollFields: { gap: sw(8), marginTop: sw(8) },
  pollFieldLabel: {
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
    fontSize: sf(13),
    color: Colors.textPrimary,
    marginBottom: sw(8),
  },
  requiredMark: {
    color: "#DC2626",
    fontFamily: Fonts.semiBold,
  },
  pollInputBox: {
    height: sw(48),
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: sw(12),
    paddingHorizontal: sw(14),
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignSelf: "stretch",
  },
  pollInputBoxFlex: {
    flex: 1,
    alignSelf: "auto",
  },
  pollInputBoxError: {
    borderColor: "#DC2626",
  },
  pollCharCount: {
    alignSelf: "flex-end",
    marginTop: sw(6),
    marginBottom: sw(10),
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    color: Colors.textMuted,
  },
  pollOptionsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: sw(4),
  },
  pollOptionCount: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: Colors.textMuted,
    marginBottom: sw(8),
  },
  pollOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    marginBottom: sw(10),
  },
  pollTextAreaBox: {
    minHeight: sw(96),
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: sw(12),
    paddingHorizontal: sw(14),
    paddingVertical: sw(10),
    backgroundColor: "#FFFFFF",
    alignSelf: "stretch",
  },
  pollDescriptionInput: {
    minHeight: sw(72),
    fontFamily: Fonts.regular,
    fontSize: sf(14),
    lineHeight: sf(20),
    color: Colors.textPrimary,
    padding: 0,
    margin: 0,
    textAlignVertical: "top",
    includeFontPadding: false,
  },
  pollHelperText: {
    marginTop: sw(6),
    marginBottom: sw(10),
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    lineHeight: sf(16),
    color: Colors.textMuted,
  },
  pollRemoveBtn: {
    width: sw(32),
    height: sw(32),
    borderRadius: sw(10),
    borderWidth: 1,
    borderColor: "#FECACA",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FEF2F2",
  },
  pollRemoveSpacer: {
    width: sw(32),
    height: sw(32),
  },
  pollAddOptionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(8),
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: Colors.borderInput,
    borderRadius: sw(999),
    paddingVertical: sw(12),
    paddingHorizontal: sw(14),
    marginTop: sw(2),
    backgroundColor: "#E8F0F7",
  },
  pollAddIcon: {
    width: sw(22),
    height: sw(22),
    borderRadius: sw(11),
    borderWidth: 1,
    borderColor: Colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  pollAddOptionText: {
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
    fontSize: sf(13),
    color: Colors.brandPrimary,
  },
  pollDurationRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: sw(8),
  },
  pollDurationChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
    paddingHorizontal: sw(12),
    paddingVertical: sw(9),
    borderRadius: sw(999),
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    backgroundColor: "#FFFFFF",
  },
  pollDurationChipSelected: {
    backgroundColor: "#E8F0F7",
    borderColor: Colors.borderInput,
  },
  pollDurationText: {
    fontFamily: Fonts.medium,
    fontWeight: "500",
    fontSize: sf(12),
    color: Colors.textPrimary,
  },
  pollDurationTextSelected: {
    color: Colors.brandPrimary,
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
  },
  pollInput: {
    flex: 1,
    fontSize: sf(15),
    fontFamily: Fonts.regular,
    color: Colors.textPrimary,
    minHeight: sw(44),
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: sw(10),
    paddingHorizontal: sw(12),
    paddingVertical: sw(8),
    textAlignVertical: "center",
  },
  addOption: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    color: Colors.brandPrimary,
    marginTop: sw(4),
  },
  durationSelected: { backgroundColor: "#E8F0F7", borderColor: Colors.borderInput },
  durationSelectedText: { color: Colors.brandPrimary },
  postInput: {
    fontSize: sf(15),
    lineHeight: sf(22),
    fontFamily: Fonts.regular,
    color: Colors.textPrimary,
    minHeight: hp(14),
    textAlignVertical: "top",
  },
  inputError: {
    borderWidth: 1,
    borderColor: "#DC2626",
    borderRadius: sw(10),
    padding: sw(10),
  },
  previewWrap: {
    marginTop: sw(12),
    borderRadius: sw(14),
    overflow: "hidden",
    position: "relative",
  },
  previewImage: {
    width: "100%",
    height: hp(24),
    borderRadius: sw(14),
    backgroundColor: "#EEF2F7",
  },
  previewCrop: {
    position: "absolute",
    top: sw(8),
    start: sw(8),
    width: sw(28),
    height: sw(28),
    borderRadius: sw(14),
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  previewRemove: {
    position: "absolute",
    top: sw(8),
    end: sw(8),
    width: sw(28),
    height: sw(28),
    borderRadius: sw(14),
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: sw(8),
    marginTop: sw(12),
  },
  selPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
    maxWidth: "100%",
    backgroundColor: "#F1F5F9",
    borderRadius: 999,
    paddingHorizontal: sw(10),
    paddingVertical: sw(6),
  },
  selPillText: {
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
    fontSize: sf(12),
    color: Colors.textBody,
    flexShrink: 1,
  },
  inputFoot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: sw(10),
  },
  errorText: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: "#DC2626",
    flex: 1,
  },
  counter: {
    fontFamily: Fonts.medium,
    fontSize: sf(11),
    color: Colors.textMuted,
  },

  sectionLabel: {
    fontFamily: Fonts.bold,
    fontWeight: "700",
    fontSize: sf(11),
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Colors.textMuted,
    marginBottom: sw(12),
  },
  typeChips: { flexDirection: "row", flexWrap: "wrap", gap: sw(7) },
  typeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(5),
    paddingHorizontal: sw(10),
    paddingVertical: sw(6),
    borderRadius: sw(999),
    borderWidth: 1,
  },
  typeChipText: {
    fontFamily: Fonts.medium,
    fontWeight: "500",
    fontSize: sf(11),
    lineHeight: sf(14),
  },

  attachRow: {
    flexDirection: "row",
    gap: sw(10),
  },
  attachTile: {
    flex: 1,
    alignItems: "center",
    gap: sw(8),
    paddingVertical: sw(14),
    borderRadius: sw(14),
    backgroundColor: "#FBFCFE",
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  attachIcon: {
    width: sw(38),
    height: sw(38),
    borderRadius: sw(12),
    alignItems: "center",
    justifyContent: "center",
  },
  attachTileLabel: {
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
    fontSize: sf(12),
    color: Colors.textBody,
  },

  postButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(8),
    paddingVertical: sw(15),
    backgroundColor: Colors.brandPrimaryDeep,
    borderRadius: sw(14),
  },
  postButtonDisabled: { opacity: 0.4 },
  postButtonText: {
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    fontWeight: "700",
    color: "#fff",
    lineHeight: sf(20),
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: sw(24),
  },
  modalContainer: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: sw(24),
    padding: sw(24),
    alignItems: "center",
  },
  modalIcon: {
    width: sw(56),
    height: sw(56),
    borderRadius: sw(28),
    backgroundColor: "#10B981",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: sw(16),
  },
  modalTitle: {
    fontSize: sf(18),
    fontFamily: Fonts.bold,
    fontWeight: "700",
    textAlign: "center",
    color: Colors.textPrimary,
    marginBottom: sw(6),
  },
  modalSub: {
    fontSize: sf(13),
    lineHeight: sf(19),
    fontFamily: Fonts.regular,
    textAlign: "center",
    color: Colors.textSecondary,
    marginBottom: sw(20),
  },
  modalButton: {
    alignSelf: "stretch",
    backgroundColor: Colors.brandPrimaryDeep,
    paddingVertical: sw(13),
    borderRadius: sw(12),
    alignItems: "center",
  },
  modalButtonText: {
    color: "#fff",
    fontSize: sf(14),
    fontFamily: Fonts.bold,
    fontWeight: "700",
  },

  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: sw(24),
    borderTopRightRadius: sw(24),
    paddingHorizontal: sw(20),
    paddingTop: sw(12),
    paddingBottom: sw(28),
  },
  sheetHandle: {
    alignSelf: "center",
    width: sw(40),
    height: sw(4),
    borderRadius: 999,
    backgroundColor: "#E2E8F0",
    marginBottom: sw(16),
  },
  sheetTitle: {
    fontFamily: Fonts.bold,
    fontWeight: "700",
    fontSize: sf(15),
    color: Colors.textPrimary,
    marginBottom: sw(16),
  },
  feelingGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: sw(10),
  },
  feelingItem: {
    width: "22%",
    alignItems: "center",
    gap: sw(6),
    paddingVertical: sw(12),
    borderRadius: sw(14),
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    backgroundColor: "#FBFCFE",
  },
  feelingItemActive: {
    borderColor: Colors.brandPrimaryDeep,
    backgroundColor: "#D1FAF5",
  },
  feelingEmoji: {
    fontSize: sf(22),
    ...Platform.select({
      android: { lineHeight: sf(30), includeFontPadding: false },
      default: {},
    }),
  },
  feelingLabel: {
    fontFamily: Fonts.medium,
    fontWeight: "500",
    fontSize: sf(11),
    color: Colors.textBody,
    ...Platform.select({
      android: {
        textAlign: "center",
        lineHeight: sf(15),
        includeFontPadding: false,
        alignSelf: "stretch",
      },
      default: {},
    }),
  },
});
