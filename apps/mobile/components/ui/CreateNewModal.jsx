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
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { useRouter } from "expo-router";
import { getUser } from "../../services/auth-session";
import { fetchMe } from "../../services/profile-api";
import { canAccessDashboard, isCommunityAdmin } from "../../services/community-access";
import { PropertyManagementRoutes } from "../../constants/property-management-routes";
import NoticeDrawer from "./noticeDrawer";

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

            <Text style={styles.title}>{t("nav.createNew")}</Text>
            <Text style={styles.subtitle}>{t("nav.createNewSub")}</Text>

            <TouchableOpacity
              style={[styles.option, { marginBottom: 10 }]}
              onPress={() => {
                onClose();
                router.push("/screens/create-post");
              }}
            >
              <View style={styles.optionIconWrap}>
                <Image
                  source={require("../../assets/images/create-post.png")}
                  style={styles.optionIcon}
                />
              </View>

              <View>
                <Text style={styles.optionTitleBlue}>{t("nav.createPost")}</Text>
                <Text style={styles.optionSubtitle}>
                  {t("nav.createPostSub")}
                </Text>
              </View>
            </TouchableOpacity>

            {showCreateEvent ? (
              <TouchableOpacity
                style={[styles.option, { marginBottom: 10 }]}
                onPress={() => {
                  onClose();
                  router.push("/screens/create-event");
                }}
              >
                <View style={styles.optionIconWrap}>
                  <Image
                    source={require("../../assets/images/event-notice.png")}
                    style={styles.optionIcon}
                  />
                </View>

                <View>
                  <Text style={styles.optionTitleBlue}>{t("nav.createEvent")}</Text>
                  <Text style={styles.optionSubtitle}>
                    {canManageCommunity
                      ? t("nav.createEventSub")
                      : t("nav.createEventSubAdmin")}
                  </Text>
                </View>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={[styles.option, { marginBottom: 10 }]}
              onPress={() => {
                onClose();
                router.push({ pathname: "/screens/createListing", params: { type: "item" } });
              }}
            >
              <View style={styles.optionIconWrap}>
                <Image
                  source={require("../../assets/images/marketplace-item.png")}
                  style={styles.optionIcon}
                />
              </View>

              <View>
                <Text style={styles.optionTitleGreen}>{t("nav.sellItem")}</Text>
                <Text style={styles.optionSubtitle}>{t("nav.sellItemSub")}</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.option,
                { marginBottom: canManageCommunity ? 10 : 0 },
              ]}
              onPress={() => {
                onClose();
                router.push({ pathname: "/screens/createListing", params: { type: "service" } });
              }}
            >
              <View style={styles.optionIconWrap}>
                <Image
                  source={require("../../assets/images/marketplace-item.png")}
                  style={styles.optionIcon}
                />
              </View>

              <View>
                <Text style={styles.optionTitleGreen}>{t("nav.offerService")}</Text>
                <Text style={styles.optionSubtitle}>
                  {t("nav.offerServiceSub")}
                </Text>
              </View>
            </TouchableOpacity>
            {canManageCommunity && (
              <>
                <TouchableOpacity
                  style={[styles.option, { marginBottom: 10 }]}
                  onPress={() => {
                    onClose();
                    router.push(PropertyManagementRoutes.RULE_FORM);
                  }}
                >
                  <View style={[styles.optionIconWrap, styles.featherIconWrap, { backgroundColor: "#CCFBF1" }]}>
                    <Feather name="book-open" size={18} color="#0F766E" />
                  </View>
                  <View>
                    <Text style={styles.optionTitleTeal}>{t("nav.addRule")}</Text>
                    <Text style={styles.optionSubtitle}>
                      {t("nav.addRuleSub")}
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.option, { marginBottom: 10 }]}
                  onPress={() => {
                    onClose();
                    router.push(PropertyManagementRoutes.DOCUMENT_FORM);
                  }}
                >
                  <View style={[styles.optionIconWrap, styles.featherIconWrap, { backgroundColor: "#FFEDD5" }]}>
                    <Feather name="file-text" size={18} color="#C2410C" />
                  </View>
                  <View>
                    <Text style={styles.optionTitleOrange}>{t("nav.addDocument")}</Text>
                    <Text style={styles.optionSubtitle}>
                      {t("nav.addDocumentSub")}
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.option, { justifyContent: "space-between" }]}
                  onPress={() => {
                    onClose();
                    setOpenNoticeDrawer(true);
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <View style={styles.optionIconWrap}>
                      <Image
                        source={require("../../assets/images/notice-drawer.png")}
                        style={styles.optionIcon}
                      />
                    </View>

                    <View>
                      <Text style={styles.optionTitleBlue}>{t("nav.notice")}</Text>
                      <Text style={styles.optionSubtitle}>
                        {t("nav.noticeSub")}
                      </Text>
                    </View>
                  </View>
                  <Image
                    source={require("../../assets/images/next-icon.png")}
                    style={styles.chevronIcon}
                  />
                </TouchableOpacity>
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
    marginBottom: 18,
    fontFamily: Fonts.regular,
    lineHeight: 16,
    fontWeight: "400",
  },

  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    backgroundColor: "rgba(249, 250, 251, 1)",
    borderRadius: 14,
  },

  optionIconWrap: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },

  featherIconWrap: {
    borderRadius: 10,
  },

  optionIcon: {
    width: 36,
    height: 36,
  },

  chevronIcon: {
    width: 16,
    height: 16,
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
