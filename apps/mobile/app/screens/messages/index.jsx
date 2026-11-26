import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import { useRouter, useFocusEffect } from "expo-router";
import CrispImage from "../../../components/ui/crisp-image";
import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import UserAvatar from "../../../components/ui/user-avatar";
import SearchInput from "../../../components/ui/search-input";
import { Fonts } from "../../../constants/font";
import { Colors, Layout } from "../../../constants/tokens";
import { HomeTheme as T } from "../../../constants/home-theme";
import { formatListingPrice } from "../../../components/marketplace/listing-grid-card";
import { fetchConversations, isPeerAdmin, peerRoleLabel } from "../../../services/messages-api";
import { useApiAction } from "../../../hooks/use-api-action";
import { useMessageUnread } from "../../../hooks/use-message-unread";
import { useNow } from "../../../hooks/use-now";
import NewChatSheet from "../../../components/messages/new-chat-sheet";
import { parseApiDate, timeAgo as formatRelativeTime } from "../../../services/feed-api";
import { sw, sf } from "../../../utils/responsive";
import GuestFeatureErrorState from "../../../components/guest/guest-permission-denied-state";
import { isFeatureAccessBlockedError } from "../../../utils/guest-permission-errors";
import { resolveLoadRestriction } from "../../../utils/account-access-sync";
import { chevronForward } from "../../../utils/rtl";
import { rnShadow } from "../../../utils/shadow";


const FILTERS = [
  { id: "all", icon: "chatbubbles-outline" },
  { id: "neighbors", icon: "people-outline" },
  { id: "listings", icon: "storefront-outline" },
  { id: "unread", icon: "mail-unread-outline" },
];

const FILTER_KEYS = {
  all: "messages.filterAll",
  neighbors: "messages.filterNeighbors",
  listings: "messages.filterListings",
  unread: "messages.filterUnread",
};

const CARD_RADIUS = sw(16);
const BRAND_BLUE = Colors.brandPrimaryDeep;

const cardShadow = Platform.select({
  ios: {
    ...rnShadow({ color: "#0F172A", offset: { width: 0, height: 3 }, opacity: 0.05, radius: 10 }),
  },
  android: { elevation: 2 },
});

function isNeighborChat(conversation) {
  return conversation.kind === "neighbor" || !conversation.listing_id;
}

function isListingChat(conversation) {
  return conversation.kind === "listing" || Boolean(conversation.listing_id);
}

function hasMessages(conversation) {
  return Boolean(conversation.last_message?.trim());
}

/** Conversation with at least one sent message. */
function isStartedConversation(conversation) {
  return hasMessages(conversation);
}

function isActiveNeighborChat(conversation) {
  return isNeighborChat(conversation) && hasMessages(conversation);
}

function matchesFilter(conversation, filterId) {
  switch (filterId) {
    case "all":
      return isStartedConversation(conversation);
    case "neighbors":
      return isActiveNeighborChat(conversation);
    case "listings":
      return isListingChat(conversation) && isStartedConversation(conversation);
    case "unread":
      return (conversation.unread_count ?? 0) > 0;
    default:
      return isStartedConversation(conversation);
  }
}

