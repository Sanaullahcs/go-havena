import React, { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Share,
  Platform,
  Animated,
  ScrollView,
} from "react-native";
import { useTranslation } from "react-i18next";
import i18n from "../../../i18n";
import { getLocaleForLang } from "../../../hooks/use-app-locale";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { chevronBack, chevronForward } from "../../../utils/rtl";
import { rnShadow } from "../../../utils/shadow";
import { Fonts } from "../../../constants/font";
import UserAvatar from "../../../components/ui/user-avatar";
import CrispImage from "../../../components/ui/crisp-image";
import {
  fetchListing,
  toggleSaveListing,
  deleteListing,
  markListingSold,
  isServiceListingType,
} from "../../../services/listings-api";
import { getUser } from "../../../services/auth-session";
import { resolveMediaUrl } from "../../../utils/profile-display";
import { useAppDialog } from "../../../providers/app-dialog-provider";
import { MarketplaceRoutes } from "../../../constants/marketplace-routes";
import ListingOfferSheet from "../../../components/marketplace/listing-offer-sheet";
import { startListingConversation } from "../../../services/messages-api";
import {
  formatListingPrice,
  formatListingTimeAgo,
  listingCondition,
  getListingImageUrl,
  normalizeListingImages,
  listingTypeLabel,
} from "../../../components/marketplace/listing-grid-card";

const { width: SCREEN_W } = Dimensions.get("window");
const HERO_H = Math.round(SCREEN_W * 0.92);
const SHEET_OVERLAP = 18;
const CARD_RADIUS = 24;
const LISTING_ACTION_HEIGHT = 46;
const LISTING_BOTTOM_BAR_TOP_PAD = 10;
const LISTING_SCROLL_BOTTOM_BUFFER = 8;

function formatMemberSince(iso) {
  if (!iso) return i18n.t("marketplace.member");
  try {
    return i18n.t("marketplace.memberSince", {
      date: new Date(iso).toLocaleDateString(getLocaleForLang(i18n.language), {
        month: "short",
        year: "numeric",
      }),
    });
  } catch {
    return i18n.t("marketplace.member");
  }
}

function statusMeta(status) {
  switch (status) {
    case "pending":
      return {
        label: i18n.t("marketplace.pendingReview"),
        message: i18n.t("marketplace.pendingReviewMsg"),
        bg: "#FFFBEB",
        border: "#FEF3C7",
        color: "#B45309",
        icon: "time-outline",
      };
    case "rejected":
      return {
        label: i18n.t("marketplace.notApproved"),
        message: i18n.t("marketplace.notApprovedMsg"),
        bg: "#FEF2F2",
        border: "#FECACA",
        color: "#DC2626",
        icon: "close-circle-outline",
      };
    case "sold":
      return {
        label: i18n.t("marketplace.sold"),
        message: i18n.t("marketplace.soldMsg"),
        bg: "#F3F4F6",
        border: "#E5E7EB",
        color: "#374151",
        icon: "checkmark-done-outline",
      };
    default:
      return null;
  }
}

function HeaderBtn({ onPress, children, filled }) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[styles.headerBtn, filled && styles.headerBtnFilled]}
    >
      {children}
    </TouchableOpacity>
  );
}

function DetailRow({ icon, label, value, isLast = false }) {
  if (!value) return null;
  return (
    <View style={[styles.detailRow, isLast && styles.detailRowLast]}>
      <View style={styles.detailRowLeft}>
        <View style={styles.detailRowIcon}>
          <Ionicons name={icon} size={15} color="#14B8A6" />
        </View>
        <Text style={styles.detailRowLabel}>{label}</Text>
      </View>
      <Text style={styles.detailRowValue}>{value}</Text>
    </View>
  );
}

