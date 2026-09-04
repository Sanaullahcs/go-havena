import React, { useState, useEffect, useMemo, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Pressable, Keyboard, Modal } from "react-native";
import LocaleTextInput from "../../../components/ui/locale-text-input";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import ScreenHeader from "../../../components/layout/screen-header";
import KeyboardSafeScreen from "../../../components/layout/keyboard-safe-screen";
import UserAvatar from "../../../components/ui/user-avatar";
import { Fonts } from "../../../constants/font";
import { Colors, Layout } from "../../../constants/tokens";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
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
import { sw, sf, hp } from "../../../utils/responsive";
import { hasFieldErrors, LIMITS, validateFeedPostForm } from "../../../utils/form-validation";
import GuestFeatureErrorState from "../../../components/guest/guest-permission-denied-state";
import { isFeatureAccessBlockedError } from "../../../utils/guest-permission-errors";
import { resolveLoadRestriction } from "../../../utils/account-access-sync";
import { useLanguage } from "../../../providers/language-provider";
import { syncKeyboardForFocusedInput } from "../../../utils/native-app-locale";
import { rnShadow } from "../../../utils/shadow";


const TYPE_ICONS = {
  Recommendations: "star",
  Events: "calendar",
  Help: "help-circle",
  Neighborhood: "map-pin",
  Announcements: "bell",
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
  const [initialRemoteImageUrl, setInitialRemoteImageUrl] = useState(null);
  const [loadingPost, setLoadingPost] = useState(isEditing);
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [feeling, setFeeling] = useState(null);
  const [location, setLocation] = useState(null);
  const [feelingModal, setFeelingModal] = useState(false);
  const [user, setUser] = useState(null);
  const [restrictionError, setRestrictionError] = useState(null);
  const { touch, clearError, showError, validateOnSubmit } = useTouchedFieldErrors();

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

  const liveErrors = useMemo(
    () => validateFeedPostForm({ body: postText, hasImage: Boolean(attachedImage) }),
    [postText, attachedImage],
  );

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
    setAttachedImage(null);
    setShowDone(
      postText.trim().length > 0 || Boolean(feeling) || Boolean(location),
    );
  };

  const handlePost = () => {
    if (submitting || loadingPost) return;
    if (!validateOnSubmit(liveErrors)) return;

    run(async () => {
      Keyboard.dismiss();

      const communityId = await ensureFeedCommunityContext();
      if (!communityId) {
        throw new Error(t("feed.createPost.joinCommunityError"));
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
              <View style={styles.previewWrap}>
                <Image source={{ uri: attachedImage.uri }} style={styles.previewImage} contentFit="cover" />
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

            <View style={styles.inputFoot}>
              {showError("body", liveErrors) ? (
                <Text style={styles.errorText}>{showError("body", liveErrors)}</Text>
              ) : (
                <View />
              )}
              <Text style={styles.counter}>
                {postText.length}/{LIMITS.feedPost}
              </Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionLabel}>{t("feed.createPost.postType")}</Text>
            <View style={styles.typeChips}>
              {POST_TYPE_OPTIONS.map((option) => {
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
                      color={selected ? option.text : Colors.textMuted}
                    />
                    <Text
                      style={[
                        styles.typeChipText,
                        { color: selected ? option.text : Colors.textBody },
                      ]}
                    >
                      {t(option.labelKey)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

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
        </KeyboardSafeScreen>
        )}
      </SafeAreaView>

      <Modal
        visible={feelingModal}
        transparent
        animationType="fade"
        onRequestClose={() => setFeelingModal(false)}
      >
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
  },
  feelingLabel: {
    fontFamily: Fonts.medium,
    fontWeight: "500",
    fontSize: sf(11),
    color: Colors.textBody,
  },
});
