import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  Modal,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { HomeTheme as T } from "../../constants/home-theme";
import { sw, sf, SCREEN_WIDTH } from "../../utils/responsive";
import { chevronForward } from "../../utils/rtl";

const PANEL_WIDTH = sw(284);
const PANEL_GAP = sw(18);
const H_MARGIN = sw(16);
const ROW_H_PAD = sw(16);
const ICON_SIZE = sw(44);

function InboxMenuRow({ icon, iconColor, iconBg, title, subtitle, count, onPress }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.rowHit, pressed && styles.rowPressed]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <View style={styles.row}>
        <View style={[styles.iconWell, { backgroundColor: iconBg }]}>
          <Feather name={icon} size={sf(18)} color={iconColor} />
        </View>

        <View style={styles.rowCopy}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.rowSub} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>

        <View style={styles.rowTrailing}>
          {count > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{count > 99 ? "99+" : count}</Text>
            </View>
          ) : (
            <Feather name={chevronForward()} size={sf(18)} color={T.gray} />
          )}
        </View>
      </View>
    </Pressable>
  );
}

export default function InboxMenu({
  visible,
  onClose,
  headerRef,
  triggerRef,
  messageUnread = 0,
  notificationUnread = 0,
  onMessagesPress,
  onNotificationsPress,
}) {
  const { t } = useTranslation();
  const anim = useRef(new Animated.Value(0)).current;
  const [panel, setPanel] = useState({ top: 0, left: H_MARGIN });

  const measurePanel = useCallback(() => {
    headerRef?.current?.measureInWindow((_hx, hy, _hw, hh) => {
      triggerRef?.current?.measureInWindow((bx, _by, bw, _bh) => {
        const top = hy + hh + PANEL_GAP;
        const alignedLeft = bx + bw - PANEL_WIDTH;
        const left = Math.max(H_MARGIN, Math.min(alignedLeft, SCREEN_WIDTH - PANEL_WIDTH - H_MARGIN));
        setPanel({ top, left });
      });
    });
  }, [headerRef, triggerRef]);

  useEffect(() => {
    Animated.spring(anim, {
      toValue: visible ? 1 : 0,
      friction: 9,
      tension: 140,
      useNativeDriver: true,
    }).start();
  }, [visible, anim]);

  useEffect(() => {
    if (!visible) return undefined;
    measurePanel();
    const timer = setTimeout(measurePanel, 32);
    return () => clearTimeout(timer);
  }, [visible, measurePanel]);

  if (!visible) return null;

  const totalUnread = messageUnread + notificationUnread;

  return (
    <Modal transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t("notifications.closeInbox", "Close inbox")} />

      <Animated.View
        style={[
          styles.panel,
          { top: panel.top, left: panel.left, width: PANEL_WIDTH },
          {
            opacity: anim,
            transform: [
              {
                translateY: anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-8, 0],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.headerTitle}>{t("notifications.inbox", "Inbox")}</Text>
            <Text style={styles.headerSub}>
              {totalUnread > 0
                ? t("notifications.unreadCount", { count: totalUnread, defaultValue: "{{count}} unread" })
                : t("notifications.allCaughtUp", "All caught up")}
            </Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t("notifications.closeInbox", "Close inbox")}
            hitSlop={8}
          >
            <Feather name="x" size={sf(20)} color={T.navy} />
          </Pressable>
        </View>

        <View style={styles.headerDivider} />

        <View style={styles.body}>
          <InboxMenuRow
            icon="message-circle"
            iconColor={T.deepTeal}
            iconBg={T.mint}
            title={t("notifications.messages", "Messages")}
            subtitle={t("notifications.messagesSub", "Conversations & chats")}
            count={messageUnread}
            onPress={onMessagesPress}
          />

          <View style={styles.rowDivider} />

          <InboxMenuRow
            icon="bell"
            iconColor={T.navy}
            iconBg="#E8F0F8"
            title={t("notifications.title", "Notifications")}
            subtitle={t("notifications.sub", "Updates & alerts")}
            count={notificationUnread}
            onPress={onNotificationsPress}
          />
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
  },
  panel: {
    position: "absolute",
    backgroundColor: T.white,
    borderRadius: sw(16),
    borderWidth: 1,
    borderColor: T.border,
    overflow: "hidden",
    ...(Platform.OS === "ios"
      ? {
          shadowColor: "#1B4F8A",
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.16,
          shadowRadius: 28,
        }
      : { elevation: 14 }),
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    paddingHorizontal: ROW_H_PAD,
    paddingTop: sw(14),
    paddingBottom: sw(12),
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    marginEnd: sw(8),
  },
  headerTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(16),
    lineHeight: sf(22),
    color: T.navy,
  },
  headerSub: {
    marginTop: sw(2),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(16),
    color: T.gray,
  },
  closeBtn: {
    width: sw(36),
    height: sw(36),
    borderRadius: sw(10),
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    backgroundColor: T.canvas,
  },
  closeBtnPressed: {
    backgroundColor: T.mint,
  },
  headerDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: T.border,
    width: "100%",
  },
  body: {
    width: "100%",
  },
  rowHit: {
    width: "100%",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    paddingHorizontal: ROW_H_PAD,
    paddingVertical: sw(14),
    minHeight: sw(72),
  },
  rowPressed: {
    backgroundColor: T.canvas,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: T.border,
    marginStart: ROW_H_PAD + ICON_SIZE + sw(12),
    marginEnd: ROW_H_PAD,
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
  rowTrailing: {
    width: sw(24),
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginStart: sw(8),
  },
  badge: {
    minWidth: sw(22),
    height: sw(22),
    borderRadius: sw(11),
    backgroundColor: "#FF3B30",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: sw(6),
  },
  badgeText: {
    fontFamily: Fonts.bold,
    fontSize: sf(10),
    color: T.white,
  },
});
