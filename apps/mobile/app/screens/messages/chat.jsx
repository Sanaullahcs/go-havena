import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Platform, ActivityIndicator, RefreshControl } from "react-native";
import LocaleTextInput from "../../../components/ui/locale-text-input";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import { useKeyboardBottomOffset } from "../../../components/layout/keyboard-safe-screen";
import UserAvatar from "../../../components/ui/user-avatar";
import CrispImage from "../../../components/ui/crisp-image";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import i18n from "../../../i18n";
import { getLocaleForLang } from "../../../hooks/use-app-locale";

import { Fonts } from "../../../constants/font";
import { Colors, Layout } from "../../../constants/tokens";
import { fetchMessages, sendMessage, isPeerAdmin, peerRoleLabel } from "../../../services/messages-api";
import { getUser } from "../../../services/auth-session";
import { useApiAction } from "../../../hooks/use-api-action";
import { useNow } from "../../../hooks/use-now";
import { formatListingPrice } from "../../../components/marketplace/listing-grid-card";
import { formatCommentTime, parseApiDate } from "../../../services/feed-api";
import { sw, sf } from "../../../utils/responsive";
import { chevronForward } from "../../../utils/rtl";
import { rnShadow } from "../../../utils/shadow";


const NEIGHBOR_QUICK_REPLIES = [
  "messages.chat.quickHiNeighbor",
  "messages.chat.quickFreeToChat",
  "messages.chat.quickThanks",
];

const LISTING_QUICK_REPLIES = [
  "messages.chat.quickStillAvailable",
  "messages.chat.quickBestPrice",
  "messages.chat.quickPickUpToday",
];

const KEYBOARD_SCROLL_RETRY_MS = 120;
const PAGE_SIZE = 25;
const SCROLL_TOP_THRESHOLD = 80;
const CHAT_BG = "#F0F5FF";

const cardShadow = Platform.select({
  ios: {
    ...rnShadow({ color: "#0F172A", offset: { width: 0, height: 2 }, opacity: 0.06, radius: 8 }),
  },
  android: { elevation: 2 },
});

function timeLabel(dateStr, now = Date.now()) {
  return formatCommentTime(dateStr, { now });
}

function dateDividerLabel(dateStr, now = Date.now(), t) {
  const date = parseApiDate(dateStr);
  if (!date) return "";

  const today = new Date(now);
  const yesterday = new Date(now);
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(date, today)) return t("messages.chat.today");
  if (sameDay(date, yesterday)) return t("messages.chat.yesterday");
  return date.toLocaleDateString(getLocaleForLang(i18n.language), { weekday: "short", month: "short", day: "numeric" });
}

function offerNote(body) {
  if (!body) return "";
  const parts = body.split("\n\n");
  return parts.length > 1 ? parts.slice(1).join("\n\n").trim() : "";
}

function buildChatItems(messages, now = Date.now(), t) {
  const items = [];
  let lastDate = "";

  messages.forEach((message) => {
    const divider = dateDividerLabel(message.created_at, now, t);
    if (divider && divider !== lastDate) {
      items.push({ type: "divider", id: `divider-${divider}-${message.id}`, label: divider });
      lastDate = divider;
    }
    items.push({ type: "message", id: String(message.id), data: message });
  });

  return items;
}

function ListingContextBanner({ listing, onPress, t }) {
  if (!listing?.id) return null;

  const imageSource = listing.image_url ?? listing.images?.[0] ?? null;

  return (
    <TouchableOpacity style={styles.listingBanner} activeOpacity={0.88} onPress={onPress}>
      {imageSource ? (
        <CrispImage source={imageSource} style={styles.listingBannerThumb} contentFit="cover" />
      ) : (
        <View style={[styles.listingBannerThumb, styles.listingBannerThumbPlaceholder]}>
          <Ionicons name="storefront-outline" size={22} color="#059669" />
        </View>
      )}
      <View style={styles.listingBannerCopy}>
        <View style={styles.listingBannerTag}>
          <Ionicons name="pricetag" size={11} color="#059669" />
          <Text style={styles.listingBannerLabel}>{t("messages.chat.marketplaceListing")}</Text>
        </View>
        <Text style={styles.listingBannerTitle} numberOfLines={1}>
          {listing.title}
        </Text>
        <Text style={styles.listingBannerPrice}>{formatListingPrice(listing.price)}</Text>
      </View>
      <View style={styles.viewListingBtn}>
        <Text style={styles.viewListingText}>{t("messages.chat.view")}</Text>
        <Ionicons name={chevronForward()} size={14} color="#059669" />
      </View>
    </TouchableOpacity>
  );
}

