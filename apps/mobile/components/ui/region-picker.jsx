import React, { useMemo, useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";

export default function RegionPicker({
  visible,
  regions = [],
  selectedId,
  loading = false,
  onSelect,
  onClose,
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return regions;
    return regions.filter((region) => {
      const haystack = [region.title, region.area, region.state]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [query, regions]);

  const handleClose = () => {
    setQuery("");
    onClose?.();
  };

  const handleSelect = (region) => {
    setQuery("");
    onSelect?.(region);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <Pressable style={styles.overlay} onPress={handleClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.title}>{t("region.selectRegion")}</Text>
          <Text style={styles.subtitle}>
            {t("region.chooseAreaSubtitle")}
          </Text>

          <View style={styles.searchRow}>
            <Ionicons name="search" size={18} color="#9CA3AF" />
            <TextInput
              style={styles.searchInput}
              placeholder={t("region.searchRegions")}
              placeholderTextColor="#9CA3AF"
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {query.length > 0 ? (
              <Pressable onPress={() => setQuery("")} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color="#9CA3AF" />
              </Pressable>
            ) : null}
          </View>

          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" color="#14B8A6" />
              <Text style={styles.loadingText}>{t("region.loadingRegions")}</Text>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => String(item.id)}
              keyboardShouldPersistTaps="handled"
              style={styles.list}
              ListEmptyComponent={
                <View style={styles.emptyWrap}>
                  <Ionicons name="map-outline" size={28} color="#C6CBD3" />
                  <Text style={styles.emptyText}>{t("region.noRegionsMatch")}</Text>
                </View>
              }
              renderItem={({ item }) => {
                const selected = item.id === selectedId;
                const location = [item.area, item.state].filter(Boolean).join(" · ");
                return (
                  <Pressable
                    style={[styles.row, selected && styles.rowSelected]}
                    onPress={() => handleSelect(item)}
                  >
                    <View style={styles.rowIcon}>
                      <Ionicons name="location-outline" size={18} color={selected ? "#14B8A6" : "#667085"} />
                    </View>
                    <View style={styles.rowText}>
                      <Text style={[styles.regionName, selected && styles.regionNameSelected]}>
                        {item.title}
                      </Text>
                      {location ? (
                        <Text style={styles.regionMeta}>{location}</Text>
                      ) : null}
                    </View>
                    {selected ? (
                      <Ionicons name="checkmark-circle" size={22} color="#14B8A6" />
                    ) : (
                      <Ionicons name="chevron-forward" size={18} color="#C6CBD3" />
                    )}
                  </Pressable>
                );
              }}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "82%",
    backgroundColor: "#FFFFFF",
    borderTopStartRadius: 24,
    borderTopEndRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 24,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#E5E7EB",
    marginBottom: 16,
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: 18,
    color: "#101828",
    fontWeight: "700",
  },
  subtitle: {
    marginTop: 4,
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: "#667085",
    lineHeight: 18,
  },
  searchRow: {
    marginTop: 16,
    marginBottom: 8,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#EEF1F5",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: 14,
    color: "#101828",
  },
  list: {
    marginTop: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  rowSelected: {
    backgroundColor: "#F8FAFF",
    borderRadius: 12,
    borderBottomColor: "transparent",
    paddingHorizontal: 8,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: {
    flex: 1,
  },
  regionName: {
    fontFamily: Fonts.semiBold,
    fontSize: 15,
    color: "#101828",
  },
  regionNameSelected: {
    color: "#14B8A6",
  },
  regionMeta: {
    marginTop: 2,
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: "#667085",
  },
  loadingWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 10,
  },
  loadingText: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: "#667085",
  },
  emptyWrap: {
    alignItems: "center",
    paddingVertical: 36,
    gap: 8,
  },
  emptyText: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: "#667085",
  },
});
