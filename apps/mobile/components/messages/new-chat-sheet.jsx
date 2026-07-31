import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Animated,
  Easing,
  Keyboard,
  Platform,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import SearchInput from "../ui/search-input";
import UserAvatar from "../ui/user-avatar";
import { fetchCommunityMembers, startConversation } from "../../services/messages-api";
import { resolveMediaUrl } from "../../utils/profile-display";
import { sf } from "../../utils/responsive";

const WINDOW_HEIGHT = Dimensions.get("window").height;
const SHEET_HEIGHT = Math.round(WINDOW_HEIGHT * 0.78);
const OPEN_MS = 280;
const CLOSE_MS = 220;

function MemberRow({ member, loading, onPress }) {
  const roleLabel =
    member.role === "admin"
      ? "Community Admin"
      : member.role === "moderator"
        ? "Moderator"
        : "Community member";
  const subtitle = member.unit ? `Unit ${member.unit} · ${roleLabel}` : roleLabel;

  return (
    <TouchableOpacity
      style={styles.memberRow}
      activeOpacity={0.88}
      onPress={() => onPress(member)}
      disabled={loading}
    >
      <UserAvatar
        name={member.name}
        source={resolveMediaUrl(member.avatar_url)}
        size={46}
      />
      <View style={styles.memberCopy}>
        <Text style={styles.memberName} numberOfLines={1}>
          {member.name}
        </Text>
        <Text style={styles.memberMeta} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {loading ? (
        <ActivityIndicator size="small" color="#007BFF" />
      ) : (
        <View style={styles.messageBtn}>
          <Ionicons name="chatbubble-outline" size={16} color="#007BFF" />
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function NewChatSheet({ visible, onClose, onStarted }) {
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(false);
  const [members, setMembers] = useState([]);
  const [query, setQuery] = useState("");
  const [initialLoading, setInitialLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [startingId, setStartingId] = useState(null);
  const [error, setError] = useState("");
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const androidKeyboardOffset = useRef(new Animated.Value(0)).current;
  const requestIdRef = useRef(0);
  const closingRef = useRef(false);
  const skipSearchEffectRef = useRef(false);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  const loadMembers = useCallback(async (search = "", { soft = false } = {}) => {
    const requestId = ++requestIdRef.current;
    if (soft) setSearching(true);
    else setInitialLoading(true);
    setError("");
    try {
      const data = await fetchCommunityMembers(search);
      if (requestId !== requestIdRef.current) return;
      setMembers(data);
    } catch {
      if (requestId !== requestIdRef.current) return;
      setMembers([]);
      setError("Could not load community members.");
    } finally {
      if (requestId !== requestIdRef.current) return;
      setInitialLoading(false);
      setSearching(false);
    }
  }, []);

  const animateOpen = useCallback(() => {
    closingRef.current = false;
    translateY.setValue(SHEET_HEIGHT);
    backdropOpacity.setValue(0);
    androidKeyboardOffset.setValue(0);
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: OPEN_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        damping: 22,
        stiffness: 240,
        mass: 0.9,
        useNativeDriver: true,
      }),
    ]).start();
  }, [androidKeyboardOffset, backdropOpacity, translateY]);

  const animateClose = useCallback(
    (after) => {
      if (closingRef.current) return;
      closingRef.current = true;
      Keyboard.dismiss();
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: CLOSE_MS,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: SHEET_HEIGHT,
          duration: CLOSE_MS,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(androidKeyboardOffset, {
          toValue: 0,
          duration: CLOSE_MS,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished && !visibleRef.current) {
          setMounted(false);
          after?.();
        }
        closingRef.current = false;
      });
    },
    [androidKeyboardOffset, backdropOpacity, translateY],
  );

  useEffect(() => {
    if (visible) {
      closingRef.current = false;
      translateY.stopAnimation();
      backdropOpacity.stopAnimation();
      androidKeyboardOffset.stopAnimation();
      setMounted(true);
      setQuery("");
      setStartingId(null);
      setError("");
      setKeyboardHeight(0);
      skipSearchEffectRef.current = true;
      requestAnimationFrame(animateOpen);
      loadMembers("", { soft: false });
      return undefined;
    }
    if (mounted && !closingRef.current) {
      animateClose();
    }
    return undefined;
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps -- open/close driven by visible only

  useEffect(() => {
    if (!visible || !mounted) return undefined;
    if (skipSearchEffectRef.current) {
      skipSearchEffectRef.current = false;
      return undefined;
    }
    const timer = setTimeout(() => {
      loadMembers(query, { soft: true });
    }, 250);
    return () => clearTimeout(timer);
  }, [query, visible, mounted, loadMembers]);

  useEffect(() => {
    if (!mounted) return undefined;

    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const onShow = (event) => {
      const height = event.endCoordinates?.height ?? 0;
      setKeyboardHeight(height);
      // Android resize pushes the modal up — nudge the sheet back down so it stays put.
      if (Platform.OS === "android") {
        Animated.timing(androidKeyboardOffset, {
          toValue: height,
          duration: event.duration && event.duration > 0 ? event.duration : 180,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      }
    };

    const onHide = (event) => {
      setKeyboardHeight(0);
      if (Platform.OS === "android") {
        Animated.timing(androidKeyboardOffset, {
          toValue: 0,
          duration: event?.duration && event.duration > 0 ? event.duration : 160,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      }
    };

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [androidKeyboardOffset, mounted]);

  const requestClose = useCallback(() => {
    if (startingId || closingRef.current) return;
    onClose?.();
    animateClose();
  }, [startingId, onClose, animateClose]);

  const handleSelect = async (member) => {
    if (startingId) return;
    setStartingId(member.id);
    setError("");
    try {
      const data = await startConversation(member.id);
      onStarted?.({
        conversationId: data.conversation_id,
        recipientName: member.name,
        recipientRole: member.role === "admin" || member.role === "moderator" ? "admin" : "resident",
      });
      onClose?.();
    } catch (err) {
      setError(err?.message ?? "Could not start chat.");
    } finally {
      setStartingId(null);
    }
  };

  if (!mounted) return null;

  const bottomInset = Math.max(insets.bottom, 12);
  // Shrink only the list on iOS; keep header/search pinned in place.
  const listKeyboardInset = Platform.OS === "ios" ? keyboardHeight : 0;

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={requestClose} statusBarTranslucent>
      <View style={styles.overlay} pointerEvents="box-none">
        <Animated.View pointerEvents="box-none" style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={startingId ? undefined : requestClose} />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            {
              height: SHEET_HEIGHT,
              paddingBottom: bottomInset,
              transform: [{ translateY }, { translateY: androidKeyboardOffset }],
            },
          ]}
        >
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons name="people" size={20} color="#007BFF" />
            </View>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>New message</Text>
              <Text style={styles.subtitle}>Choose a neighbor from your community</Text>
            </View>
            <Pressable
              style={styles.closeBtn}
              onPress={requestClose}
              disabled={Boolean(startingId)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={20} color="#64748B" />
            </Pressable>
          </View>

          <View style={styles.searchWrap}>
            <SearchInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search by name or unit..."
              autoFocus={false}
            />
            {searching ? (
              <View style={styles.searchingOverlay} pointerEvents="none">
                <ActivityIndicator size="small" color="#007BFF" />
              </View>
            ) : null}
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {initialLoading && members.length === 0 ? (
            <ActivityIndicator color="#007BFF" style={styles.loader} />
          ) : (
            <FlatList
              data={members}
              keyExtractor={(item) => String(item.id)}
              style={styles.listFlex}
              renderItem={({ item }) => (
                <MemberRow
                  member={item}
                  loading={startingId === item.id}
                  onPress={handleSelect}
                />
              )}
              contentContainerStyle={styles.list}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Ionicons name="people-outline" size={32} color="#CBD5E1" />
                  <Text style={styles.emptyTitle}>No members found</Text>
                  <Text style={styles.emptyText}>
                    {query.trim()
                      ? "Try a different search term"
                      : "Approved community members will appear here"}
                  </Text>
                </View>
              }
            />
          )}

          {/* iOS: shrink only the list; keep the drawer anchored so it doesn’t jump up. */}
          {listKeyboardInset > 0 ? <View style={{ height: listKeyboardInset }} /> : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
    zIndex: 2,
    elevation: 8,
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#E5E7EB",
    marginTop: 8,
    marginBottom: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: sf(16),
    color: "#0F172A",
    fontWeight: "700",
  },
  subtitle: {
    marginTop: 3,
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: "#64748B",
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 3,
  },
  searchWrap: {
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  searchingOverlay: {
    position: "absolute",
    right: 34,
    top: 12,
  },
  errorText: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: "#DC2626",
  },
  loader: {
    marginTop: 24,
  },
  listFlex: {
    flex: 1,
  },
  list: {
    paddingHorizontal: 12,
    flexGrow: 1,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 14,
    marginBottom: 4,
  },
  memberCopy: {
    flex: 1,
    minWidth: 0,
  },
  memberName: {
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    color: "#0F172A",
    fontWeight: "700",
  },
  memberMeta: {
    marginTop: 1,
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    color: "#64748B",
  },
  messageBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    color: "#0F172A",
    fontWeight: "700",
  },
  emptyText: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: "#64748B",
    textAlign: "center",
    lineHeight: sf(17),
  },
});
