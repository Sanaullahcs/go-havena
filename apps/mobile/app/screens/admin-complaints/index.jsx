import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { useTranslation } from "react-i18next";
import { Feather } from "@expo/vector-icons";
import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import { HeaderIconSlot } from "../../../components/layout/header-chrome";
import { COMPLAINT_STATUSES, MAINTENANCE_CATEGORIES, PRIORITIES, statusColor } from "../../../components/complaints/complaint-meta";
import { ChoiceChip, EmptyState, NAVY } from "../../../components/complaints/complaint-ui";
import { Colors } from "../../../constants/tokens";
import { Fonts } from "../../../constants/font";
import { sw, sf } from "../../../utils/responsive";
import { useSafeModeBack } from "../../../hooks/use-safe-mode-back";
import { useAdminComplaintMode } from "../../../hooks/use-complaint-mode";
import { fetchAdminComplaints, fetchMyComplaints } from "../../../services/complaints-api";

function formatWhen(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function pretty(value) {
  return String(value || "").replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function countOf(counts, key) {
  return Number(counts?.[key] ?? 0);
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

export default function AdminComplaintsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const goBack = useSafeModeBack();
  useAdminComplaintMode();
  const [tab, setTab] = useState("community");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [priority, setPriority] = useState("all");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({});
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [menu, setMenu] = useState(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) {
      setLoading(true);
      setError("");
    }
    try {
      if (tab === "reports") {
        const result = await fetchMyComplaints({ search: search.trim(), per_page: 50 });
        setReports((result.data ?? []).filter((row) => row.type === "technical"));
      } else {
        const result = await fetchAdminComplaints({
          status,
          category,
          priority,
          search: search.trim(),
        });
        setRows(result.data ?? []);
        setCounts(result.meta?.counts ?? {});
      }
      if (quiet) setError("");
    } catch (err) {
      if (!quiet) setError(err?.message || "Could not load complaints.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [category, priority, search, status, tab]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const openCount = ["submitted", "in_review", "in_progress", "waiting_on_resident", "reopened"]
    .reduce((sum, key) => sum + countOf(counts, key), 0);
  const openReport = () => router.push("/screens/admin-complaints/report");
  const categoryLabel = category === "all"
    ? "All"
    : (MAINTENANCE_CATEGORIES.find(([key]) => key === category)?.[1] || "All");
  const priorityLabel = priority === "all"
    ? "All"
    : (PRIORITIES.find(([key]) => key === priority)?.[1] || "All");
  const categoryOptions = [{ id: "all", label: "All categories" }, ...MAINTENANCE_CATEGORIES.map(([id, label, description]) => ({ id, label, description }))];
  const priorityOptions = [{ id: "all", label: "All priorities" }, ...PRIORITIES.map(([id, label]) => ({ id, label }))];

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <InternalScreenHeader
        dense
        title={t("nav.complaints")}
        subtitle="Community maintenance"
        onBack={goBack}
        right={(
          <Pressable accessibilityLabel="Report a technical issue" onPress={openReport} hitSlop={8}>
            <HeaderIconSlot>
              <Feather name="plus" size={sf(18)} color={NAVY} />
            </HeaderIconSlot>
          </Pressable>
        )}
      />
      <View style={styles.segment}>
        <Pressable onPress={() => { setTab("community"); setSearch(""); setMenu(null); }} style={[styles.segmentItem, tab === "community" && styles.segmentOn]}>
          <Text style={[styles.segmentText, tab === "community" && styles.segmentTextOn]}>Community</Text>
        </Pressable>
        <Pressable onPress={() => { setTab("reports"); setSearch(""); setMenu(null); }} style={[styles.segmentItem, tab === "reports" && styles.segmentOn]}>
          <Text style={[styles.segmentText, tab === "reports" && styles.segmentTextOn]}>My reports</Text>
        </Pressable>
      </View>

      {tab === "community" ? (
        <View style={styles.stats}>
          <Stat label="Total" value={countOf(counts, "all")} color={NAVY} />
          <Stat label="Open" value={openCount} color="#D97706" />
          <Stat label="Waiting" value={countOf(counts, "waiting_on_resident")} color="#7C3AED" />
          <Stat label="Resolved" value={countOf(counts, "resolved")} color="#059669" />
        </View>
      ) : (
        <Text style={styles.lead}>Technical issues you send to System Admin. Personal maintenance stays in Resident Mode.</Text>
      )}

      <View style={styles.searchWrap}>
        <View style={styles.searchIcon}>
          <Feather name="search" size={sf(15)} color={NAVY} />
        </View>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={tab === "community" ? "Search resident, unit, or ticket" : "Search your reports"}
          placeholderTextColor="#94A3B8"
          style={searchFieldText}
          returnKeyType="search"
          scrollEnabled={false}
          textAlignVertical="center"
        />
      </View>

      {tab === "community" ? (
        <View style={styles.filterHost}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterScroll}
            contentContainerStyle={styles.statusRow}
          >
            {COMPLAINT_STATUSES.map((item) => (
              <ChoiceChip
                key={item.id}
                label={t(`complaints.status.${item.id}`, { defaultValue: item.label })}
                count={item.id === "all" ? countOf(counts, "all") : countOf(counts, item.id)}
                active={status === item.id}
                onPress={() => {
                  setMenu(null);
                  setStatus(item.id);
                }}
              />
            ))}
          </ScrollView>
          <View style={styles.dropdownRow}>
            <InlineSelect
              label="Category"
              value={categoryLabel}
              active={category !== "all"}
              open={menu === "category"}
              options={categoryOptions}
              searchable
              selected={category}
              onToggle={() => setMenu(menu === "category" ? null : "category")}
              onSelect={(id) => {
                setCategory(id);
                setMenu(null);
              }}
            />
            <InlineSelect
              label="Priority"
              value={priorityLabel}
              active={priority !== "all"}
              open={menu === "priority"}
              options={priorityOptions}
              selected={priority}
              onToggle={() => setMenu(menu === "priority" ? null : "priority")}
              onSelect={(id) => {
                setPriority(id);
                setMenu(null);
              }}
            />
          </View>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={Colors.brandPrimary} /></View>
      ) : error ? (
        <EmptyState icon="alert-circle" title="Could not load complaints" body={error} actionLabel="Try again" actionIcon="refresh-cw" onAction={() => void load()} />
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          onTouchStart={() => { if (menu) setMenu(null); }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(true); }} tintColor={Colors.brandPrimary} />}
        >
          {tab === "community" ? (
            rows.length === 0 ? (
              <EmptyState
                icon="life-buoy"
                title="No community complaints"
                body="Maintenance requests from residents will appear here."
              />
            ) : rows.map((row) => (
              <ComplaintCard
                key={row.id}
                row={row}
                who={`${row.reporter_name || "Resident"}${row.unit_number ? ` · Unit ${row.unit_number}` : ""}`}
                detail={`${row.category_label} · ${pretty(row.priority)}`}
                foot={`${row.assigned_staff_label || row.assigned_to_name || "Not assigned"}${(row.unread_count ?? 0) > 0 ? ` · ${row.unread_count} new` : ""}`}
                when={formatWhen(row.updated_at || row.created_at)}
                onPress={() => router.push({ pathname: "/screens/admin-complaints/detail", params: { id: String(row.id) } })}
              />
            ))
          ) : reports.length === 0 ? (
            <EmptyState
              icon="smartphone"
              title="No technical reports"
              body="Report an app, account, login, or payment issue to System Admin."
              actionLabel="Report an issue"
              actionIcon="plus"
              onAction={openReport}
            />
          ) : reports.map((row) => (
            <ComplaintCard
              key={row.id}
              row={row}
              who="System Admin"
              detail={`${row.category_label} · ${pretty(row.priority)}`}
              foot="Technical report"
              when={formatWhen(row.updated_at || row.created_at)}
              onPress={() => router.push({ pathname: "/screens/admin-complaints/report-detail", params: { id: String(row.id) } })}
            />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Stat({ label, value, color }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function InlineSelect({ label, value, active, open, options, selected, searchable = false, onToggle, onSelect }) {
  const [query, setQuery] = useState("");
  const canSearch = searchable || options.length > 7;
  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!canSearch || !text) return options;
    const pinned = options.filter((option) => option.id === "all");
    const matched = options.filter((option) => option.id !== "all" && `${option.label} ${option.description || ""}`.toLowerCase().includes(text));
    return [...pinned, ...matched];
  }, [canSearch, options, query]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  return (
    <View style={[styles.dropdownCol, open && styles.dropdownColOpen]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} filter, ${value}`}
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        style={[styles.select, (active || open) && styles.selectOn]}
      >
        <Text style={styles.selectLabel}>{label}</Text>
        <View style={styles.selectRow}>
          <Text style={[styles.selectValue, (active || open) && styles.selectValueOn]} numberOfLines={1}>{value}</Text>
          <Feather name={open ? "chevron-up" : "chevron-down"} size={sf(14)} color={active || open ? NAVY : "#64748B"} />
        </View>
      </Pressable>
      {open ? (
        <View style={styles.menu}>
          {canSearch ? (
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search categories"
              placeholderTextColor="#94A3B8"
              autoCorrect={false}
              style={styles.menuSearch}
            />
          ) : null}
          <ScrollView style={canSearch ? styles.menuScroll : null} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
            {visible.map((option, index) => {
              const on = option.id === selected;
              return (
                <Pressable key={option.id} onPress={() => onSelect(option.id)} style={[styles.option, index === 0 && styles.optionFirst]}>
                  <View style={styles.optionCopy}>
                    <Text style={[styles.optionText, on && styles.optionTextOn]} numberOfLines={1}>{option.label}</Text>
                    {option.description ? <Text style={styles.optionHint} numberOfLines={2}>{option.description}</Text> : null}
                  </View>
                  {on ? <Feather name="check" size={sf(14)} color={NAVY} /> : null}
                </Pressable>
              );
            })}
            {visible.length === 0 ? <Text style={styles.menuEmpty}>No matching categories</Text> : null}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

function ComplaintCard({ row, who, detail, foot, when, onPress }) {
  const color = statusColor(row.workflow_status || row.status);
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={[styles.rail, { backgroundColor: color }]} />
      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <Text style={styles.ref}>{row.reference}</Text>
          <View style={[styles.badge, { backgroundColor: `${color}16` }]}>
            <Text style={[styles.badgeText, { color }]}>{row.status_label}</Text>
          </View>
        </View>
        <Text style={styles.title} numberOfLines={2}>{row.title}</Text>
        <Text style={styles.who} numberOfLines={1}>{who}</Text>
        <Text style={styles.detail} numberOfLines={1}>{detail}</Text>
        <View style={styles.cardFoot}>
          <View style={styles.assign}>
            <Feather name="user" size={sf(12)} color="#94A3B8" />
            <Text style={styles.date} numberOfLines={1}>{foot}</Text>
          </View>
          <Text style={styles.when}>{when}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.surfaceMuted },
  segment: {
    flexDirection: "row",
    marginHorizontal: sw(18),
    marginTop: sw(12),
    padding: sw(4),
    borderRadius: sw(14),
    backgroundColor: "#F1F5F9",
  },
  segmentItem: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: sw(8), borderRadius: sw(11) },
  segmentOn: { backgroundColor: NAVY },
  segmentText: { fontFamily: Fonts.medium, fontSize: sf(13), color: "#64748B" },
  segmentTextOn: { color: "#FFFFFF", fontFamily: Fonts.bold },
  stats: { flexDirection: "row", gap: sw(8), paddingHorizontal: sw(18), marginTop: sw(14) },
  stat: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: sw(14),
    borderWidth: 1,
    borderColor: "#E8EEF5",
    paddingVertical: sw(12),
    paddingHorizontal: sw(8),
  },
  statValue: { fontFamily: Fonts.semiBold, fontSize: sf(18), lineHeight: sf(22) },
  statLabel: { marginTop: sw(4), fontFamily: Fonts.medium, fontSize: sf(11), lineHeight: sf(14), color: "#64748B" },
  lead: {
    marginHorizontal: sw(18),
    marginTop: sw(12),
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(18),
    color: "#5B6B7C",
  },
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
  filterHost: { zIndex: 20, elevation: 6, marginTop: sw(12) },
  filterScroll: { flexGrow: 0, flexShrink: 0 },
  statusRow: { alignItems: "center", paddingHorizontal: sw(18), gap: sw(8) },
  dropdownRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(8),
    paddingHorizontal: sw(18),
    marginTop: sw(10),
  },
  dropdownCol: { flex: 1, position: "relative" },
  dropdownColOpen: { zIndex: 30 },
  select: {
    minHeight: sw(48),
    justifyContent: "center",
    paddingHorizontal: sw(12),
    paddingVertical: sw(7),
    borderRadius: sw(14),
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: "#E6EDF5",
  },
  selectOn: { borderColor: "#C5D4E8", backgroundColor: "#F4F8FC" },
  selectLabel: { fontFamily: Fonts.medium, fontSize: sf(10), lineHeight: sf(13), color: "#94A3B8" },
  selectRow: { marginTop: sw(2), flexDirection: "row", alignItems: "center", gap: sw(4) },
  selectValue: { flex: 1, fontFamily: Fonts.medium, fontSize: sf(13), lineHeight: sf(16), color: "#334155" },
  selectValueOn: { color: NAVY },
  menu: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    marginTop: sw(6),
    borderRadius: sw(12),
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: "#E6EDF5",
    overflow: "hidden",
    zIndex: 40,
    elevation: 8,
  },
  menuSearch: {
    height: sw(36),
    margin: sw(8),
    marginBottom: 0,
    borderWidth: 1,
    borderColor: "#E6EDF5",
    borderRadius: sw(10),
    backgroundColor: "#F8FAFC",
    paddingHorizontal: sw(10),
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: Colors.textPrimary,
  },
  menuScroll: { maxHeight: sw(240) },
  option: {
    minHeight: sw(38),
    paddingHorizontal: sw(12),
    paddingVertical: sw(8),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: sw(8),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#EEF2F6",
  },
  optionFirst: { borderTopWidth: 0 },
  optionCopy: { flex: 1, gap: sw(2) },
  optionText: { fontFamily: Fonts.medium, fontSize: sf(13), color: "#163A66" },
  optionTextOn: { color: NAVY },
  optionHint: { fontFamily: Fonts.medium, fontSize: sf(11), lineHeight: sf(14), color: "#64748B" },
  menuEmpty: { paddingHorizontal: sw(12), paddingVertical: sw(10), fontFamily: Fonts.medium, fontSize: sf(12), color: "#94A3B8" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { flex: 1 },
  listContent: { flexGrow: 1, paddingHorizontal: sw(18), paddingTop: sw(14), paddingBottom: sw(32), gap: sw(12) },
  card: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    borderRadius: sw(18),
    borderWidth: 1,
    borderColor: "#E8EEF5",
    overflow: "hidden",
  },
  rail: { width: sw(4) },
  cardBody: { flex: 1, paddingHorizontal: sw(14), paddingTop: sw(14), paddingBottom: sw(12) },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: sw(8) },
  ref: { flex: 1, fontFamily: Fonts.medium, fontSize: sf(12), letterSpacing: 0.2, color: "#64748B" },
  badge: { borderRadius: 999, paddingHorizontal: sw(8), paddingVertical: sw(4) },
  badgeText: { fontFamily: Fonts.semiBold, fontSize: sf(11), lineHeight: sf(14) },
  title: { marginTop: sw(8), fontFamily: Fonts.semiBold, fontSize: sf(16), lineHeight: sf(22), color: "#0F2744" },
  who: { marginTop: sw(6), fontFamily: Fonts.medium, fontSize: sf(13), lineHeight: sf(18), color: "#334155" },
  detail: { marginTop: sw(2), fontFamily: Fonts.regular, fontSize: sf(12), lineHeight: sf(16), color: "#64748B" },
  cardFoot: {
    marginTop: sw(12),
    paddingTop: sw(10),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#EEF2F6",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: sw(8),
  },
  assign: { flex: 1, flexDirection: "row", alignItems: "center", gap: sw(6) },
  date: { flex: 1, fontFamily: Fonts.medium, fontSize: sf(12), color: "#64748B" },
  when: { fontFamily: Fonts.medium, fontSize: sf(11), color: "#94A3B8" },
});
