import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Platform,
  Pressable,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { HomeTheme as T } from "../../constants/home-theme";
import { sw, sf, SCREEN_WIDTH } from "../../utils/responsive";
import { chevronForward, isAppRtl } from "../../utils/rtl";
import { rnShadow } from "../../utils/shadow";

const PANEL_WIDTH = sw(284);
const PANEL_GAP = sw(8);
const H_MARGIN = sw(16);
const ICON_SIZE = sw(40);

function MenuRow({ icon, iconColor, iconBg, title, subtitle, onPress }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.rowHit, pressed && styles.rowPressed]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <View style={styles.row}>
        <View style={[styles.iconWell, { backgroundColor: iconBg }]}>
          <Feather name={icon} size={sf(17)} color={iconColor} />
        </View>
        <View style={styles.rowCopy}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.rowSub} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <Feather name={chevronForward()} size={sf(16)} color={T.gray} />
      </View>
    </Pressable>
  );
}

export default function CommunityLocationMenu({
  visible,
  onClose,
  headerRef,
  triggerRef,
  showDiscoverNearby = true,
  showSwitchCommunity = false,
  onDiscoverNearby,
  onSwitchCommunity,
}) {
  const { t } = useTranslation();
  const [panel, setPanel] = useState({ top: H_MARGIN, left: H_MARGIN });

  const measurePanel = useCallback(() => {
    headerRef?.current?.measureInWindow((_hx, hy, _hw, hh) => {
      triggerRef?.current?.measureInWindow((bx, _by, bw) => {
        const top = hy + hh + PANEL_GAP;
        const alignedLeft = isAppRtl() ? bx + bw - PANEL_WIDTH : bx;
        const left = Math.max(H_MARGIN, Math.min(alignedLeft, SCREEN_WIDTH - PANEL_WIDTH - H_MARGIN));
        setPanel({ top, left });
      });
    });
  }, [headerRef, triggerRef]);

  useEffect(() => {
    if (!visible) return undefined;
    measurePanel();
    const timer = setTimeout(measurePanel, 32);
    return () => clearTimeout(timer);
  }, [visible, measurePanel]);

  if (!showDiscoverNearby && !showSwitchCommunity) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      hardwareAccelerated={Platform.OS === "android" ? true : undefined}
      onRequestClose={onClose}
    >
      <Pressable
        style={styles.overlay}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t("common.close")}
      >
        <Pressable
          style={[
            styles.panel,
            { marginTop: panel.top, marginLeft: panel.left, width: PANEL_WIDTH },
          ]}
          onPress={(event) => event.stopPropagation()}
        >
          <View style={styles.body}>
            {showDiscoverNearby ? (
              <MenuRow
                icon="compass"
                iconColor={T.deepTeal}
                iconBg={T.mint}
                title={t("topBar.discoverNearby")}
                subtitle={t("topBar.discoverNearbySub")}
                onPress={onDiscoverNearby}
              />
            ) : null}
            {showSwitchCommunity ? (
              <MenuRow
                icon="repeat"
                iconColor={T.navy}
                iconBg="#E8F0F8"
                title={t("topBar.switchCommunity")}
                subtitle={t("topBar.switchCommunitySub")}
                onPress={onSwitchCommunity}
              />
            ) : null}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    width: "100%",
    height: "100%",
    backgroundColor: "rgba(15, 23, 42, 0.32)",
    alignItems: "flex-start",
    justifyContent: "flex-start",
  },
  panel: {
    backgroundColor: T.white,
    borderRadius: sw(18),
    borderWidth: 1,
    borderColor: T.border,
    overflow: "hidden",
    ...(Platform.OS === "ios"
      ? {
          ...rnShadow({ color: "#1B4F8A", offset: { width: 0, height: 10 }, opacity: 0.16, radius: 28 }),
        }
      : { elevation: 14 }),
  },
  body: {
    padding: sw(10),
    gap: sw(8),
  },
  rowHit: {
    width: "100%",
    borderRadius: sw(14),
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#EEF2F6",
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    paddingHorizontal: sw(12),
    paddingVertical: sw(12),
    minHeight: sw(64),
  },
  rowPressed: {
    backgroundColor: T.canvas,
    borderColor: T.mint,
  },
  iconWell: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: sw(12),
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginEnd: sw(12),
  },
  rowCopy: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    justifyContent: "center",
    marginEnd: sw(8),
  },
  rowTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(15),
    lineHeight: sf(20),
    color: T.navy,
  },
  rowSub: {
    marginTop: sw(2),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(16),
    color: T.gray,
  },
});
