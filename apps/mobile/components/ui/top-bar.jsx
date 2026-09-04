import { View, Text, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import BurgerButton from "./burger-button";
import { Fonts } from "../../constants/font";
import { HomeTheme as T } from "../../constants/home-theme";
import React, { useCallback, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useFocusEffect } from "expo-router";
import { getProfileFields, getRoleLabel } from "../../utils/profile-display";
import { isGuestUser } from "../../services/community-access";
import { fetchMe } from "../../services/profile-api";
import { getUser } from "../../services/auth-session";
import { HeaderShell } from "../layout/header-chrome";
import { sw, sf } from "../../utils/responsive";
import { useNotificationUnread } from "../../hooks/use-notification-unread";
import { useMessageUnread } from "../../hooks/use-message-unread";
import NotificationCountBadge from "./notification-count-badge";
import LanguageToggle from "./language-toggle";
import InboxMenu from "./inbox-menu";
import LocationPickerSheet from "./location-picker-sheet";
import { useLocationScope } from "../../providers/location-scope-provider";
import {
  THIS_COMMUNITY_RADIUS,
  compactRadiusLabel,
  coveringRadius,
} from "../../constants/location-radius";
import {
  MarketplaceRoutes,
  providerProfileParams,
} from "../../constants/marketplace-routes";
import { getCurrentRole } from "../../constants/role-session";

export default function TopBar({ onMenuPress }) {
  const router = useRouter();
  const { t } = useTranslation();
  const [user, setUser] = useState(null);
  const { unread } = useNotificationUnread();
  const { unread: messageUnread } = useMessageUnread();
  const { radiusMiles, setRadiusMiles } = useLocationScope();

  const headerRef = useRef(null);
  const inboxBtnRef = useRef(null);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);

  const totalUnread = (unread || 0) + (messageUnread || 0);

  const navigateFromInbox = useCallback(
    (route) => {
      setInboxOpen(false);
      setTimeout(() => router.push(route), 200);
    },
    [router],
  );

  useFocusEffect(
    useCallback(() => {
      fetchMe()
        .then(setUser)
        .catch(() => getUser().then(setUser));
    }, []),
  );

  const guestUser = isGuestUser(user);
  const { communityName } = getProfileFields(user);
  const roleLabel = getRoleLabel(user);
  const hasCommunity = Boolean(user?.memberships?.some((m) => m?.community?.name));
  const title = hasCommunity ? communityName : t("topBar.chooseYourCommunity");
  const rangeLabel =
    radiusMiles > THIS_COMMUNITY_RADIUS
      ? compactRadiusLabel(radiusMiles)
      : t("topBar.nearbyBadge");

  return (
    <View ref={headerRef} collapsable={false}>
      <HeaderShell padded dense>
        <View style={styles.row}>
          <View style={styles.left}>
            <BurgerButton onPress={onMenuPress} compact plain iconColor={T.navy} />
            <Pressable
              style={styles.location}
              accessibilityRole="button"
              accessibilityLabel={t("topBar.communityLocation", { name: title })}
              onPress={() => setLocationOpen(true)}
            >
              <View style={styles.pinWrap}>
                <Feather name="map-pin" size={sf(12)} color={T.white} />
              </View>
              <Text style={styles.locationText} numberOfLines={1} ellipsizeMode="tail">
                {title}
              </Text>
              {guestUser ? (
                <View style={styles.rolePill}>
                  <Text style={styles.rolePillText}>{roleLabel}</Text>
                </View>
              ) : (
                <View style={styles.rangeChip}>
                  <Text style={styles.rangeChipText} numberOfLines={1}>
                    {rangeLabel}
                  </Text>
                </View>
              )}
              <Feather name="chevron-down" size={sf(15)} color={T.navy} />
            </Pressable>
          </View>

          <View style={styles.right}>
            <LanguageToggle />
            <Pressable
              ref={inboxBtnRef}
              style={({ pressed }) => [styles.inboxBtn, pressed && styles.inboxBtnPressed]}
              onPress={() => setInboxOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={t("notifications.title")}
            >
              <Feather name="inbox" size={sf(17)} color={T.navy} />
              <NotificationCountBadge count={totalUnread} size="sm" label="inbox" />
            </Pressable>
          </View>
        </View>
      </HeaderShell>

      <LocationPickerSheet
        visible={locationOpen}
        onClose={() => setLocationOpen(false)}
        communityName={hasCommunity ? communityName : title}
        radiusMiles={radiusMiles}
        onSelectRadius={setRadiusMiles}
        onSelectBusiness={(business) => {
          if (!business.isLocal && Number(business.distanceMiles) > radiusMiles) {
            setRadiusMiles(coveringRadius(business.distanceMiles));
          }
          router.push({
            pathname: MarketplaceRoutes.PROVIDER_PROFILE,
            params: providerProfileParams(business, getCurrentRole()),
          });
        }}
      />

      <InboxMenu
        visible={inboxOpen}
        onClose={() => setInboxOpen(false)}
        headerRef={headerRef}
        triggerRef={inboxBtnRef}
        messageUnread={messageUnread || 0}
        notificationUnread={unread || 0}
        onMessagesPress={() => navigateFromInbox("/screens/messages")}
        onNotificationsPress={() => navigateFromInbox("/screens/notification")}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: sw(8),
    minHeight: sw(40),
  },
  left: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: sw(4),
    minWidth: 0,
  },
  pinWrap: {
    width: sw(26),
    height: sw(26),
    borderRadius: sw(8),
    backgroundColor: T.navy,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  location: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
    minWidth: 0,
    height: sw(36),
    paddingEnd: sw(2),
  },
  locationText: {
    flexShrink: 1,
    flexGrow: 1,
    minWidth: 0,
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    lineHeight: sf(18),
    color: T.navy,
    fontWeight: "700",
    includeFontPadding: false,
  },
  rangeChip: {
    flexShrink: 0,
    paddingHorizontal: sw(8),
    paddingVertical: sw(3),
    borderRadius: 999,
    backgroundColor: T.mint,
  },
  rangeChipText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(10),
    lineHeight: sf(14),
    color: T.deepTeal,
  },
  rolePill: {
    flexShrink: 0,
    paddingHorizontal: sw(6),
    paddingVertical: sw(2),
    borderRadius: 999,
    backgroundColor: T.mint,
  },
  rolePillText: {
    fontFamily: Fonts.bold,
    fontSize: sf(9),
    lineHeight: sf(13),
    color: T.deepTeal,
    textTransform: "uppercase",
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
    flexShrink: 0,
  },
  inboxBtn: {
    width: sw(36),
    height: sw(36),
    borderRadius: sw(10),
    backgroundColor: T.white,
    borderWidth: 1,
    borderColor: T.border,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "visible",
  },
  inboxBtnPressed: {
    backgroundColor: T.mint,
    borderColor: T.teal,
  },
});
