// components/CreateNewModal.jsx

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
} from "react-native";
import { useTranslation } from "react-i18next";
import AppModal from "../layout/app-modal";
import { Feather } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { HomeTheme as HT } from "../../constants/home-theme";
import { useRouter } from "expo-router";
import { getUser } from "../../services/auth-session";
import { fetchMe } from "../../services/profile-api";
import { canAccessDashboard, isCommunityAdmin } from "../../services/community-access";
import { PropertyManagementRoutes } from "../../constants/property-management-routes";
import ThemedIconBox from "./themed-icon-box";
import NoticeDrawer from "./noticeDrawer";
import { sf, sw } from "../../utils/responsive";
import { chevronForward } from "../../utils/rtl";

function CreateOptionRow({
  icon,
  iconBg = HT.mint,
  iconColor = HT.navy,
  title,
  titleStyle,
  subtitle,
  onPress,
  trailing,
  style,
}) {
  return (
    <TouchableOpacity activeOpacity={0.85} style={[styles.option, style]} onPress={onPress}>
      <ThemedIconBox name={icon} size="sm" backgroundColor={iconBg} color={iconColor} />
      <View style={styles.optionCopy}>
        <Text style={titleStyle}>{title}</Text>
        <Text style={styles.optionSubtitle}>{subtitle}</Text>
      </View>
      {trailing}
    </TouchableOpacity>
  );
}