function conversationSearchText(conversation) {
  return [
    conversation.other_name,
    conversation.title,
    conversation.listing?.title,
    conversation.last_message,
    peerRoleLabel(conversation.other_role),
    isListingChat(conversation) ? "listing marketplace offer" : "neighbor",
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function matchesSearchQuery(conversation, rawQuery) {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  const haystack = conversationSearchText(conversation);
  return q.split(/\s+/).every((token) => haystack.includes(token));
}

function filterCount(conversations, filterId) {
  return conversations.filter((c) => matchesFilter(c, filterId)).length;
}

function previewText(item, t) {
  if (item.last_message_type === "offer") {
    return item.last_message ?? t("messages.sentAnOffer");
  }
  return item.last_message ?? "";
}

function listingImageSource(listing) {
  if (!listing) return null;
  const raw = listing.image_url ?? listing.images?.[0];
  if (!raw || typeof raw !== "string") return null;
  return raw;
}

function TypeBadge({ type, isOffer, t }) {
  const listing = type === "listing";
  return (
    <View style={[styles.typeBadge, listing ? styles.typeBadgeListing : styles.typeBadgeNeighbor]}>
      <Ionicons
        name={listing ? (isOffer ? "pricetag" : "storefront-outline") : "chatbubble-ellipses-outline"}
        size={10}
        color={listing ? "#059669" : Colors.brandPrimaryDeep}
      />
      <Text style={[styles.typeBadgeText, listing ? styles.typeBadgeTextListing : styles.typeBadgeTextNeighbor]}>
        {listing ? (isOffer ? t("messages.offerBadge") : t("messages.listingBadge")) : t("messages.neighborBadge")}
      </Text>
    </View>
  );
}

function RoleBadge({ role }) {
  const admin = isPeerAdmin(role);
  return (
    <View style={[styles.roleBadge, admin ? styles.roleBadgeAdmin : styles.roleBadgeResident]}>
      <Ionicons
        name={admin ? "shield-checkmark" : "person"}
        size={10}
        color={admin ? Colors.brandPrimaryDeep : "#047857"}
      />
      <Text style={[styles.roleBadgeText, admin ? styles.roleBadgeTextAdmin : styles.roleBadgeTextResident]}>
        {peerRoleLabel(role)}
      </Text>
    </View>
  );
}

function UnreadBadge({ count, variant = "neighbor" }) {
  if (count <= 0) return null;
  return (
    <View style={[styles.badge, variant === "listing" && styles.badgeListing]}>
      <Text style={styles.badgeText}>{count > 9 ? "9+" : count}</Text>
    </View>
  );
}

function NeighborCard({ item, onPress, now, t }) {
  const { i18n } = useTranslation();
  const arabic = String(i18n.language || "").startsWith("ar");
  const name = item.other_name ?? t("messages.neighbor");
  const lastMsg = previewText(item, t);
  const unread = item.unread_count ?? 0;
  const time = item.last_message_at;
  const admin = isPeerAdmin(item.other_role);

  return (
    <TouchableOpacity
      style={[styles.card, styles.neighborCard, unread > 0 && styles.cardUnreadNeighbor]}
      activeOpacity={0.9}
      onPress={() => onPress(item, name)}
    >
      <View style={styles.neighborAvatarWrap}>
        <UserAvatar source={item.other_avatar_url} name={name} size={sw(50)} />
        <View style={[styles.neighborRoleDot, admin ? styles.neighborRoleDotAdmin : styles.neighborRoleDotResident]}>
          <Ionicons
            name={admin ? "shield" : "person"}
            size={9}
            color="#FFFFFF"
          />
        </View>
      </View>
      <View style={styles.cardBody}>
        <View style={styles.topLine}>
          <Text style={[styles.name, unread > 0 && styles.nameUnread, arabic && styles.nameAr]} numberOfLines={1}>
            {name}
          </Text>
          {time ? (
            <Text style={[styles.time, unread > 0 && styles.timeUnread]}>
              {formatRelativeTime(time, now)}
            </Text>
          ) : null}
        </View>
        <View style={styles.metaRow}>
          <RoleBadge role={item.other_role} />
        </View>
        {lastMsg ? (
          <Text style={[styles.preview, unread > 0 && styles.previewUnread]} numberOfLines={2}>
            {lastMsg}
          </Text>
        ) : (
          <Text style={styles.previewMuted} numberOfLines={1}>
            {t("messages.tapToContinue")}
          </Text>
        )}
      </View>
      {unread > 0 ? (
        <UnreadBadge count={unread} />
      ) : (
        <Feather name={chevronForward()} size={16} color="#CBD5E1" style={styles.cardChevron} />
      )}
    </TouchableOpacity>
  );
}

function ListingCard({ item, onPress, now, t }) {
  const { i18n } = useTranslation();
  const arabic = String(i18n.language || "").startsWith("ar");
  const name = item.other_name ?? t("messages.neighbor");
  const lastMsg = previewText(item, t);
  const unread = item.unread_count ?? 0;
  const time = item.last_message_at;
  const listing = item.listing;
  const isOffer = item.last_message_type === "offer";
  const imageSource = listingImageSource(listing);

  return (
    <TouchableOpacity
      style={[styles.card, styles.listingCard, unread > 0 && styles.cardUnreadListing]}
      activeOpacity={0.9}
      onPress={() => onPress(item, name)}
    >
      <View style={styles.listingCardMain}>
        <UserAvatar source={item.other_avatar_url} name={name} size={sw(46)} />
        <View style={styles.cardBody}>
          <View style={styles.topLine}>
            <Text style={[styles.name, unread > 0 && styles.nameUnreadListing, arabic && styles.nameAr]} numberOfLines={1}>
              {name}
            </Text>
            {time ? (
              <Text style={[styles.time, unread > 0 && styles.timeUnreadListing]}>
                {formatRelativeTime(time, now)}
              </Text>
            ) : null}
          </View>
          <View style={styles.metaRow}>
            <TypeBadge type="listing" isOffer={isOffer} t={t} />
          </View>
          {lastMsg ? (
            <Text style={[styles.preview, unread > 0 && styles.previewUnread]} numberOfLines={2}>
              {lastMsg}
            </Text>
          ) : null}
        </View>
        {unread > 0 ? (
          <UnreadBadge count={unread} variant="listing" />
        ) : (
          <Feather name={chevronForward()} size={16} color="#CBD5E1" style={styles.cardChevron} />
        )}
      </View>

      {listing?.title ? (
        <View style={styles.listingStrip}>
          {imageSource ? (
            <CrispImage source={imageSource} style={styles.listingStripImage} contentFit="cover" />
          ) : (
            <View style={[styles.listingStripImage, styles.listingStripImagePlaceholder]}>
              <Ionicons name="image-outline" size={18} color="#059669" />
            </View>
          )}
          <View style={styles.listingStripCopy}>
            <Text style={styles.listingStripLabel}>{t("messages.marketplaceListing")}</Text>
            <Text style={styles.listingStripTitle} numberOfLines={1}>
              {listing.title}
            </Text>
            {listing.price != null ? (
              <Text style={styles.listingStripPrice}>{formatListingPrice(listing.price)}</Text>
            ) : null}
          </View>
          <Feather name="external-link" size={14} color="#64748B" />
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

function ConversationRow({ item, onPress, now, t }) {
  if (isListingChat(item)) {
    return <ListingCard item={item} onPress={onPress} now={now} t={t} />;
  }
  return <NeighborCard item={item} onPress={onPress} now={now} t={t} />;
}

function EmptyState({ query, filter, onNewChat, t }) {
  const title =
    query.trim() || filter !== "all" ? t("messages.noConversationsFound") : t("messages.noMessagesYet");
  const message = query.trim()
    ? t("messages.tryDifferentSearch")
    : filter === "neighbors"
      ? t("messages.emptyNeighborsHint")
      : filter === "listings"
        ? t("messages.emptyListingsHint")
        : filter === "unread"
          ? t("messages.emptyUnreadHint")
          : t("messages.emptyDefaultHint");

  const showNewChat = filter === "neighbors" || filter === "all";

  return (
    <View style={styles.empty}>
      <View style={styles.emptyIconWrap}>
        <Feather name="message-circle" size={sf(28)} color={T.navy} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{message}</Text>
      {showNewChat ? (
        <TouchableOpacity
          style={styles.emptyBtn}
          activeOpacity={0.88}
          onPress={onNewChat}
          accessibilityRole="button"
        >
          <Feather name="plus" size={sf(18)} color="#FFFFFF" />
          <Text style={styles.emptyBtnText}>{t("messages.startChat")}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function MessagesToolbar({ query, onQueryChange, filter, onFilterChange, conversations, t }) {
  return (
    <View style={styles.toolbar}>
      <View style={styles.searchWrap}>
        <SearchInput
          value={query}
          onChangeText={onQueryChange}
          placeholder={t("messages.searchPlaceholder")}
        />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {FILTERS.map((item) => {
          const active = filter === item.id;
          const count = filterCount(conversations, item.id);
          return (
            <TouchableOpacity
              key={item.id}
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => onFilterChange(item.id)}
              activeOpacity={0.85}
            >
              <Ionicons name={item.icon} size={13} color={active ? "#FFFFFF" : "#64748B"} />
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                {t(FILTER_KEYS[item.id])}
              </Text>
              {count > 0 ? (
                <View style={[styles.filterCountBubble, active && styles.filterCountBubbleActive]}>
                  <Text style={[styles.filterCountText, active && styles.filterCountTextActive]}>
                    {count}
                  </Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

export default function MessagesScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const now = useNow(30000);
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [newChatVisible, setNewChatVisible] = useState(false);
  const [error, setError] = useState(null);
  const { showFailure } = useApiAction();
  const { refresh: refreshUnread } = useMessageUnread({ refreshOnFocus: false });

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const blocked = await resolveLoadRestriction("feed");
      if (blocked) {
        setConversations([]);
        setError(blocked);
        return;
      }

      const data = await fetchConversations();
      setConversations(data);
      await refreshUnread();
    } catch (err) {
      const restricted = await resolveLoadRestriction("feed", err);
      if (restricted) {
        setConversations([]);
        setError(restricted);
        return;
      }
      if (!silent) await showFailure(t("messages.couldNotLoadConversations"), err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showFailure, refreshUnread, t]);

  useFocusEffect(
    useCallback(() => {
      load(conversations.length > 0);
      const timer = setInterval(() => {
        load(true);
      }, 4000);
      return () => clearInterval(timer);
    }, [load, conversations.length]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

  const handleOpen = (conv, name) => {
    router.push({
      pathname: "/screens/messages/chat",
      params: {
        conversationId: conv.id,
        recipientName: name,
        recipientRole: conv.other_role ?? "resident",
        listingId: conv.listing_id ? String(conv.listing_id) : undefined,
      },
    });
  };

  const handleNewChatStarted = ({ conversationId, recipientName, recipientRole }) => {
    setNewChatVisible(false);
    router.push({
      pathname: "/screens/messages/chat",
      params: {
        conversationId: String(conversationId),
        recipientName,
        recipientRole: recipientRole ?? "resident",
      },
    });
    load(true);
  };

  const filtered = useMemo(() => {
    const items = conversations.filter(
      (c) => matchesSearchQuery(c, query) && matchesFilter(c, filter),
    );

    return items.sort((a, b) => {
      const aTime = parseApiDate(a.last_message_at)?.getTime() ?? 0;
      const bTime = parseApiDate(b.last_message_at)?.getTime() ?? 0;
      return bTime - aTime;
    });
  }, [conversations, query, filter]);

  const unreadCount = conversations.reduce((sum, c) => sum + (c.unread_count ?? 0), 0);
  const accessBlocked = Boolean(error && isFeatureAccessBlockedError(error));
  const showInitialLoader = loading && conversations.length === 0 && !accessBlocked;

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <InternalScreenHeader
        title={t("messages.title")}
        subtitle={unreadCount > 0 ? t("messages.unreadCount", { count: unreadCount }) : t("messages.communityConversations")}
        compact
        right={
          accessBlocked ? null : (
            <TouchableOpacity
              style={styles.composeBtn}
              activeOpacity={0.85}
              onPress={() => setNewChatVisible(true)}
            >
              <Ionicons name="create-outline" size={18} color={BRAND_BLUE} />
            </TouchableOpacity>
          )
        }
      />

      {!accessBlocked ? (
        <MessagesToolbar
          query={query}
          onQueryChange={(text) => {
            setQuery(text);
            if (text.trim() && filter !== "all") setFilter("all");
          }}
          filter={filter}
          onFilterChange={setFilter}
          conversations={conversations}
          t={t}
        />
      ) : null}

      <View style={styles.listArea}>
        {accessBlocked ? (
          <GuestFeatureErrorState
            error={error}
            fallbackFeature="feed"
            defaultTitle={t("messages.couldNotLoadMessages")}
            onRetry={() => load()}
          />
        ) : showInitialLoader ? (
          <ActivityIndicator color={Colors.brandPrimaryDeep} style={styles.loader} />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => (
              <ConversationRow item={item} onPress={handleOpen} now={now} t={t} />
            )}
            ListEmptyComponent={
              <EmptyState
                query={query}
                filter={filter}
                onNewChat={() => setNewChatVisible(true)}
                t={t}
              />
            }
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.brandPrimaryDeep} />}
            contentContainerStyle={filtered.length === 0 ? styles.listEmptyContent : styles.listContent}
            ItemSeparatorComponent={() => <View style={styles.cardGap} />}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />
        )}
      </View>

      <NewChatSheet
        visible={newChatVisible}
        onClose={() => setNewChatVisible(false)}
        onStarted={handleNewChatStarted}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F0F5FF" },
  composeBtn: {
    width: sw(38),
    height: sw(38),
    borderRadius: sw(12),
    backgroundColor: "#E8F0FF",
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.18)",
    alignItems: "center",
    justifyContent: "center",
    ...cardShadow,
  },
  toolbar: {
    backgroundColor: Colors.surface,
    paddingBottom: sw(12),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
  },
  searchWrap: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: sw(10),
    paddingBottom: sw(10),
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    paddingHorizontal: Layout.screenPadding,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(5),
    paddingHorizontal: sw(12),
    paddingVertical: sw(7),
    borderRadius: sw(999),
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    flexShrink: 0,
  },
  filterChipActive: {
    backgroundColor: BRAND_BLUE,
    borderColor: BRAND_BLUE,
  },
  filterChipText: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: "#64748B",
  },
  filterChipTextActive: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  filterCountBubble: {
    minWidth: sw(18),
    height: sw(18),
    borderRadius: sw(9),
    paddingHorizontal: sw(4),
    backgroundColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  filterCountBubbleActive: {
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  filterCountText: {
    fontFamily: Fonts.bold,
    fontSize: sf(10),
    color: "#64748B",
    fontWeight: "700",
  },
  filterCountTextActive: {
    color: "#FFFFFF",
  },
  listArea: {
    flex: 1,
    minHeight: 0,
  },
  loader: {
    marginTop: sw(32),
  },
  listContent: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: sw(14),
    paddingBottom: sw(28),
  },
  listEmptyContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
    paddingHorizontal: Layout.screenPadding,
    paddingTop: sw(28),
    paddingBottom: sw(32),
  },
  cardChevron: {
    marginTop: sw(14),
    flexShrink: 0,
  },
  cardGap: {
    height: sw(12),
  },
  card: {
    borderRadius: CARD_RADIUS,
    padding: sw(14),
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.08)",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(12),
    ...cardShadow,
  },
  neighborCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "rgba(20, 184, 166, 0.1)",
  },
  neighborAvatarWrap: {
    width: sw(50),
    height: sw(50),
    position: "relative",
    flexShrink: 0,
  },
  neighborRoleDot: {
    position: "absolute",
    end: -sw(2),
    bottom: -sw(2),
    width: sw(18),
    height: sw(18),
    borderRadius: sw(9),
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  neighborRoleDotAdmin: {
    backgroundColor: Colors.brandPrimaryDeep,
  },
  neighborRoleDotResident: {
    backgroundColor: "#059669",
  },
  listingCard: {
    flexDirection: "column",
    gap: sw(12),
  },
  cardUnreadNeighbor: {
    borderStartWidth: 3,
    borderStartColor: BRAND_BLUE,
    paddingStart: sw(12),
    backgroundColor: "#EEF4FF",
    borderColor: "rgba(20, 184, 166, 0.18)",
  },
  cardUnreadListing: {
    borderStartWidth: 3,
    borderStartColor: "#059669",
    paddingStart: sw(12),
    backgroundColor: "#F0FDF9",
    borderColor: "rgba(5, 150, 105, 0.15)",
  },
  listingCardMain: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(12),
    width: "100%",
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
    gap: sw(5),
  },
  topLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: sw(8),
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
    minWidth: 0,
  },
  name: {
    fontFamily: Fonts.bold,
    fontSize: sf(15),
    lineHeight: sf(22),
    color: Colors.textPrimary,
    flex: 1,
    includeFontPadding: true,
  },
  nameAr: {
    fontFamily: "NotoSansArabic-Bold",
    fontWeight: "normal",
    fontSize: sf(15),
    lineHeight: sf(26),
    letterSpacing: 0,
    writingDirection: "rtl",
    textAlign: "left",
    includeFontPadding: true,
    paddingStart: sw(2),
    paddingEnd: sw(8),
  },
  nameUnread: {
    color: Colors.brandPrimaryDeep,
  },
  nameUnreadListing: {
    color: "#047857",
  },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: sw(4),
    paddingHorizontal: sw(8),
    paddingVertical: sw(3),
    borderRadius: sw(999),
    flexShrink: 0,
  },
  typeBadgeNeighbor: {
    backgroundColor: "#D1FAF5",
  },
  typeBadgeListing: {
    backgroundColor: "#ECFDF5",
  },
  typeBadgeText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(10),
    fontWeight: "600",
  },
  typeBadgeTextNeighbor: {
    color: Colors.brandPrimaryDeep,
  },
  typeBadgeTextListing: {
    color: "#059669",
  },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(4),
    paddingHorizontal: sw(8),
    paddingVertical: sw(3),
    borderRadius: 999,
    borderWidth: 1,
    flexShrink: 0,
  },
  roleBadgeAdmin: {
    backgroundColor: "#D1FAF5",
    borderColor: "rgba(20, 184, 166, 0.28)",
  },
  roleBadgeResident: {
    backgroundColor: "#ECFDF5",
    borderColor: "#A7F3D0",
  },
  roleBadgeText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(10),
    fontWeight: "600",
  },
  roleBadgeTextAdmin: {
    color: Colors.brandPrimaryDeep,
  },
  roleBadgeTextResident: {
    color: "#047857",
  },
  previewMuted: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(17),
    color: "#94A3B8",
  },
  time: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    color: Colors.textMuted,
    flexShrink: 0,
  },
  timeUnread: {
    color: Colors.brandPrimaryDeep,
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
  },
  timeUnreadListing: {
    color: "#059669",
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
  },
  preview: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(19),
    color: Colors.textMuted,
  },
  previewUnread: {
    fontFamily: Fonts.medium,
    color: Colors.textBody,
    fontWeight: "500",
  },
  listingStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(10),
    padding: sw(10),
    borderRadius: sw(12),
    backgroundColor: "#F0FDF9",
    borderWidth: 1,
    borderColor: "rgba(5, 150, 105, 0.12)",
    width: "100%",
  },
  listingStripImage: {
    width: sw(48),
    height: sw(48),
    borderRadius: sw(10),
  },
  listingStripImagePlaceholder: {
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
  },
  listingStripCopy: {
    flex: 1,
    minWidth: 0,
    gap: sw(2),
  },
  listingStripLabel: {
    fontFamily: Fonts.medium,
    fontSize: sf(10),
    color: "#059669",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  listingStripTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    color: Colors.textPrimary,
    fontWeight: "600",
  },
  listingStripPrice: {
    fontFamily: Fonts.bold,
    fontSize: sf(12),
    color: "#047857",
    fontWeight: "700",
  },
  badge: {
    backgroundColor: Colors.brandPrimaryDeep,
    borderRadius: sw(10),
    minWidth: sw(22),
    height: sw(22),
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: sw(6),
    flexShrink: 0,
    marginTop: sw(4),
  },
  badgeListing: {
    backgroundColor: "#059669",
  },
  badgeText: {
    fontFamily: Fonts.bold,
    fontSize: sf(10),
    color: "#FFFFFF",
    fontWeight: "700",
  },
  empty: {
    alignItems: "center",
    alignSelf: "center",
    width: "100%",
    maxWidth: sw(320),
    paddingHorizontal: sw(8),
    gap: sw(10),
  },
  emptyIconWrap: {
    width: sw(72),
    height: sw(72),
    borderRadius: sw(22),
    alignItems: "center",
    justifyContent: "center",
    marginBottom: sw(4),
    backgroundColor: T.mint,
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.2)",
  },
  emptyTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(17),
    color: T.navy,
    fontWeight: "700",
    textAlign: "center",
  },
  emptyText: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: sf(20),
    maxWidth: sw(280),
  },
  emptyBtn: {
    marginTop: sw(16),
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(8),
    paddingHorizontal: sw(20),
    paddingVertical: sw(13),
    borderRadius: sw(999),
    backgroundColor: "#1B4F8A",
    borderWidth: 1,
    borderColor: "#1B4F8A",
    ...Platform.select({
      ios: {
        ...rnShadow({ color: "#0F172A", offset: { width: 0, height: 4 }, opacity: 0.18, radius: 8 }),
      },
      android: { elevation: 5 },
    }),
  },
  emptyBtnText: {
    fontFamily: Fonts.bold,
    fontSize: sf(15),
    color: "#FFFFFF",
    fontWeight: "700",
  },
});