function SectionHeader({ title, accent = "#14B8A6" }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={[styles.sectionAccent, { backgroundColor: accent }]} />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

export default function ListingDetailScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams();
  const { showConfirm, showSuccess, showError } = useAppDialog();
  const scrollY = useRef(new Animated.Value(0)).current;

  const [listing, setListing] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ownerBusy, setOwnerBusy] = useState(false);
  const [messageBusy, setMessageBusy] = useState(false);
  const [offerSheetVisible, setOfferSheetVisible] = useState(false);
  const [offerBusy, setOfferBusy] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [heroFailed, setHeroFailed] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const user = await getUser();
      setCurrentUserId(user?.id ?? null);
      const data = await fetchListing(id);
      setListing(data);
      setPhotoIndex(0);
      setHeroFailed(false);
    } catch {
      setListing(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const images = normalizeListingImages(listing?.images);
  const currentImage = images[photoIndex] ?? null;

  const handleSave = async () => {
    if (!listing || listing._saving) return;
    setListing((prev) => (prev ? { ...prev, _saving: true } : prev));
    try {
      const res = await toggleSaveListing(listing.id);
      const saved = Boolean(res?.saved);
      setListing((prev) => {
        if (!prev) return prev;
        const delta = saved && !prev.is_saved ? 1 : !saved && prev.is_saved ? -1 : 0;
        return {
          ...prev,
          _saving: false,
          is_saved: saved,
          save_count: Math.max(0, (prev.save_count ?? 0) + delta),
        };
      });
    } catch {
      setListing((prev) => (prev ? { ...prev, _saving: false } : prev));
    }
  };

  const handleShare = async () => {
    if (!listing) return;
    try {
      await Share.share({
        message: `${listing.title} — ${formatListingPrice(listing.price)}`,
      });
    } catch {
      // ignore
    }
  };

  const openChat = (conversationId, extra = {}) => {
    router.push({
      pathname: "/screens/messages/chat",
      params: {
        conversationId: String(conversationId),
        recipientName: listing?.seller_name ?? t("marketplace.seller"),
        listingId: listing?.id ? String(listing.id) : undefined,
        ...extra,
      },
    });
  };

  const handleMessage = async () => {
    if (!listing || messageBusy) return;
    if (listing.status === "sold") return;
    if (currentUserId != null && Number(listing.user_id) === Number(currentUserId)) return;

    setMessageBusy(true);
    try {
      const data = await startListingConversation({
        recipientId: listing.user_id,
        listingId: listing.id,
      });
      openChat(data.conversation_id, {
        initialDraft: t("marketplace.isThisAvailable"),
      });
    } catch (err) {
      showError(t("marketplace.couldNotStartChat"), err?.message ?? t("marketplace.pleaseTryAgain"));
    } finally {
      setMessageBusy(false);
    }
  };

  const handleOfferSubmit = async ({ offerAmount, message }) => {
    if (!listing || offerBusy) return;

    setOfferBusy(true);
    try {
      const data = await startListingConversation({
        recipientId: listing.user_id,
        listingId: listing.id,
        offerAmount,
        message: message || undefined,
      });
      setOfferSheetVisible(false);
      openChat(data.conversation_id);
    } catch (err) {
      showError(t("marketplace.couldNotSendOffer"), err?.message ?? t("marketplace.pleaseTryAgain"));
    } finally {
      setOfferBusy(false);
    }
  };

  const isOwner =
    listing &&
    currentUserId != null &&
    Number(listing.user_id) === Number(currentUserId);

  const handleEdit = () => {
    router.push({
      pathname: MarketplaceRoutes.CREATE_LISTING,
      params: { editId: String(listing.id) },
    });
  };

  const handleDelete = async () => {
    const confirmed = await showConfirm(
      t("marketplace.deleteListing"),
      t("marketplace.deleteCannotUndo"),
      { confirmLabel: t("common.delete"), destructive: true },
    );
    if (confirmed !== "confirm") return;

    setOwnerBusy(true);
    try {
      await deleteListing(listing.id);
      await showSuccess(t("marketplace.listingDeleted"), t("marketplace.listingDeletedMsg"));
      router.back();
    } catch {
      showError(t("marketplace.couldNotDelete"), t("marketplace.pleaseTryAgain"));
    } finally {
      setOwnerBusy(false);
    }
  };

  const handleMarkSold = async () => {
    const confirmed = await showConfirm(
      t("marketplace.markAsSold"),
      t("marketplace.markAsSoldMsg"),
      { confirmLabel: t("marketplace.markAsSold") },
    );
    if (confirmed !== "confirm") return;

    setOwnerBusy(true);
    try {
      await markListingSold(listing.id);
      setListing((prev) => (prev ? { ...prev, status: "sold" } : prev));
      await showSuccess(t("marketplace.markedAsSold"), t("marketplace.markedAsSoldMsg"));
    } catch {
      showError(t("marketplace.couldNotUpdate"), t("marketplace.onlyApprovedSold"));
    } finally {
      setOwnerBusy(false);
    }
  };

  const heroOpacity = scrollY.interpolate({
    inputRange: [0, HERO_H * 0.6],
    outputRange: [1, 0.85],
    extrapolate: "clamp",
  });

  const headerBgOpacity = scrollY.interpolate({
    inputRange: [0, HERO_H * 0.35],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color="#14B8A6" />
      </View>
    );
  }

  if (!listing) {
    return (
      <View style={styles.loadingWrap}>
        <Text style={styles.errorText}>{t("marketplace.listingNotFound")}</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backLink}>
          <Text style={styles.backLinkText}>{t("marketplace.goBack")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const likes = listing.save_count ?? 0;
  const bottomInset = Math.max(insets.bottom, 8);
  const footerPad =
    LISTING_ACTION_HEIGHT +
    LISTING_BOTTOM_BAR_TOP_PAD +
    bottomInset +
    LISTING_SCROLL_BOTTOM_BUFFER;
  const condition = listingCondition(listing);
  const locationText = listing.location?.trim() || null;
  const categoryText = listing.category?.trim() || null;
  const isItemListing = listing.type === "for_sale" || listing.type === "item";
  const isServiceListing = isServiceListingType(listing.type);
  const conditionText = condition || (isItemListing ? t("marketplace.notSpecified") : null);
  const statusInfo = statusMeta(listing.status);
  const canMarkSold = isOwner && listing.status === "approved";
  const canEdit = isOwner && listing.status !== "sold";
  const isSold = listing.status === "sold";

  return (
    <View style={styles.container}>
      {/* Fixed parallax hero */}
      <Animated.View
        style={[
          styles.heroFixed,
          { height: HERO_H, opacity: heroOpacity },
        ]}
      >
        {currentImage && !heroFailed ? (
          <CrispImage
            source={currentImage}
            style={styles.heroImage}
            contentFit="cover"
            contentPosition="center"
            transition={250}
            onError={() => setHeroFailed(true)}
          />
        ) : (
          <View style={styles.heroPlaceholder}>
            <Ionicons name="image-outline" size={48} color="#C7CDD6" />
          </View>
        )}

        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(15, 23, 42, 0.45)', pointerEvents: "none" }]}
        />

        <View style={styles.heroStats}>
          <View style={styles.heroStatPill}>
            <Ionicons
              name={listing.is_saved ? "heart" : "heart-outline"}
              size={11}
              color={listing.is_saved ? "#FCA5A5" : "#FFFFFF"}
            />
            <Text style={styles.heroStatText}>{t("marketplace.saved", { count: likes })}</Text>
          </View>
          {images.length > 1 ? (
            <View style={styles.heroStatPill}>
              <Ionicons name="images-outline" size={11} color="#FFFFFF" />
              <Text style={styles.heroStatText}>
                {photoIndex + 1}/{images.length}
              </Text>
            </View>
          ) : null}
        </View>
      </Animated.View>

      {/* Scrollable detail sheet */}
      <Animated.ScrollView
        style={styles.scrollLayer}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        bounces
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
        })}
        contentContainerStyle={{
          paddingTop: HERO_H - SHEET_OVERLAP,
          paddingBottom: footerPad,
        }}
      >
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />

          {statusInfo && (isOwner || listing.status === "sold") ? (
            <View
              style={[
                styles.statusBanner,
                { backgroundColor: statusInfo.bg, borderColor: statusInfo.border },
              ]}
            >
              <Ionicons name={statusInfo.icon} size={18} color={statusInfo.color} />
              <View style={styles.statusBannerText}>
                <Text style={[styles.statusBannerTitle, { color: statusInfo.color }]}>
                  {statusInfo.label}
                </Text>
                <Text style={styles.statusBannerMessage}>{statusInfo.message}</Text>
              </View>
            </View>
          ) : null}

          {images.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.thumbRow}
            >
              {images.map((uri, i) => (
                <TouchableOpacity
                  key={`${uri}-${i}`}
                  activeOpacity={0.9}
                  onPress={() => {
                    setPhotoIndex(i);
                    setHeroFailed(false);
                  }}
                  style={[styles.thumb, i === photoIndex && styles.thumbActive]}
                >
                  <CrispImage source={uri} style={styles.thumbImage} contentFit="cover" />
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : null}

          <View style={styles.priceRow}>
            <Text style={styles.price}>{formatListingPrice(listing.price)}</Text>
            <View style={styles.priceMeta}>
              {listing.type ? (
                <View style={styles.typeChip}>
                  <Text style={styles.typeChipText}>{listingTypeLabel(listing.type)}</Text>
                </View>
              ) : null}
            </View>
          </View>

          <Text style={styles.title}>{listing.title}</Text>
<SectionHeader title={t("marketplace.details")} />
          <View style={styles.detailsCard}>
            <DetailRow
              icon="grid-outline"
              label={t("marketplace.category")}
              value={categoryText || t("marketplace.notSpecified")}
            />
            {conditionText ? (
              <DetailRow icon="sparkles-outline" label={t("marketplace.condition")} value={conditionText} />
            ) : null}
            {locationText ? (
              <DetailRow icon="location-outline" label={t("marketplace.location")} value={locationText} />
            ) : null}
            <DetailRow
              icon="calendar-outline"
              label={t("marketplace.posted")}
              value={formatListingTimeAgo(listing.created_at) || "—"}
              isLast
            />
          </View>

          <SectionHeader title={t("marketplace.description")} />
          <Text style={styles.description}>
            {listing.description?.trim() || t("marketplace.noDescription")}
          </Text>

          <SectionHeader title={t("marketplace.seller")} accent="#111827" />
          <TouchableOpacity style={styles.sellerCard} activeOpacity={0.88} onPress={handleMessage}>
            <UserAvatar
              name={listing.seller_name}
              source={resolveMediaUrl(listing.seller_avatar)}
              size={44}
            />
            <View style={styles.sellerInfo}>
              <View style={styles.sellerNameRow}>
                <Text style={styles.sellerName}>{listing.seller_name ?? t("marketplace.resident")}</Text>
                {listing.is_verified ? (
                  <Ionicons name="checkmark-circle" size={16} color="#14B8A6" />
                ) : null}
              </View>
              <Text style={styles.sellerMeta}>
                {listing.seller_unit ? t("marketplace.unitLabel", { unit: listing.seller_unit }) : t("marketplace.communityMember")}
                {" · "}
                {formatMemberSince(listing.seller_member_since)}
              </Text>
              <Text style={styles.sellerMeta}>
                {t("marketplace.listingCount", { count: listing.seller_listings_count ?? 0 })}
              </Text>
            </View>
            <Ionicons name={chevronForward()} size={16} color="#CBD5E1" />
          </TouchableOpacity>

          <View style={styles.alertCardYellow}>
            <View style={styles.alertIconYellow}>
              <Ionicons name="shield-checkmark" size={16} color="#D97706" />
            </View>
            <Text style={styles.alertText}>
              <Text style={styles.alertBoldYellow}>{t("marketplace.staySafe")}</Text>
              {t("marketplace.staySafeItem")}
            </Text>
          </View>

          <View style={styles.alertCardBlue}>
            <View style={styles.alertIconBlue}>
              <Ionicons name="information-circle" size={16} color="#14B8A6" />
            </View>
            <Text style={styles.alertText}>
              <Text style={styles.alertBoldBlue}>{t("marketplace.aboutReviews")}</Text>
              {t("marketplace.aboutReviewsMsg")}
            </Text>
          </View>
        </View>
      </Animated.ScrollView>

      {/* Floating header */}
      <View style={[styles.floatingHeader, { paddingTop: insets.top + 6, pointerEvents: "box-none" }]}>
        <Animated.View
          style={[styles.headerScrim, { opacity: headerBgOpacity, pointerEvents: "none" }]}
        />
        <View style={[styles.headerRow, { pointerEvents: "box-none" }]}>
          <HeaderBtn onPress={() => router.back()}>
            <Ionicons name={chevronBack()} size={20} color="#FFFFFF" />
          </HeaderBtn>

          <View style={styles.headerRight}>
            <HeaderBtn onPress={handleShare}>
              <Ionicons name="share-outline" size={17} color="#FFFFFF" />
            </HeaderBtn>
            <HeaderBtn onPress={handleSave} filled={listing.is_saved}>
              <Ionicons
                name={listing.is_saved ? "heart" : "heart-outline"}
                size={17}
                color={listing.is_saved ? "#EF4444" : "#FFFFFF"}
              />
            </HeaderBtn>
          </View>
        </View>
      </View>

      {/* Bottom actions */}
      <View
        style={[
          styles.bottomBar,
          { paddingTop: LISTING_BOTTOM_BAR_TOP_PAD, paddingBottom: bottomInset },
        ]}
      >
        {isOwner ? (
          <>
            {canEdit ? (
              <TouchableOpacity
                style={styles.ownerActionBtn}
                activeOpacity={0.9}
                onPress={handleEdit}
                disabled={ownerBusy}
              >
                <Ionicons name="create-outline" size={16} color="#14B8A6" />
                <Text style={styles.ownerActionText}>{t("common.edit")}</Text>
              </TouchableOpacity>
            ) : null}
            {canMarkSold ? (
              <TouchableOpacity
                style={styles.ownerActionBtn}
                activeOpacity={0.9}
                onPress={handleMarkSold}
                disabled={ownerBusy}
              >
                <Ionicons name="checkmark-done-outline" size={16} color="#059669" />
                <Text style={[styles.ownerActionText, { color: "#059669" }]}>{t("marketplace.markSold")}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[styles.ownerActionBtn, styles.ownerDeleteBtn]}
              activeOpacity={0.9}
              onPress={handleDelete}
              disabled={ownerBusy}
            >
              <Ionicons name="trash-outline" size={16} color="#DC2626" />
              <Text style={[styles.ownerActionText, { color: "#DC2626" }]}>{t("common.delete")}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity
              style={[styles.messageBtn, (isSold || messageBusy) && styles.btnDisabled]}
              activeOpacity={0.9}
              onPress={handleMessage}
              disabled={isSold || messageBusy}
            >
              {messageBusy ? (
                <ActivityIndicator size="small" color="#14B8A6" />
              ) : (
                <>
                  <Ionicons name="chatbubble-outline" size={16} color="#14B8A6" />
                  <Text style={styles.messageBtnText}>{t("marketplace.message")}</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.offerBtn, isSold && styles.btnDisabled]}
              activeOpacity={0.9}
              onPress={() => setOfferSheetVisible(true)}
              disabled={isSold}
            >
              <View
                style={[
                  styles.offerBtnGradient,
                  { backgroundColor: isSold ? "#9CA3AF" : "#14B8A6" },
                ]}
              >
                <Ionicons name="logo-usd" size={16} color="#FFFFFF" />
                <Text style={styles.offerBtnText}>
                  {isSold ? t("marketplace.sold") : isServiceListing ? t("marketplace.requestQuote") : t("marketplace.makeOffer")}
                </Text>
              </View>
            </TouchableOpacity>
          </>
        )}
      </View>

      <ListingOfferSheet
        visible={offerSheetVisible}
        listing={
          listing
            ? {
                id: listing.id,
                title: listing.title,
                price: listing.price,
                image_url: getListingImageUrl(listing),
              }
            : null
        }
        loading={offerBusy}
        onClose={() => !offerBusy && setOfferSheetVisible(false)}
        onSubmit={handleOfferSubmit}
      />
    </View>
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
    backgroundColor: "#FFFFFF",
  },
  errorText: {
    fontFamily: Fonts.medium,
    fontSize: 15,
    color: "#6B7280",
  },
  backLink: {
    marginTop: 12,
    padding: 8,
  },
  backLinkText: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: "#14B8A6",
  },
  heroFixed: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    overflow: "hidden",
    backgroundColor: "#F3F4F6",
    zIndex: 0,
  },
  heroImage: {
    width: SCREEN_W,
    height: HERO_H,
  },
  heroPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF0F3",
  },
  heroStats: {
    position: "absolute",
    bottom: SHEET_OVERLAP + 14,
    start: 16,
    end: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  heroStatPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(0, 0, 0, 0.42)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
  },
  heroStatText: {
    fontFamily: Fonts.medium,
    fontSize: 11,
    color: "#FFFFFF",
  },
  scrollLayer: {
    flex: 1,
    zIndex: 1,
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: CARD_RADIUS,
    borderTopRightRadius: CARD_RADIUS,
    overflow: "hidden",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    ...Platform.select({
      ios: {
        ...rnShadow({ color: "#0F172A", offset: { width: 0, height: -4 }, opacity: 0.08, radius: 12 }),
      },
      android: { elevation: 8 },
    }),
  },
  sheetHandle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#E5E7EB",
    marginBottom: 12,
  },
  thumbRow: {
    gap: 8,
    paddingBottom: 16,
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "transparent",
  },
  thumbActive: {
    borderColor: "#14B8A6",
  },
  thumbImage: {
    width: "100%",
    height: "100%",
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  priceMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    justifyContent: "flex-end",
    flexShrink: 1,
    maxWidth: "55%",
  },
  typeChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  typeChipText: {
    fontFamily: Fonts.medium,
    fontSize: 11,
    color: "#374151",
  },
  statusBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 14,
  },
  statusBannerText: {
    flex: 1,
    minWidth: 0,
  },
  statusBannerTitle: {
    fontFamily: Fonts.bold,
    fontSize: 13,
    fontWeight: "700",
  },
  statusBannerMessage: {
    marginTop: 2,
    fontFamily: Fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    color: "#4B5563",
  },
  price: {
    fontFamily: Fonts.bold,
    fontSize: 26,
    lineHeight: 32,
    color: "#000000",
    fontWeight: "700",
    letterSpacing: -0.5,
    flexShrink: 1,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#D1FAF5",
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.15)",
  },
  categoryChipText: {
    fontFamily: Fonts.medium,
    fontSize: 12,
    color: "#14B8A6",
  },
  title: {
    marginTop: 4,
    fontFamily: Fonts.bold,
    fontSize: 17,
    lineHeight: 23,
    color: "#111827",
    fontWeight: "700",
  },
  detailsCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#EEF2F6",
    backgroundColor: "#F9FAFB",
    overflow: "hidden",
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  detailRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
  },
  detailRowIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: "#D1FAF5",
    alignItems: "center",
    justifyContent: "center",
  },
  detailRowLabel: {
    fontFamily: Fonts.medium,
    fontSize: 13,
    color: "#64748B",
  },
  detailRowValue: {
    flex: 1,
    textAlign: "auto",
    fontFamily: Fonts.bold,
    fontSize: 13,
    color: "#111827",
    fontWeight: "700",
  },
  detailRowLast: {
    borderBottomWidth: 0,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 18,
    marginBottom: 8,
  },
  sectionAccent: {
    width: 3,
    height: 16,
    borderRadius: 999,
  },
  sectionTitle: {
    fontFamily: Fonts.bold,
    fontSize: 15,
    color: "#111827",
    fontWeight: "700",
  },
  description: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    lineHeight: 21,
    color: "#4B5563",
  },
  sellerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#EEF2F6",
  },
  sellerInfo: {
    flex: 1,
    minWidth: 0,
  },
  sellerNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sellerName: {
    fontFamily: Fonts.bold,
    fontSize: 14,
    color: "#111827",
    fontWeight: "700",
  },
  sellerMeta: {
    marginTop: 3,
    fontFamily: Fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    color: "#99A1AF",
  },
  alertCardYellow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 18,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FEF3C7",
  },
  alertIconYellow: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
  },
  alertCardBlue: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 12,
    marginBottom: 4,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#D1FAF5",
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.15)",
  },
  alertIconBlue: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: "rgba(20, 184, 166, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  alertText: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    color: "#374151",
  },
  alertBoldYellow: {
    fontFamily: Fonts.bold,
    color: "#D97706",
    fontWeight: "700",
  },
  alertBoldBlue: {
    fontFamily: Fonts.bold,
    color: "#14B8A6",
    fontWeight: "700",
  },
  floatingHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
  },
  headerScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  headerRight: {
    flexDirection: "row",
    gap: 10,
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.38)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.15)",
  },
  headerBtnFilled: {
    backgroundColor: "rgba(255,255,255,0.95)",
    borderColor: "rgba(239,68,68,0.2)",
  },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    backgroundColor: "#FFFFFF",
    ...Platform.select({
      ios: {
        ...rnShadow({ color: "#0F172A", offset: { width: 0, height: -3 }, opacity: 0.08, radius: 10 }),
      },
      android: { elevation: 10 },
    }),
  },
  ownerActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: LISTING_ACTION_HEIGHT,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  ownerDeleteBtn: {
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
  },
  ownerActionText: {
    fontFamily: Fonts.bold,
    fontSize: 13,
    color: "#14B8A6",
    fontWeight: "700",
  },
  btnDisabled: {
    opacity: 0.55,
  },
  messageBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: LISTING_ACTION_HEIGHT,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#14B8A6",
    backgroundColor: "#FFFFFF",
  },
  messageBtnText: {
    fontFamily: Fonts.bold,
    fontSize: 14,
    color: "#14B8A6",
    fontWeight: "700",
  },
  offerBtn: {
    flex: 1,
    height: LISTING_ACTION_HEIGHT,
    borderRadius: 12,
    overflow: "hidden",
  },
  offerBtnGradient: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: LISTING_ACTION_HEIGHT,
    borderRadius: 12,
  },
  offerBtnText: {
    fontFamily: Fonts.bold,
    fontSize: 14,
    color: "#FFFFFF",
    fontWeight: "700",
  },
});
