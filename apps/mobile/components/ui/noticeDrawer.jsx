import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
} from "react-native";
import { useTranslation } from "react-i18next";
import { Feather } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { HomeTheme as HT } from "../../constants/home-theme";
import { useRouter } from "expo-router";
import AppModal from "../layout/app-modal";
import ThemedIconBox from "./themed-icon-box";
import { sw } from "../../utils/responsive";
import { chevronBack } from "../../utils/rtl";
import { useSessionUser } from "../../hooks/use-session-user";
import { isResidentFeatureEnabled } from "../../constants/resident-features";

export default function NoticeDrawer({ visible, onClose, onBackToCreate }) {
  const { t } = useTranslation();
  const router = useRouter();
  const sessionUser = useSessionUser();
  const showNotice = isResidentFeatureEnabled(sessionUser, "notices");
  const showAlert = isResidentFeatureEnabled(sessionUser, "alerts");
  return (
    <AppModal visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.container}>
          <TouchableOpacity activeOpacity={0.7} onPress={onClose}>
            <View style={styles.handle} />
          </TouchableOpacity>

          <View style={styles.headerRow}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => {
                onClose();
                if (onBackToCreate) {
                  onBackToCreate();
                }
              }}
              style={styles.backBtn}
            >
              <Feather name={chevronBack()} size={18} color={HT.navy} />
            </TouchableOpacity>
            <ThemedIconBox name="bell" size="sm" backgroundColor="#DBEAFE" color={HT.navy} />
            <View style={styles.headerCopy}>
              <Text style={styles.title}>{t("notices.options")}</Text>
              <Text style={styles.subtitle}>{t("notices.chooseType")}</Text>
            </View>
          </View>

          {showNotice ? (
          <TouchableOpacity
            style={[styles.option, showAlert ? { marginBottom: 10 } : null]}
            onPress={() => {
              onClose();
              router.push("/screens/create-notice");
            }}
          >
            <ThemedIconBox name="clipboard" size="sm" backgroundColor={HT.mint} color={HT.navy} />
            <View style={styles.optionCopy}>
              <Text style={styles.optionTitle}>{t("notices.notice")}</Text>
              <Text style={styles.optionSubtitle}>{t("notices.generalNotice")}</Text>
            </View>
          </TouchableOpacity>
          ) : null}

          {showAlert ? (
          <TouchableOpacity
            style={styles.option}
            onPress={() => {
              onClose();
              router.push("/screens/create-alert");
            }}
          >
            <ThemedIconBox name="alert-triangle" size="sm" backgroundColor="#FEE2E2" color="#DC2626" />
            <View style={styles.optionCopy}>
              <Text style={styles.optionTitle}>{t("notices.alert")}</Text>
              <Text style={styles.optionSubtitle}>{t("notices.urgentAlert")}</Text>
            </View>
          </TouchableOpacity>
          ) : null}
        </Pressable>
      </Pressable>
    </AppModal>
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

  backBtn: {
    width: sw(32),
    height: sw(32),
    borderRadius: sw(10),
    backgroundColor: HT.mint,
    alignItems: "center",
    justifyContent: "center",
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(10),
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

  optionTitle: {
    fontFamily: Fonts.bold,
    fontSize: 14,
    fontWeight: "700",
    color: "rgba(0, 0, 0, 1)",
    lineHeight: 18,
  },

  optionSubtitle: {
    fontSize: 12,
    color: "rgba(74, 85, 101, 1)",
    lineHeight: 16,
    fontWeight: "400",
    fontFamily: Fonts.medium,
  },
});
