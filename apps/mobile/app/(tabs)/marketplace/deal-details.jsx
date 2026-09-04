import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { MarketplaceType } from "../../../constants/marketplace-type";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Linking,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import CrispImage from "../../../components/ui/crisp-image";
import { fetchDeal } from "../../../services/deals-api";
import { fetchBusiness } from "../../../services/businesses-api";
import { startConversation } from "../../../services/messages-api";
import { getUser } from "../../../services/auth-session";
import { Fonts } from "../../../constants/font";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import ScreenHeader from "../../../components/layout/screen-header";
import ThemedIconBox from "../../../components/ui/themed-icon-box";
import {
  MarketplaceRoutes,
  redeemCouponParams,
  providerProfileParams,
} from "../../../constants/marketplace-routes";
import { MarketplaceTheme } from "../../../constants/marketplace-theme";
import { MARKETPLACE_FEATURES } from "../../../constants/marketplace-features";
import { useAppDialog } from "../../../providers/app-dialog-provider";
import { sw, sf } from "../../../utils/responsive";
import { chevronForward } from "../../../utils/rtl";
import { localizedField } from "../../../i18n";
import { rnShadow } from "../../../utils/shadow";


const IMAGE_MAP = {
  "food-bowl": require("../../../assets/images/food-bowl.png"),
  fitness: require("../../../assets/images/fitness.png"),
  "sale-image": require("../../../assets/images/sale-image.png"),
  "ok-resturant": require("../../../assets/images/ok-resturant.png"),
};

function buildInterestMessage({ title, offerTag, vendor }, t) {
  return t("deals.interestMessage", { title, offerTag: offerTag || "", vendor: vendor || "" });
}

function buildContactDraft({ title }, t) {
  return t("deals.contactDraft", { title });
}