export default function CreateNewModal({ visible, onClose, onOpen }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [canManageCommunity, setCanManageCommunity] = useState(false);
  const [canCreateResidentEvent, setCanCreateResidentEvent] = useState(false);
  const [openNoticeDrawer, setOpenNoticeDrawer] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const syncAccess = async () => {
      try {
        const user = await fetchMe();
        if (cancelled) return;
        const isAdmin = isCommunityAdmin(user);
        setCanManageCommunity(isAdmin);
        setCanCreateResidentEvent(!isAdmin && canAccessDashboard(user));
      } catch {
        const user = await getUser();
        if (cancelled) return;
        const isAdmin = isCommunityAdmin(user);
        setCanManageCommunity(isAdmin);
        setCanCreateResidentEvent(!isAdmin && canAccessDashboard(user));
      }
    };

    syncAccess();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!visible) return;

    let cancelled = false;

    (async () => {
      try {
        const user = await fetchMe();
        if (cancelled) return;
        const isAdmin = isCommunityAdmin(user);
        setCanManageCommunity(isAdmin);
        setCanCreateResidentEvent(!isAdmin && canAccessDashboard(user));
      } catch {
        const user = await getUser();
        if (cancelled) return;
        const isAdmin = isCommunityAdmin(user);
        setCanManageCommunity(isAdmin);
        setCanCreateResidentEvent(!isAdmin && canAccessDashboard(user));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible]);

  const showCreateEvent = canManageCommunity || canCreateResidentEvent;
  return (
    <>
      <AppModal visible={visible} onRequestClose={onClose}>
        <Pressable style={styles.overlay} onPress={onClose}>
          <Pressable style={styles.container}>
            <TouchableOpacity activeOpacity={0.7} onPress={onClose}>
              <View style={styles.handle} />
            </TouchableOpacity>

            <View style={styles.headerRow}>
              <ThemedIconBox name="plus-circle" size="md" backgroundColor={HT.mint} color={HT.teal} />
              <View style={styles.headerCopy}>
                <Text style={styles.title}>{t("nav.createNew")}</Text>
                <Text style={styles.subtitle}>{t("nav.createNewSub")}</Text>
              </View>
            </View>

            <CreateOptionRow
              icon="edit-3"
              iconBg="#D1FAF5"
              iconColor={HT.navy}
              title={t("nav.createPost")}
              titleStyle={styles.optionTitleTeal}
              subtitle={t("nav.createPostSub")}
              style={{ marginBottom: 10 }}
              onPress={() => {
                onClose();
                router.push("/screens/create-post");
              }}
            />

            {showCreateEvent ? (
              <CreateOptionRow
                icon="calendar"
                iconBg="#DBEAFE"
                iconColor="#1D4ED8"
                title={t("nav.createEvent")}
                titleStyle={styles.optionTitleBlue}
                subtitle={
                  canManageCommunity ? t("nav.createEventSub") : t("nav.createEventSubAdmin")
                }
                style={{ marginBottom: 10 }}
                onPress={() => {
                  onClose();
                  router.push("/screens/create-event");
                }}
              />
            ) : null}

            <CreateOptionRow
              icon="shopping-bag"
              iconBg="#D1FAE5"
              iconColor="#059669"
              title={t("nav.sellItem")}
              titleStyle={styles.optionTitleGreen}
              subtitle={t("nav.sellItemSub")}
              style={{ marginBottom: 10 }}
              onPress={() => {
                onClose();
                router.push({ pathname: "/screens/createListing", params: { type: "item" } });
              }}
            />

            <CreateOptionRow
              icon="tool"
              iconBg="#ECFDF5"
              iconColor="#047857"
              title={t("nav.offerService")}
              titleStyle={styles.optionTitleGreen}
              subtitle={t("nav.offerServiceSub")}
              style={{ marginBottom: canManageCommunity ? 10 : 0 }}
              onPress={() => {
                onClose();
                router.push({ pathname: "/screens/createListing", params: { type: "service" } });
              }}
            />
            {canManageCommunity && (
              <>
                <CreateOptionRow
                  icon="book-open"
                  iconBg="#CCFBF1"
                  iconColor="#0F766E"
                  title={t("nav.addRule")}
                  titleStyle={styles.optionTitleTeal}
                  subtitle={t("nav.addRuleSub")}
                  style={{ marginBottom: 10 }}
                  onPress={() => {
                    onClose();
                    router.push(PropertyManagementRoutes.RULE_FORM);
                  }}
                />

                <CreateOptionRow
                  icon="file-text"
                  iconBg="#FFEDD5"
                  iconColor="#C2410C"
                  title={t("nav.addDocument")}
                  titleStyle={styles.optionTitleOrange}
                  subtitle={t("nav.addDocumentSub")}
                  style={{ marginBottom: 10 }}
                  onPress={() => {
                    onClose();
                    router.push(PropertyManagementRoutes.DOCUMENT_FORM);
                  }}
                />

                <CreateOptionRow
                  icon="bell"
                  iconBg="#DBEAFE"
                  iconColor={HT.navy}
                  title={t("nav.notice")}
                  titleStyle={styles.optionTitleBlue}
                  subtitle={t("nav.noticeSub")}
                  trailing={
                    <View style={styles.noticeChevron}>
                      <Feather name={chevronForward()} size={sf(16)} color={HT.navy} />
                    </View>
                  }
                  onPress={() => {
                    onClose();
                    setOpenNoticeDrawer(true);
                  }}
                />
              </>
            )}
          </Pressable>
        </Pressable>
      </AppModal>

      <NoticeDrawer
        visible={openNoticeDrawer}
        onClose={() => setOpenNoticeDrawer(false)}
        onBackToCreate={onOpen}
      />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },

  container: {
    backgroundColor: "rgba(255, 255, 255, 1)",
    borderTopStartRadius: 24,
    borderTopEndRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },

  handle: {
    width: 44,
    height: 4,
    borderRadius: 16,
    backgroundColor: "rgba(229, 231, 235, 1)",
    alignSelf: "center",
    marginBottom: 18,
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
    marginBottom: sw(18),
  },

  headerCopy: {
    flex: 1,
    minWidth: 0,
  },

  title: {
    fontSize: 17,
    fontWeight: "700",
    color: "rgba(0, 0, 0, 1)",
    lineHeight: 22,
    fontFamily: Fonts.bold,
  },

  subtitle: {
    fontSize: 12,
    color: "rgba(106, 114, 130, 1)",
    marginTop: 2,
    fontFamily: Fonts.regular,
    lineHeight: 16,
    fontWeight: "400",
  },

  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
    padding: sw(14),
    backgroundColor: "rgba(249, 250, 251, 1)",
    borderRadius: sw(14),
    borderWidth: 1,
    borderColor: "#EEF2F6",
  },

  optionCopy: {
    flex: 1,
    minWidth: 0,
  },

  noticeChevron: {
    width: sw(28),
    height: sw(28),
    borderRadius: sw(14),
    backgroundColor: HT.mint,
    alignItems: "center",
    justifyContent: "center",
  },

  optionTitleBlue: {
    fontFamily: Fonts.bold,
    fontSize: 14,
    fontWeight: "700",
    color: "rgba(20, 184, 166, 1)",
    lineHeight: 18,
  },

  optionTitleOrange: {
    fontSize: 14,
    fontWeight: "700",
    color: "rgba(194, 65, 12, 1)",
    lineHeight: 18,
    fontFamily: Fonts.bold,
  },

  optionTitleTeal: {
    fontSize: 14,
    fontWeight: "700",
    color: "rgba(15, 118, 110, 1)",
    lineHeight: 18,
    fontFamily: Fonts.bold,
  },

  optionTitleGreen: {
    fontSize: 14,
    fontWeight: "700",
    color: "rgba(5, 150, 105, 1)",
    lineHeight: 18,
    fontFamily: Fonts.bold,
  },

  optionSubtitle: {
    fontSize: 12,
    color: "rgba(74, 85, 101, 1)",
    lineHeight: 16,
    fontWeight: "400",
    fontFamily: Fonts.medium,
  },
});
