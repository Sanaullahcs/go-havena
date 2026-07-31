import React, { useCallback, useState } from "react";
import { View, StyleSheet, ActivityIndicator, ScrollView, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import FamilyTreeView from "../../../components/family/family-tree-view";
import { FamilySuspendedState, FamilyBlockedState } from "../../../components/family/family-empty-states";
import { propertyStyles } from "../../../constants/property-styles";
import { fetchMyFamily } from "../../../services/family-api";
import { useApiAction } from "../../../hooks/use-api-action";
import { sw } from "../../../utils/responsive";

export default function FamilyTreeScreen() {
  const { showFailure } = useApiAction();
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchMyFamily();
      setPayload(data);
    } catch (err) {
      await showFailure("Could not load family tree", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showFailure]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const state = payload?.state;
  const family = payload?.family;

  if (loading) {
    return (
      <SafeAreaView style={propertyStyles.screenMuted} edges={["left", "right"]}>
        <InternalScreenHeader title="Family Tree" />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#0052DF" />
        </View>
      </SafeAreaView>
    );
  }

  if (state === "suspended") {
    return (
      <SafeAreaView style={propertyStyles.screenMuted} edges={["left", "right"]}>
        <InternalScreenHeader title="Family Tree" />
        <FamilySuspendedState familyName={family?.family_number} />
      </SafeAreaView>
    );
  }

  if (state === "blocked") {
    return (
      <SafeAreaView style={propertyStyles.screenMuted} edges={["left", "right"]}>
        <InternalScreenHeader title="Family Tree" />
        <FamilyBlockedState
          familyNumber={family?.family_number}
          communityName={family?.community_name}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={propertyStyles.screenMuted} edges={["left", "right"]}>
      <InternalScreenHeader
        title="Family Tree"
        subtitle={
          family?.name ||
          (family?.community_name
            ? family.community_name
            : family?.family_number
              ? `Household ${family.family_number}`
              : undefined)
        }
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor="#0052DF"
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <FamilyTreeView members={family?.members ?? []} family={family} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: {
    paddingTop: sw(12),
    paddingBottom: sw(32),
    flexGrow: 1,
  },
});