export default function DealDetails() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { showError } = useAppDialog();
  const params = useLocalSearchParams();
  const {
    id,
    businessId: businessIdParam,
    title: titleParam = "",
    vendor: vendorParam = "",
    description: descriptionParam = "",
    distance: distanceParam = "",
    validUntil: validUntilParam = "",
    offerTag: offerTagParam = "",
    isTrending = "0",
    imageKey = "food-bowl",
    imageUrl: imageUrlParam = "",
    role,
  } = params;

  const activeRole = role === "admin" || role === "resident" ? role : "resident";

  const [deal, setDeal] = useState(null);
  const [business, setBusiness] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [loadingMeta, setLoadingMeta] = useState(Boolean(id));
  const [contactBusy, setContactBusy] = useState(false);
  const [interestBusy, setInterestBusy] = useState(false);
  const [footerHeight, setFooterHeight] = useState(sw(168));

  const load = useCallback(async () => {
    if (!id) {
      setLoadingMeta(false);
      return;
    }
    setLoadingMeta(true);
    try {
      const [fetchedDeal, user] = await Promise.all([fetchDeal(id), getUser()]);
      setDeal(fetchedDeal);
      setCurrentUserId(user?.id ?? null);

      const bizId = fetchedDeal?.businessId ?? (businessIdParam ? Number(businessIdParam) : null);
      if (bizId) {
        try {
          const biz = await fetchBusiness(bizId);
          setBusiness(biz);
        } catch {
          setBusiness(null);
        }
      } else {
        setBusiness(null);
      }
    } catch {
      // Keep route-param fallbacks if the network fetch fails.
    } finally {
      setLoadingMeta(false);
    }
  }, [id, businessIdParam]);

  useEffect(() => {
    load();
  }, [load]);

  const title = localizedField(deal, "title") || deal?.title || titleParam;
  const vendor = deal?.vendor || vendorParam || business?.name || "";
  const description = localizedField(deal, "description") || deal?.description || descriptionParam;
  const distance = deal?.distance || distanceParam || business?.address || "";
  const validUntil = deal?.validUntil || validUntilParam;
  const offerTag = localizedField(deal, "offerTag") || deal?.offerTag || offerTagParam;
  const businessId = deal?.businessId ?? (businessIdParam ? String(businessIdParam) : null);
  const phone = business?.phone?.trim() || "";
  const recipientId = business?.ownerId ?? deal?.createdBy ?? null;
  const recipientName = business?.ownerName || vendor || t("marketplace.business");

  const isOwner =
    currentUserId != null &&
    recipientId != null &&
    Number(currentUserId) === Number(recipientId);

  const trending = isTrending === "1" || isTrending === "true" || !!deal?.isTrending;
  const heroImage =
    deal?.imageUrl || imageUrlParam || IMAGE_MAP[imageKey] || IMAGE_MAP["food-bowl"];

  const canContact = Boolean(recipientId) && !isOwner;
  const canCall = Boolean(phone) && !isOwner;
  const showResidentActions = canContact || canCall || MARKETPLACE_FEATURES.coupons;

  const TERMS = useMemo(
    () => [
      t("deals.termAvailability"),
      t("deals.termNoCombine"),
      MARKETPLACE_FEATURES.coupons
        ? t("deals.termOneCoupon")
        : t("deals.termOneOffer"),
      t("deals.termValidUntil", { date: validUntil || "—" }),
    ],
    [validUntil, t],
  );

  const openChat = (conversationId, extra = {}) => {
    router.push({
      pathname: "/screens/messages/chat",
      params: {
        conversationId: String(conversationId),
        recipientName,
        ...extra,
      },
    });
  };

  const handleCall = async () => {
    if (!phone) return;
    const url = `tel:${phone.replace(/[^\d+]/g, "")}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        await showError(t("deals.unableToCall"), t("deals.callingNotSupported"));
        return;
      }
      await Linking.openURL(url);
    } catch (err) {
      await showError(t("deals.unableToCall"), err?.message ?? t("common.tryAgain"));
    }
  };

  const handleMessage = async () => {
    if (!canContact || contactBusy || interestBusy) return;
    setContactBusy(true);
    try {
      const data = await startConversation(recipientId, {
        message: buildContactDraft({ title }, t),
      });
      openChat(data.conversation_id);
    } catch (err) {
      await showError(t("deals.couldNotStartChat"), err?.message ?? t("common.tryAgain"));
    } finally {
      setContactBusy(false);
    }
  };

  const handleInterest = async () => {
    if (!canContact || contactBusy || interestBusy) return;
    setInterestBusy(true);
    try {
      const data = await startConversation(recipientId, {
        message: buildInterestMessage({ title, offerTag, vendor }, t),
      });
      openChat(data.conversation_id);
    } catch (err) {
      await showError(t("deals.couldNotReachBusiness"), err?.message ?? t("common.tryAgain"));
    } finally {
      setInterestBusy(false);
    }
  };

  const footerPad = Math.max(insets.bottom, 16);
  const hasStickyFooter = isOwner || showResidentActions || loadingMeta;
  const scrollBottomPad = hasStickyFooter
    ? footerHeight + sw(20)
    : sw(28);

  const onFooterLayout = (event) => {
    const next = Math.ceil(event.nativeEvent.layout.height);
    if (next > 0) {
      setFooterHeight((prev) => (Math.abs(prev - next) < 2 ? prev : next));
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <ScreenHeader layout="inline" title={t("deals.dealDetails")} iconOnly />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: scrollBottomPad },
        ]}
      >
        <View style={styles.heroWrap}>
          <CrispImage
            source={heroImage}
            style={styles.heroImage}
            contentFit="cover"
          />
          {offerTag ? (
            <View
              style={[
                styles.offerBadge,
                { backgroundColor: trending ? "#FE9A00" : "#1B4F8A" },
              ]}
            >
              <Text style={styles.offerBadgeText}>{offerTag}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.dealTitle}>{title}</Text>
{description ? <Text style={styles.dealDesc}>{description}</Text> : null}
        </View>

        <View style={{ paddingHorizontal: 20, paddingBottom: 1 }}>
          {vendor ? (
            <TouchableOpacity
              style={styles.vendorRow}
              activeOpacity={0.7}
              onPress={() => {
                if (!businessId) return;
                router.push({
                  pathname: MarketplaceRoutes.PROVIDER_PROFILE,
                  params: providerProfileParams(
                    { id: businessId, name: vendor, distance },
                    activeRole,
                  ),
                });
              }}
            >
              <ThemedIconBox name="briefcase" size="md" />
              <View style={styles.vendorLeft}>
                <Text style={styles.vendorName}>{vendor}</Text>
                <Text style={styles.vendorHint}>
                  {businessId ? t("deals.viewBusinessProfile") : t("deals.localBusinessOffer")}
                </Text>
                {distance ? (
                  <View style={styles.vendorDistRow}>
                    <Feather name="map-pin" size={13} color="#6A7282" />
                    <Text style={styles.vendorDist}>{distance}</Text>
                  </View>
                ) : null}
                {phone ? (
                  <View style={styles.vendorDistRow}>
                    <Feather name="phone" size={13} color="#6A7282" />
                    <Text style={styles.vendorDist}>{phone}</Text>
                  </View>
                ) : null}
              </View>
              {businessId ? <Feather name={chevronForward()} size={18} color="#CBD5E1" /> : null}
            </TouchableOpacity>
          ) : null}
        </View>

        {validUntil ? (
          <View style={styles.validBox}>
            <View style={styles.validHeader}>
              <ThemedIconBox
                name="clock"
                size="sm"
                color="#D97706"
                backgroundColor="#FEF3C7"
              />
              <Text style={styles.validLabel}>{t("deals.validUntil")}</Text>
            </View>
            <Text style={styles.validDate}>{validUntil}</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("deals.howToUse")}</Text>
          <View style={styles.howCard}>
            <View style={styles.howRow}>
              <View style={styles.howStep}>
                <Text style={styles.howStepNum}>1</Text>
              </View>
              <Text style={styles.howText}>{t("deals.howStep1")}</Text>
            </View>
            <View style={styles.howRow}>
              <View style={styles.howStep}>
                <Text style={styles.howStepNum}>2</Text>
              </View>
              <Text style={styles.howText}>
                {t("deals.howStep2")}
              </Text>
            </View>
            <View style={styles.howRow}>
              <View style={styles.howStep}>
                <Text style={styles.howStepNum}>3</Text>
              </View>
              <Text style={styles.howText}>{t("deals.howStep3")}</Text>
            </View>
          </View>
        </View>

        {MARKETPLACE_FEATURES.coupons ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Image
                source={require("../../../assets/images/redeem.svg")}
                style={{ width: 20, height: 20 }}
              />
              <Text style={styles.sectionTitle}>{t("deals.howToRedeem")}</Text>
            </View>
            <View style={styles.redeemInfo}>
              <Text style={styles.redeemText}>
                {t("deals.showCouponToStaff")}
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("deals.termsAndConditions")}</Text>
          <View style={styles.termsList}>
            {TERMS.map((term, i) => (
              <View key={`term-${i}`} style={styles.termRow}>
                <View style={styles.bullet} />
                <Text style={styles.termText}>{term}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {isOwner ? (
        <View
          style={[styles.buttonWrap, { paddingBottom: footerPad }]}
          onLayout={onFooterLayout}
        >
          <View style={styles.ownerNote}>
            <Ionicons name="storefront-outline" size={16} color="#64748B" />
            <Text style={styles.ownerNoteText}>{t("deals.ownerNote")}</Text>
          </View>
        </View>
      ) : showResidentActions || loadingMeta ? (
        <View
          style={[styles.buttonWrap, { paddingBottom: footerPad }]}
          onLayout={onFooterLayout}
        >
          {loadingMeta && !canContact && !canCall ? (
            <ActivityIndicator color={MarketplaceTheme.accent} />
          ) : (
            <>
              {(canCall || canContact) ? (
                <View style={styles.secondaryRow}>
                  {canCall ? (
                    <TouchableOpacity
                      style={styles.callBtn}
                      activeOpacity={0.85}
                      onPress={handleCall}
                      accessibilityLabel={t("deals.callBusiness")}
                    >
                      <Ionicons name="call-outline" size={18} color={MarketplaceTheme.accent} />
                      <Text style={styles.callBtnText}>{t("deals.call")}</Text>
                    </TouchableOpacity>
                  ) : null}
                  {canContact ? (
                    <TouchableOpacity
                      style={[styles.messageBtn, contactBusy && styles.btnDisabled]}
                      activeOpacity={0.85}
                      onPress={handleMessage}
                      disabled={contactBusy || interestBusy}
                    >
                      {contactBusy ? (
                        <ActivityIndicator size="small" color={MarketplaceTheme.accent} />
                      ) : (
                        <>
                          <Ionicons name="chatbubble-outline" size={17} color={MarketplaceTheme.accent} />
                          <Text style={styles.messageBtnText}>{t("marketplace.message")}</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}

              {canContact ? (
                <TouchableOpacity
                  style={[styles.primaryBtn, interestBusy && styles.btnDisabled]}
                  activeOpacity={0.85}
                  onPress={handleInterest}
                  disabled={contactBusy || interestBusy}
                >
                  {interestBusy ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="pricetag-outline" size={18} color="#FFFFFF" />
                      <Text style={styles.primaryBtnText}>{t("deals.imInterested")}</Text>
                    </>
                  )}
                </TouchableOpacity>
              ) : null}

              {MARKETPLACE_FEATURES.coupons ? (
                <TouchableOpacity
                  style={styles.redeemBtn}
                  activeOpacity={0.85}
                  onPress={() =>
                    router.push({
                      pathname: MarketplaceRoutes.REDEEM_COUPON,
                      params: redeemCouponParams({ title, vendor }, "resident"),
                    })
                  }
                >
                  <Text style={styles.redeemBtnText}>{t("deals.redeemThisCoupon")}</Text>
                </TouchableOpacity>
              ) : null}

              {!canContact && !canCall && !MARKETPLACE_FEATURES.coupons ? (
                <Text style={styles.unavailableText}>
                  {t("deals.contactUnavailable")}
                </Text>
              ) : null}
            </>
          )}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: MarketplaceTheme.screenBg,
  },
  scrollContent: {
    flexGrow: 1,
  },
  heroWrap: {
    position: "relative",
    marginHorizontal: 20,
    marginTop: 8,
    height: 200,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#E5E7EB",
  },
  heroImage: {
    width: "100%",
    height: "100%",
  },
  offerBadge: {
    position: "absolute",
    bottom: 12,
    end: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  offerBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.bodyMd,
    color: "#FFFFFF",
    fontWeight: "700",
  },
  section: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 8,
  },
  dealTitle: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.title,
    lineHeight: MarketplaceType.titleLine,
    color: "#0F172A",
    fontWeight: "700",
  },
  dealDesc: {
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.body,
    lineHeight: MarketplaceType.bodyMdLine,
    color: "#475467",
  },
  vendorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  vendorLeft: {
    flex: 1,
    gap: 4,
  },
  vendorName: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.heading,
    lineHeight: MarketplaceType.stat,
    color: "#0F172A",
    fontWeight: "700",
  },
  vendorHint: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: "#64748B",
  },
  vendorDistRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  vendorDist: {
    fontFamily: Fonts.medium,
    fontSize: MarketplaceType.body,
    color: "#6A7282",
    lineHeight: MarketplaceType.headingLine,
    fontWeight: "500",
  },
  validBox: {
    marginHorizontal: 20,
    marginVertical: 14,
    borderWidth: 1,
    borderColor: "#FDE68A",
    borderRadius: 12,
    backgroundColor: "#FFFBEB",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  validHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  validLabel: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.caption,
    color: "#7B3306",
    fontWeight: "700",
  },
  validDate: {
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.body,
    color: "#BB4D00",
    fontWeight: "400",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionTitle: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.heading,
    lineHeight: 27,
    color: "#000000",
    fontWeight: "700",
  },
  howCard: {
    marginTop: 4,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
    gap: 12,
  },
  howRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  howStep: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: MarketplaceTheme.accentSoft,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  howStepNum: {
    fontFamily: Fonts.bold,
    fontSize: sf(11),
    color: MarketplaceTheme.accent,
    fontWeight: "700",
  },
  howText: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.body,
    lineHeight: MarketplaceType.bodyMdLine,
    color: "#475467",
  },
  redeemInfo: {
    marginTop: 12,
    backgroundColor: "#F9FAFB",
    padding: 12,
    borderRadius: 14,
  },
  redeemText: {
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.body,
    lineHeight: MarketplaceType.bodyMdLine,
    color: "#4A5565",
  },
  termsList: {
    gap: 12,
    marginTop: 8,
    width: "100%",
  },
  termRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    width: "100%",
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#10B981",
    marginTop: 8,
    flexShrink: 0,
  },
  termText: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.body,
    lineHeight: MarketplaceType.headingLine,
    color: "#4A5565",
  },
  buttonWrap: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 10,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderColor: "#F3F4F6",
    ...Platform.select({
      ios: {
        ...rnShadow({ color: "#0F172A", offset: { width: 0, height: -4 }, opacity: 0.06, radius: 10 }),
      },
      android: { elevation: 8 },
    }),
  },
  secondaryRow: {
    flexDirection: "row",
    gap: 10,
  },
  callBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minWidth: sw(96),
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: MarketplaceTheme.accentSoft,
    borderWidth: 1,
    borderColor: MarketplaceTheme.accentBorder,
  },
  callBtnText: {
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    color: MarketplaceTheme.accent,
    fontWeight: "700",
  },
  messageBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: MarketplaceTheme.accent,
  },
  messageBtnText: {
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    color: MarketplaceTheme.accent,
    fontWeight: "700",
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: MarketplaceTheme.accent,
    borderRadius: 12,
    paddingVertical: 15,
  },
  primaryBtnText: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.heading,
    color: "#FFFFFF",
    fontWeight: "700",
    lineHeight: MarketplaceType.stat,
  },
  redeemBtn: {
    backgroundColor: "#059669",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  redeemBtnText: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.heading,
    color: "#FFFFFF",
    fontWeight: "700",
  },
  btnDisabled: {
    opacity: 0.7,
  },
  ownerNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  ownerNoteText: {
    flex: 1,
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: "#64748B",
    lineHeight: sf(17),
  },
  unavailableText: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: "#94A3B8",
    textAlign: "center",
    paddingVertical: 4,
  },
});
