import React, { useCallback, useState } from "react";
import { View, StyleSheet, ActivityIndicator, ScrollView, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";
import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import FamilyTreeView from "../../../components/family/family-tree-view";
import { FamilySuspendedState, FamilyBlockedState } from "../../../components/family/family-empty-states";
import { propertyStyles } from "../../../constants/property-styles";
import { fetchMyFamily } from "../../../services/family-api";
import { useApiAction } from "../../../hooks/use-api-action";
import { sw } from "../../../utils/responsive";

export default function FamilyTreeScreen() {
  const { t } = useTranslation();
  const { showFailure } = useApiAction();
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchMyFamily();
      setPayload(data);
    } catch (err) {
      await showFailure(t("family.couldNotLoadFamilyTree"), err);
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
        <InternalScreenHeader title={t("family.familyTree")} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#0A2A43" />
        </View>
      </SafeAreaView>
    );
  }

  if (state === "suspended") {
    return (
      <SafeAreaView style={propertyStyles.screenMuted} edges={["left", "right"]}>
        <InternalScreenHeader title={t("family.familyTree")} />
        <FamilySuspendedState familyName={family?.family_number} t={t} />
      </SafeAreaView>
    );
  }

  if (state === "blocked") {
    return (
      <SafeAreaView style={propertyStyles.screenMuted} edges={["left", "right"]}>
        <InternalScreenHeader title={t("family.familyTree")} />
        <FamilyBlockedState
          familyNumber={family?.family_number}
          communityName={family?.community_name}
          t={t}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={propertyStyles.screenMuted} edges={["left", "right"]}>
      <InternalScreenHeader
        title={t("family.familyTree")}
        subtitle={
          family?.name ||
          (family?.community_name
            ? family.community_name
            : family?.family_number
              ? t("family.household", { number: family.family_number })
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
            tintColor="#0A2A43"
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <FamilyTreeView members={family?.members ?? []} family={family} t={t} />
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
