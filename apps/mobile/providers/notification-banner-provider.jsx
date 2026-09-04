import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Fonts } from "../constants/font";
import { subscribeNotificationBanner } from "../services/notification-events";
import { resolveNotificationVisual } from "../utils/notification-visual";
import i18n from "../i18n";
import { rnShadow } from "../utils/shadow";


const NotificationBannerContext = createContext(null);
const AUTO_DISMISS_MS = 4500;
const SWIPE_UP_DISMISS = -48;
const SWIPE_SIDE_DISMISS = 72;
const HIDDEN_Y = -140;

function buildItemId(payload) {
  return payload.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function ForegroundNotificationBanner({
  item,
  topInset,
  onDismiss,
  onPress,
}) {
  const translateY = useRef(new Animated.Value(HIDDEN_Y)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const dragX = useRef(new Animated.Value(0)).current;
  const dismissingRef = useRef(false);

  const runDismiss = useCallback(
    (direction = "up") => {
      if (dismissingRef.current) return;
      dismissingRef.current = true;

      const toY = direction === "up" ? HIDDEN_Y : 0;
      const toX = direction === "left" ? -360 : direction === "right" ? 360 : 0;

      Animated.parallel([
        Animated.timing(translateY, {
          toValue: toY,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(dragX, {
          toValue: toX,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) onDismiss(item.id);
      });
    },
    [dragX, item.id, onDismiss, translateY],
  );

  useEffect(() => {
    dismissingRef.current = false;
    dragY.setValue(0);
    dragX.setValue(0);
    translateY.setValue(HIDDEN_Y);

    Animated.spring(translateY, {
      toValue: 0,
      damping: 18,
      stiffness: 220,
      mass: 0.8,
      useNativeDriver: true,
    }).start();

    const timer = setTimeout(() => runDismiss("up"), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [dragX, dragY, item.id, runDismiss, translateY]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dy) > 6 || Math.abs(gesture.dx) > 6,
        onPanResponderMove: (_, gesture) => {
          dragY.setValue(Math.min(0, gesture.dy));
          dragX.setValue(gesture.dx);
        },
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dy < SWIPE_UP_DISMISS || gesture.vy < -0.75) {
            runDismiss("up");
            return;
          }
          if (gesture.dx < -SWIPE_SIDE_DISMISS || gesture.vx < -0.75) {
            runDismiss("left");
            return;
          }
          if (gesture.dx > SWIPE_SIDE_DISMISS || gesture.vx > 0.75) {
            runDismiss("right");
            return;
          }

          Animated.parallel([
            Animated.spring(dragY, {
              toValue: 0,
              damping: 18,
              stiffness: 240,
              useNativeDriver: true,
            }),
            Animated.spring(dragX, {
              toValue: 0,
              damping: 18,
              stiffness: 240,
              useNativeDriver: true,
            }),
          ]).start();
        },
      }),
    [dragX, dragY, runDismiss],
  );

  const combinedY = Animated.add(translateY, dragY);
  const visual = resolveNotificationVisual(item);

  return (
    <Animated.View
      style={[
        styles.wrap,
        {
          paddingTop: topInset + 8,
          transform: [{ translateY: combinedY }, { translateX: dragX }],
          pointerEvents: "box-none",
        },
      ]}
      {...panResponder.panHandlers}
    >
      <Pressable
        style={styles.card}
        onPress={() => {
          onPress?.();
          runDismiss("up");
        }}
      >
        <View style={[styles.iconWrap, { backgroundColor: visual.iconBackground }]}>
          {visual.iconSource ? (
            <Image source={visual.iconSource} style={styles.iconImage} contentFit="contain" />
          ) : (
            <Ionicons name={visual.ionicon} size={18} color={visual.iconColor} />
          )}
        </View>
        <View style={styles.copy}>
          <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
          {item.body ? (
            <Text style={styles.body} numberOfLines={2}>{item.body}</Text>
          ) : null}
        </View>
        <Pressable
          style={styles.dismissBtn}
          onPress={() => runDismiss("up")}
          hitSlop={8}
          accessibilityLabel={i18n.t("notifications.dismissNotification")}
        >
          <Ionicons name="close" size={16} color="#9CA3AF" />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

export function NotificationBannerProvider({ children }) {
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState(null);
  const queueRef = useRef([]);
  const onPressMapRef = useRef(new Map());
  const showingRef = useRef(false);

  const showNext = useCallback(() => {
    if (showingRef.current) return;

    const next = queueRef.current.shift();
    if (!next) {
      setCurrent(null);
      return;
    }

    showingRef.current = true;
    setCurrent(next);
  }, []);

  const removeItem = useCallback(
    (id) => {
      onPressMapRef.current.delete(id);
      queueRef.current = queueRef.current.filter((item) => item.id !== id);
      showingRef.current = false;
      showNext();
    },
    [showNext],
  );

  const clearAll = useCallback(() => {
    onPressMapRef.current.clear();
    queueRef.current = [];
    showingRef.current = false;
    setCurrent(null);
  }, []);

  const showBanner = useCallback(
    ({ id, title, body, kind, type, actionUrl, onPress }) => {
      const itemId = buildItemId({ id });
      onPressMapRef.current.set(itemId, onPress ?? null);

      const nextItem = {
        id: itemId,
        sourceId: id ?? null,
        title: String(title ?? i18n.t("notifications.defaultTitle")),
        body: String(body ?? ""),
        kind: kind ?? null,
        type: type ?? null,
        actionUrl: actionUrl ?? null,
      };

      queueRef.current = queueRef.current.filter(
        (item) => item.sourceId !== nextItem.sourceId,
      );
      queueRef.current.push(nextItem);

      if (!showingRef.current) {
        showNext();
      }
    },
    [showNext],
  );

  useEffect(() => subscribeNotificationBanner(showBanner), [showBanner]);

  const handleDismiss = useCallback(
    (id) => {
      onPressMapRef.current.delete(id);
      showingRef.current = false;
      showNext();
    },
    [showNext],
  );

  const value = useMemo(
    () => ({ showBanner, clearAll, removeItem }),
    [showBanner, clearAll, removeItem],
  );

  return (
    <NotificationBannerContext.Provider value={value}>
      {children}
      {current ? (
        <ForegroundNotificationBanner
          key={current.id}
          item={current}
          topInset={insets.top}
          onDismiss={handleDismiss}
          onPress={() => onPressMapRef.current.get(current.id)?.()}
        />
      ) : null}
    </NotificationBannerContext.Provider>
  );
}

export function useNotificationBanner() {
  const ctx = useContext(NotificationBannerContext);
  if (!ctx) {
    throw new Error("useNotificationBanner must be used within NotificationBannerProvider");
  }
  return ctx;
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 99999,
    elevation: 999,
    paddingHorizontal: 12,
  },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    ...rnShadow({ color: "#000", offset: { width: 0, height: 6 }, opacity: 0.1, radius: 12 }),
    elevation: 12,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  iconImage: {
    width: 20,
    height: 20,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    paddingTop: 1,
  },
  dismissBtn: {
    paddingTop: 2,
    paddingStart: 4,
  },
  title: {
    fontFamily: Fonts.semibold,
    fontSize: 14,
    lineHeight: 18,
    color: "#111827",
  },
  body: {
    marginTop: 2,
    fontFamily: Fonts.regular,
    fontSize: 12,
    lineHeight: 16,
    color: "#6B7280",
  },
});
