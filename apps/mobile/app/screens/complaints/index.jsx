import React, { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import { HeaderIconSlot } from "../../../components/layout/header-chrome";
import { COMPLAINT_STATUSES, statusColor } from "../../../components/complaints/complaint-meta";
import { ChoiceChip, EmptyState } from "../../../components/complaints/complaint-ui";
import { Colors, Layout } from "../../../constants/tokens";
import { Fonts } from "../../../constants/font";
import { sw, sf } from "../../../utils/responsive";
import { useSafeModeBack } from "../../../hooks/use-safe-mode-back";
import { useResidentComplaintMode } from "../../../hooks/use-complaint-mode";
import { fetchMyComplaints } from "../../../services/complaints-api";

function formatWhen(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Plain object so the text-metrics patch cannot inject a lineHeight that top-aligns the placeholder. */
const searchFieldText = {
  flex: 1,
  height: sw(46),
  margin: 0,
  paddingTop: 0,
  paddingBottom: 0,
  paddingHorizontal: 0,
  fontFamily: Fonts.medium,
  fontSize: sf(14),
  color: Colors.textPrimary,
  ...(Platform.OS === "android" ? { includeFontPadding: false, textAlignVertical: "center" } : null),
};

export default function MyComplaintsScreen() {
  const router = useRouter();
  const goBack = useSafeModeBack();
  useResidentComplaintMode();
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const hasLoaded = useRef(false);
  const listRef = useRef(null);
  const scrollY = useRef(0);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) {
      setLoading(true);
      setError("");
    }
    try {
      const result = await fetchMyComplaints({ status, search: search.trim() });
      setRows(result.data ?? []);
      setCounts(result.meta?.counts ?? {});
      if (quiet) setError("");
    } catch (err) {
      if (!quiet) setError(err?.message || "Could not load complaints.");
    } finally {
      hasLoaded.current = true;
      setLoading(false);
      setRefreshing(false);
    }
  }, [search, status]);

  useFocusEffect(useCallback(() => {
    const y = scrollY.current;
    if (y > 0) {
      requestAnimationFrame(() => listRef.current?.scrollTo({ y, animated: false }));
    }
    void load(hasLoaded.current);
  }, [load]));

  const openCreate = () => router.push("/screens/complaints/create");

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <InternalScreenHeader
        dense
        title="My Complaints"
        onBack={goBack}
        right={(
          <Pressable accessibilityLabel="New complaint" onPress={openCreate} hitSlop={8}>
            <HeaderIconSlot>
              <Feather name="plus" size={sf(18)} color="#1B4F8A" />
            </HeaderIconSlot>
          </Pressable>
        )}
      />
      <View style={styles.searchWrap}>
        <View style={styles.searchIcon}>
          <Feather name="search" size={sf(15)} color="#1B4F8A" />
        </View>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search complaint"
          placeholderTextColor="#94A3B8"
          style={searchFieldText}
          returnKeyType="search"
          scrollEnabled={false}
          textAlignVertical="center"
        />
        {search ? (
          <Pressable accessibilityLabel="Clear search" onPress={() => setSearch("")} hitSlop={8} style={styles.clearBtn}>
            <Feather name="x" size={sf(14)} color="#64748B" />
          </Pressable>
        ) : null}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filters}
      >
        {COMPLAINT_STATUSES.map((item) => {
          const count = item.id === "all" ? counts.all : counts[item.id];
          return (
            <ChoiceChip
              key={item.id}
              label={item.label}
              count={count ?? 0}
              active={status === item.id}
              onPress={() => setStatus(item.id)}
            />
          );
        })}
      </ScrollView>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={Colors.brandPrimary} /></View>
      ) : error ? (
        <EmptyState
          icon="alert-circle"
          title="Could not load complaints"
          body={error}
          actionLabel="Try again"
          actionIcon="refresh-cw"
          onAction={() => void load()}
        />
      ) : (
        <ScrollView
          ref={listRef}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          onScroll={(event) => { scrollY.current = event.nativeEvent.contentOffset.y; }}
          scrollEventThrottle={32}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(true); }} tintColor={Colors.brandPrimary} />}
        >
          {rows.length === 0 ? (
            <EmptyState
              icon="inbox"
              title={search || status !== "all" ? "No matching complaints" : "No complaints yet"}
              body={search || status !== "all" ? "Try another search or status." : "Submit a maintenance request or a technical support ticket."}
              actionLabel="New Complaint"
              onAction={openCreate}
            />
          ) : rows.map((row) => (
            <Pressable
              key={row.id}
              style={styles.card}
              onPress={() => router.push({ pathname: "/screens/complaints/detail", params: { id: String(row.id) } })}
            >
              <View style={[styles.rail, { backgroundColor: statusColor(row.status) }]} />
              <View style={styles.cardBody}>
                <View style={styles.cardTop}>
                  <Text style={styles.ref}>{row.reference}</Text>
                  <View style={[styles.badge, { backgroundColor: `${statusColor(row.status)}16` }]}>
                    <Text style={[styles.badgeText, { color: statusColor(row.status) }]}>{row.status_label}</Text>
                  </View>
                </View>
                <Text style={styles.title} numberOfLines={2}>{row.title}</Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {row.category_label}{row.unit_number ? ` · Unit ${row.unit_number}` : ""} · {row.support_team}
                </Text>
                <View style={styles.cardFoot}>
                  <Text style={styles.date}>{formatWhen(row.created_at) || " "}</Text>
                  <Feather name="chevron-right" size={sf(16)} color="#94A3B8" />
                </View>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.surfaceMuted },
  searchWrap: {
    marginHorizontal: sw(18),
    marginTop: sw(14),
    height: sw(48),
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    backgroundColor: Colors.surface,
    borderRadius: sw(14),
    borderWidth: 1,
    borderColor: "#E6EDF5",
    paddingHorizontal: sw(10),
  },
  searchIcon: {
    width: sw(30),
    height: sw(30),
    borderRadius: sw(10),
    backgroundColor: "#E8F0F7",
    alignItems: "center",
    justifyContent: "center",
  },
  clearBtn: {
    width: sw(28),
    height: sw(28),
    borderRadius: sw(14),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
  },
  filterScroll: { flexGrow: 0, flexShrink: 0, marginTop: sw(10) },
  filters: {
    alignItems: "center",
    paddingHorizontal: sw(18),
    paddingBottom: sw(4),
    gap: sw(8),
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { flex: 1 },
  listContent: { flexGrow: 1, paddingHorizontal: sw(18), paddingTop: sw(12), paddingBottom: sw(28), gap: sw(12) },
  card: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    borderRadius: sw(16),
    borderWidth: 1,
    borderColor: "#E8EEF5",
    overflow: "hidden",
  },
  rail: { width: sw(4) },
  cardBody: { flex: 1, paddingHorizontal: sw(14), paddingVertical: sw(13) },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: sw(8) },
  ref: { flex: 1, fontFamily: Fonts.medium, fontSize: sf(12), letterSpacing: 0.2, color: "#64748B" },
  badge: { borderRadius: 999, paddingHorizontal: sw(8), paddingVertical: sw(3) },
  badgeText: { fontFamily: Fonts.semiBold, fontSize: sf(11), lineHeight: sf(14) },
  title: { marginTop: sw(6), fontFamily: Fonts.semiBold, fontSize: sf(16), lineHeight: sf(21), color: "#0F2744" },
  meta: { marginTop: sw(4), fontFamily: Fonts.regular, fontSize: sf(12), lineHeight: sf(16), color: "#5B6B7C" },
  cardFoot: { marginTop: sw(10), flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  date: { fontFamily: Fonts.medium, fontSize: sf(11), color: "#94A3B8" },
});