function HeaderRoleBadge({ role }) {
  const admin = isPeerAdmin(role);
  return (
    <View style={[styles.headerRoleBadge, admin ? styles.headerRoleBadgeAdmin : styles.headerRoleBadgeResident]}>
      <Ionicons
        name={admin ? "shield-checkmark" : "person"}
        size={12}
        color={admin ? Colors.brandPrimaryDeep : "#047857"}
      />
      <Text style={[styles.headerRoleBadgeText, admin ? styles.headerRoleBadgeTextAdmin : styles.headerRoleBadgeTextResident]}>
        {peerRoleLabel(role)}
      </Text>
    </View>
  );
}

function MineBubble({ children, style }) {
  return (
    <View
      style={[styles.bubble, styles.bubbleMine, style]}
    >
      {children}
    </View>
  );
}

function getOldestMessageId(messages) {
  for (const message of messages) {
    if (message?.id != null && !String(message.id).startsWith("opt-")) {
      return message.id;
    }
  }
  return null;
}

export default function ChatScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const now = useNow(30000);
  const { bottomOffset, safeBottom } = useKeyboardBottomOffset();
  const {
    conversationId,
    recipientName: recipientNameParam,
    recipientRole: recipientRoleParam,
    initialDraft = "",
    listingId,
  } = useLocalSearchParams();

  const routeRecipientName = useMemo(() => {
    const name = String(recipientNameParam ?? "").trim();
    return name && name !== "Chat" ? name : "";
  }, [recipientNameParam]);

  const [displayName, setDisplayName] = useState(routeRecipientName);
  const [messages, setMessages] = useState([]);
  const [listingContext, setListingContext] = useState(null);
  const [peerRole, setPeerRole] = useState(recipientRoleParam ?? "resident");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const draftInitialized = useRef(false);
  const shouldScrollToLatestRef = useRef(true);
  const loadingOlderRef = useRef(false);
  const { showFailure } = useApiAction();
  const keyboardOpen = bottomOffset > 0;
  const composerBottomPad = keyboardOpen ? sw(10) : safeBottom;
  const chatTitle = displayName || t("messages.chat.defaultTitle");

  const applyPeerMeta = useCallback((peer) => {
    if (peer?.role) setPeerRole(peer.role);
    if (peer?.name?.trim()) setDisplayName(peer.name.trim());
  }, []);

  useEffect(() => {
    if (routeRecipientName) setDisplayName(routeRecipientName);
  }, [routeRecipientName]);

  const markScrollToLatest = useCallback(() => {
    shouldScrollToLatestRef.current = true;
  }, []);

  const scrollToLatest = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated });
    });
  }, []);

  const scrollToLatestWithRetry = useCallback(
    (animated = false) => {
      scrollToLatest(animated);
      setTimeout(() => scrollToLatest(animated), 50);
      setTimeout(() => scrollToLatest(animated), 120);
      setTimeout(() => scrollToLatest(animated), 260);
    },
    [scrollToLatest],
  );

  const handleListContentSizeChange = useCallback(() => {
    if (!shouldScrollToLatestRef.current || messages.length === 0) return;
    scrollToLatestWithRetry(false);
    shouldScrollToLatestRef.current = false;
  }, [messages.length, scrollToLatestWithRetry]);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    try {
      const { messages: data, listing, peer, hasMore } = await fetchMessages(conversationId, {
        limit: PAGE_SIZE,
      });
      setMessages(data);
      setListingContext(listing);
      applyPeerMeta(peer);
      setHasMoreOlder(hasMore);
      markScrollToLatest();
    } catch (err) {
      setMessages([]);
      setListingContext(null);
      setHasMoreOlder(false);
      await showFailure(t("messages.chat.couldNotLoadMessages"), err);
    } finally {
      setLoading(false);
    }
  }, [conversationId, showFailure, applyPeerMeta, t]);

  const refreshLatest = useCallback(async () => {
    try {
      const { messages: latest, listing, peer } = await fetchMessages(conversationId, { limit: PAGE_SIZE });
      setListingContext(listing);
      applyPeerMeta(peer);
      setMessages((prev) => {
        const existingIds = new Set(prev.map((message) => message.id));
        const incoming = latest.filter((message) => !existingIds.has(message.id));
        if (incoming.length === 0) return prev;
        markScrollToLatest();
        return [...prev, ...incoming];
      });
    } catch {
      // Silent refresh on focus — keep existing thread visible.
    }
  }, [conversationId, applyPeerMeta]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const { messages: latest, listing, peer, hasMore } = await fetchMessages(conversationId, {
        limit: PAGE_SIZE,
      });
      setListingContext(listing);
      applyPeerMeta(peer);
      setMessages((prev) => {
        if (prev.length === 0) return latest;

        const latestIds = new Set(latest.map((message) => message.id));
        const oldestLatestId = getOldestMessageId(latest);

        const older = prev.filter((message) => {
          if (String(message.id).startsWith("opt-")) return true;
          if (oldestLatestId == null) return false;
          return Number(message.id) < Number(oldestLatestId);
        });

        const merged = [...older.filter((message) => !latestIds.has(message.id)), ...latest];
        if (merged.length !== prev.length) {
          markScrollToLatest();
        }
        return merged;
      });
      setHasMoreOlder((prev) => prev || hasMore);
    } catch (err) {
      await showFailure(t("messages.chat.couldNotRefreshMessages"), err);
    } finally {
      setRefreshing(false);
    }
  }, [conversationId, showFailure, applyPeerMeta, t]);

  const loadOlder = useCallback(async () => {
    if (loadingOlderRef.current || !hasMoreOlder || messages.length === 0) return;

    const beforeId = getOldestMessageId(messages);
    if (beforeId == null) return;

    loadingOlderRef.current = true;
    setLoadingOlder(true);
    try {
      const { messages: older, hasMore } = await fetchMessages(conversationId, {
        limit: PAGE_SIZE,
        beforeId,
      });
      if (older.length > 0) {
        setMessages((prev) => [...older, ...prev]);
      }
      setHasMoreOlder(hasMore);
    } catch (err) {
      await showFailure(t("messages.chat.couldNotLoadOlderMessages"), err);
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, [conversationId, hasMoreOlder, messages, showFailure, t]);

  const handleScroll = useCallback(
    (event) => {
      const offsetY = event.nativeEvent.contentOffset.y;
      if (offsetY <= SCROLL_TOP_THRESHOLD) {
        loadOlder();
      }
    },
    [loadOlder],
  );

  useEffect(() => {
    setMessages([]);
    setListingContext(null);
    setHasMoreOlder(false);
    setDisplayName(routeRecipientName);
    markScrollToLatest();
    loadInitial();
  }, [conversationId, loadInitial, routeRecipientName, markScrollToLatest]);

  useFocusEffect(
    useCallback(() => {
      getUser().then(setCurrentUser);
      markScrollToLatest();
      void refreshLatest().finally(() => {
        markScrollToLatest();
        scrollToLatestWithRetry(false);
      });
      const timer = setInterval(() => {
        void refreshLatest();
      }, 4000);
      return () => clearInterval(timer);
    }, [refreshLatest, markScrollToLatest, scrollToLatestWithRetry]),
  );

  useEffect(() => {
    if (!loading && messages.length > 0 && shouldScrollToLatestRef.current) {
      scrollToLatestWithRetry(false);
    }
  }, [loading, messages.length, scrollToLatestWithRetry]);

  useEffect(() => {
    if (initialDraft && !draftInitialized.current) {
      setDraft(String(initialDraft));
      draftInitialized.current = true;
    }
  }, [initialDraft]);

  useEffect(() => {
    if (recipientRoleParam) setPeerRole(recipientRoleParam);
  }, [recipientRoleParam]);

  const chatItems = useMemo(() => buildChatItems(messages, now, t), [messages, now, t]);
  const isListingChat = Boolean(listingContext?.id);
  const roleLabel = peerRoleLabel(peerRole);

  const headerSubtitle = isListingChat
    ? t("messages.chat.listingSubtitle", { title: listingContext.title })
    : roleLabel;

  const quickReplies = isListingChat ? LISTING_QUICK_REPLIES : NEIGHBOR_QUICK_REPLIES;
  const emptyHint = isListingChat
    ? t("messages.chat.listingEmptyHint")
    : t("messages.chat.neighborEmptyHint");
  const inputPlaceholder = isListingChat
    ? t("messages.chat.listingPlaceholder")
    : t("messages.chat.neighborPlaceholder");

  const handleSend = useCallback(async (textOverride) => {
    const text = (textOverride ?? draft).trim();
    if (!text || sending) return;
    setSending(true);
    const optimistic = {
      id: `opt-${Date.now()}`,
      content: text,
      body: text,
      type: "text",
      sender_id: currentUser?.id,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    markScrollToLatest();
    if (!textOverride) setDraft("");
    try {
      const saved = await sendMessage(conversationId, text);
      setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? saved : m)));
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      await showFailure(t("messages.chat.couldNotSendMessage"), err);
    } finally {
      setSending(false);
    }
  }, [conversationId, currentUser?.id, draft, sending, showFailure, markScrollToLatest, t]);

  const olderMessagesHeader = useMemo(() => {
    if (!loadingOlder) return null;
    return (
      <View style={styles.olderLoader}>
        <ActivityIndicator size="small" color={Colors.brandPrimaryDeep} />
        <Text style={styles.olderLoaderText}>{t("messages.chat.loadingOlder")}</Text>
      </View>
    );
  }, [loadingOlder, t]);

  const quickReplyFooter = useMemo(() => {
    if (loading || messages.length > 0) return null;

    return (
      <View style={styles.quickReplyRow}>
        {quickReplies.map((replyKey) => (
          <TouchableOpacity
            key={replyKey}
            style={[styles.quickReplyChip, isListingChat && styles.quickReplyChipListing]}
            onPress={() => handleSend(t(replyKey))}
            disabled={sending}
          >
            <Text style={styles.quickReplyText}>{t(replyKey)}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  }, [handleSend, loading, messages.length, quickReplies, isListingChat, sending, t]);

  const openListing = () => {
    const id = listingContext?.id ?? listingId;
    if (!id) return;
    router.push({ pathname: "/screens/listing-detail", params: { id: String(id) } });
  };

  const renderChatItem = ({ item }) => {
    if (item.type === "divider") {
      return (
        <View style={styles.dateDividerWrap}>
          <View style={styles.dateDividerLine} />
          <View style={styles.dateDividerPill}>
            <Text style={styles.dateDividerText}>{item.label}</Text>
          </View>
          <View style={styles.dateDividerLine} />
        </View>
      );
    }

    const message = item.data;
    const isMine = message.sender_id === currentUser?.id;
    const isOffer = message.type === "offer";
    const offerAmount = message.metadata?.offer_amount;
    const note = isOffer ? offerNote(message.body ?? message.content) : null;

    if (isOffer && offerAmount != null) {
      const OfferWrapper = isMine ? MineBubble : View;
      const offerStyle = isMine ? styles.offerBubbleMine : styles.offerBubbleOther;

      return (
        <View style={[styles.msgRow, isMine ? styles.msgRowMine : styles.msgRowOther]}>
          {!isMine ? <UserAvatar name={chatTitle} size={28} style={styles.msgAvatar} /> : null}
          <OfferWrapper style={[styles.offerBubble, offerStyle]}>
            <View style={styles.offerHeader}>
              <Ionicons name="pricetag" size={14} color={isMine ? "#FFFFFF" : "#059669"} />
              <Text style={[styles.offerLabel, isMine && styles.offerLabelMine]}>
                {isMine ? t("messages.chat.yourOffer") : t("messages.chat.offerReceived")}
              </Text>
            </View>
            <Text style={[styles.offerAmount, isMine && styles.offerAmountMine]}>
              {formatListingPrice(offerAmount)}
            </Text>
            {listingContext?.price != null ? (
              <Text style={[styles.offerCompare, isMine && styles.offerCompareMine]}>
                {t("messages.chat.listedAt", { price: formatListingPrice(listingContext.price) })}
              </Text>
            ) : null}
            {note ? (
              <Text style={[styles.offerNote, isMine && styles.offerNoteMine]}>{note}</Text>
            ) : null}
            <Text style={[styles.msgTime, isMine ? styles.msgTimeMine : styles.msgTimeOther]}>
              {timeLabel(message.created_at, now)}
            </Text>
          </OfferWrapper>
        </View>
      );
    }

    const BubbleWrapper = isMine ? MineBubble : View;
    const otherBubbleStyle = isMine ? null : [styles.bubble, styles.bubbleOther];

    return (
      <View style={[styles.msgRow, isMine ? styles.msgRowMine : styles.msgRowOther]}>
        {!isMine ? <UserAvatar name={chatTitle} size={28} style={styles.msgAvatar} /> : null}
        <BubbleWrapper style={otherBubbleStyle}>
          <Text style={[styles.bubbleText, isMine ? styles.bubbleTextMine : styles.bubbleTextOther]}>
            {message.content ?? message.body}
          </Text>
          <Text style={[styles.msgTime, isMine ? styles.msgTimeMine : styles.msgTimeOther]}>
            {timeLabel(message.created_at, now)}
          </Text>
        </BubbleWrapper>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <InternalScreenHeader
        title={chatTitle}
        subtitle={headerSubtitle}
        compact
        right={
          isListingChat ? (
            <TouchableOpacity style={styles.headerActionListing} onPress={openListing}>
              <Ionicons name="storefront-outline" size={18} color="#059669" />
            </TouchableOpacity>
          ) : (
            <HeaderRoleBadge role={peerRole} />
          )
        }
      />

      <View style={styles.chatBody}>
        {isListingChat ? (
          <View style={styles.contextWrap}>
            <ListingContextBanner listing={listingContext} onPress={openListing} t={t} />
          </View>
        ) : null}

        {loading ? (
          <ActivityIndicator color={Colors.brandPrimaryDeep} style={styles.loader} />
        ) : (
          <FlatList
            ref={listRef}
            data={chatItems}
            keyExtractor={(item) => item.id}
            renderItem={renderChatItem}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            onScroll={handleScroll}
            scrollEventThrottle={16}
            onContentSizeChange={handleListContentSizeChange}
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={Colors.brandPrimaryDeep}
                colors={[Colors.brandPrimaryDeep]}
              />
            }
            ListHeaderComponent={olderMessagesHeader}
            ListFooterComponent={quickReplyFooter}
            ListEmptyComponent={
              <View style={styles.empty}>
                <View
                  style={styles.emptyIcon}
                >
                  <View style={[styles.emptyIconInner, isListingChat && styles.emptyIconInnerListing]}>
                    <Feather
                      name={isListingChat ? "tag" : "message-circle"}
                      size={26}
                      color={isListingChat ? "#059669" : Colors.brandPrimaryDeep}
                    />
                  </View>
                </View>
                <Text style={styles.emptyTitle}>{t("messages.chat.startConversation")}</Text>
                <Text style={styles.emptyText}>{emptyHint}</Text>
              </View>
            }
          />
        )}

        <View
          style={[
            styles.composerShell,
            {
              paddingBottom: composerBottomPad,
              marginBottom: bottomOffset,
            },
          ]}
        >
          <View style={styles.composer}>
            <View style={styles.inputWrap}>
              <LocaleTextInput
                ref={inputRef}
                value={draft}
                onChangeText={setDraft}
                placeholder={inputPlaceholder}
                placeholderTextColor={Colors.textMuted}
                style={styles.input}
                multiline
                blurOnSubmit={false}
                onFocus={() => {
                  scrollToLatest(true);
                  setTimeout(() => scrollToLatest(true), KEYBOARD_SCROLL_RETRY_MS);
                }}
              />
            </View>
            <TouchableOpacity
              style={[styles.sendBtnOuter, (!draft.trim() || sending) && styles.sendBtnDisabled]}
              onPress={() => handleSend()}
              disabled={!draft.trim() || sending}
              activeOpacity={0.88}
            >
              <View
                style={styles.sendBtn}
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Feather name="send" size={17} color="#FFFFFF" />
                )}
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: CHAT_BG },
  chatBody: { flex: 1, backgroundColor: CHAT_BG },
  loader: { marginTop: sw(32), flex: 1 },
  list: { flex: 1, backgroundColor: CHAT_BG },
  listContent: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: sw(12),
    paddingBottom: sw(16),
    flexGrow: 1,
  },
  olderLoader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(8),
    paddingVertical: sw(12),
  },
  olderLoaderText: {
    fontFamily: Fonts.medium,
    fontSize: sf(11),
    color: Colors.textMuted,
  },
  contextWrap: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: sw(10),
    paddingBottom: sw(8),
    backgroundColor: CHAT_BG,
  },
  headerActionListing: {
    width: sw(38),
    height: sw(38),
    borderRadius: sw(12),
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    alignItems: "center",
    justifyContent: "center",
  },
  headerRoleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(5),
    paddingHorizontal: sw(10),
    paddingVertical: sw(7),
    borderRadius: 999,
    borderWidth: 1,
  },
  headerRoleBadgeAdmin: {
    backgroundColor: "#D1FAF5",
    borderColor: "rgba(20, 184, 166, 0.28)",
  },
  headerRoleBadgeResident: {
    backgroundColor: "#ECFDF5",
    borderColor: "#A7F3D0",
  },
  headerRoleBadgeText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    fontWeight: "600",
  },
  headerRoleBadgeTextAdmin: {
    color: Colors.brandPrimaryDeep,
  },
  headerRoleBadgeTextResident: {
    color: "#047857",
  },
  listingBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
    padding: sw(14),
    borderRadius: sw(16),
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: "#D1FAE5",
    ...cardShadow,
  },
  listingBannerThumb: {
    width: sw(52),
    height: sw(52),
    borderRadius: sw(12),
  },
  listingBannerThumbPlaceholder: {
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
  },
  listingBannerCopy: {
    flex: 1,
    minWidth: 0,
    gap: sw(3),
  },
  listingBannerTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(4),
  },
  listingBannerLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(10),
    color: "#059669",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  listingBannerTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    color: Colors.textPrimary,
    fontWeight: "700",
  },
  listingBannerPrice: {
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    color: "#047857",
    fontWeight: "700",
  },
  viewListingBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(2),
    paddingHorizontal: sw(10),
    paddingVertical: sw(7),
    borderRadius: sw(999),
    backgroundColor: "#ECFDF5",
  },
  viewListingText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    color: "#059669",
    fontWeight: "600",
  },
  dateDividerWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(10),
    marginVertical: sw(16),
  },
  dateDividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(20, 184, 166, 0.12)",
  },
  dateDividerPill: {
    paddingHorizontal: sw(12),
    paddingVertical: sw(5),
    borderRadius: sw(999),
    backgroundColor: "rgba(255, 255, 255, 0.85)",
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.1)",
  },
  dateDividerText: {
    fontFamily: Fonts.medium,
    fontSize: sf(10),
    color: Colors.textSecondary,
    fontWeight: "600",
  },
  msgRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: sw(8),
    marginBottom: sw(12),
  },
  msgRowMine: { justifyContent: "flex-end" },
  msgRowOther: { justifyContent: "flex-start" },
  msgAvatar: { marginBottom: sw(2) },
  bubble: {
    maxWidth: "78%",
    borderRadius: sw(20),
    paddingHorizontal: sw(14),
    paddingTop: sw(10),
    paddingBottom: sw(8),
    gap: sw(3),
    ...cardShadow,
  },
  bubbleMine: {
    borderBottomEndRadius: sw(5),
    backgroundColor: Colors.brandPrimary,
  },
  bubbleOther: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.1)",
    borderBottomStartRadius: sw(5),
  },
  offerBubble: {
    maxWidth: "78%",
    borderRadius: sw(18),
    paddingHorizontal: sw(14),
    paddingTop: sw(12),
    paddingBottom: sw(10),
    gap: sw(4),
    borderWidth: 1,
    ...cardShadow,
  },
  offerBubbleMine: {
    borderColor: "transparent",
    borderBottomEndRadius: sw(5),
  },
  offerBubbleOther: {
    backgroundColor: "#ECFDF5",
    borderColor: "#A7F3D0",
  },
  offerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
  },
  offerLabel: {
    fontFamily: Fonts.medium,
    fontSize: sf(10),
    color: "#059669",
    fontWeight: "600",
  },
  offerLabelMine: {
    color: "rgba(255,255,255,0.9)",
  },
  offerAmount: {
    fontFamily: Fonts.bold,
    fontSize: sf(20),
    color: "#047857",
    fontWeight: "700",
  },
  offerAmountMine: {
    color: "#FFFFFF",
  },
  offerCompare: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    color: Colors.textSecondary,
  },
  offerCompareMine: {
    color: "rgba(255,255,255,0.75)",
  },
  offerNote: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(18),
    color: Colors.textBody,
    marginTop: sw(2),
  },
  offerNoteMine: {
    color: "rgba(255,255,255,0.92)",
  },
  bubbleText: {
    fontFamily: Fonts.regular,
    fontSize: sf(14),
    lineHeight: sf(20),
  },
  bubbleTextMine: { color: "#FFFFFF" },
  bubbleTextOther: { color: Colors.textBody },
  msgTime: {
    fontFamily: Fonts.medium,
    fontSize: sf(9),
    lineHeight: sf(12),
    letterSpacing: 0.2,
  },
  msgTimeMine: { color: "rgba(255,255,255,0.78)", textAlign: "right", alignSelf: "flex-end" },
  msgTimeOther: { color: "#94A3B8", alignSelf: "flex-end" },
  empty: {
    alignItems: "center",
    paddingTop: sw(52),
    paddingHorizontal: sw(32),
    gap: sw(10),
  },
  emptyIcon: {
    width: sw(72),
    height: sw(72),
    borderRadius: sw(36),
    alignItems: "center",
    justifyContent: "center",
    marginBottom: sw(6),
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.12)",
  },
  emptyIconInner: {
    width: sw(48),
    height: sw(48),
    borderRadius: sw(24),
    backgroundColor: "rgba(255, 255, 255, 0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyIconInnerListing: {
    backgroundColor: "rgba(255, 255, 255, 0.95)",
  },
  emptyTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(16),
    color: Colors.textPrimary,
    fontWeight: "700",
  },
  emptyText: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: sf(20),
  },
  quickReplyRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: sw(8),
    paddingTop: sw(8),
    paddingBottom: sw(4),
  },
  quickReplyChip: {
    paddingHorizontal: sw(14),
    paddingVertical: sw(8),
    borderRadius: sw(999),
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.12)",
    ...cardShadow,
  },
  quickReplyChipListing: {
    borderColor: "#BBF7D0",
    backgroundColor: "#F0FDF4",
  },
  quickReplyText: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: Colors.textSecondary,
  },
  composerShell: {
    backgroundColor: "rgba(255, 255, 255, 0.92)",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(20, 184, 166, 0.1)",
    paddingTop: sw(8),
    ...Platform.select({
      ios: {
        ...rnShadow({ color: "#0F172A", offset: { width: 0, height: -4 }, opacity: 0.06, radius: 12 }),
      },
      android: { elevation: 8 },
    }),
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: sw(10),
    paddingHorizontal: Layout.screenPadding,
    paddingBottom: sw(4),
  },
  inputWrap: {
    flex: 1,
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.12)",
    borderRadius: sw(999),
    backgroundColor: "#FFFFFF",
    ...Platform.select({
      ios: {
        ...rnShadow({ color: "#0F172A", offset: { width: 0, height: 2 }, opacity: 0.04, radius: 6 }),
      },
      android: { elevation: 2 },
    }),
  },
  input: {
    minHeight: sw(44),
    maxHeight: sw(112),
    paddingHorizontal: sw(18),
    paddingVertical: sw(11),
    fontFamily: Fonts.regular,
    fontSize: sf(14),
    color: Colors.textBody,
  },
  sendBtnOuter: {
    flexShrink: 0,
    borderRadius: sw(22),
    ...Platform.select({
      ios: {
        ...rnShadow({ color: Colors.brandPrimaryDeep, offset: { width: 0, height: 3 }, opacity: 0.28, radius: 6 }),
      },
      android: { elevation: 4 },
    }),
  },
  sendBtn: {
    width: sw(44),
    height: sw(44),
    borderRadius: sw(22),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.brandPrimary,
  },
  sendBtnDisabled: { opacity: 0.55 },
});
