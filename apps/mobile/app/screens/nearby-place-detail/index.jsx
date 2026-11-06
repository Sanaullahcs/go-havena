import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import NearbyPlaceDetails from "../../../components/ui/nearby-place-details";
import { getNearbyPlaceDraft } from "../../../services/nearby-place-draft";

function parsePlaceParam(raw) {
  if (!raw) return null;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    let text = value;
    try {
      text = decodeURIComponent(value);
    } catch {
      text = value;
    }
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export default function NearbyPlaceScreen() {
  const { id, place: placeParam } = useLocalSearchParams();
  const place = useMemo(() => {
    const fromParam = parsePlaceParam(placeParam);
    const draft = getNearbyPlaceDraft();
    const wanted = String(id ?? fromParam?.id ?? draft?.id ?? "");
    const paramMatch = fromParam && String(fromParam.id) === wanted ? fromParam : null;
    const draftMatch = draft && String(draft.id) === wanted ? draft : null;
    if (paramMatch && draftMatch) {
      return {
        ...paramMatch,
        ...draftMatch,
        phone: draftMatch.phone || paramMatch.phone,
        address: draftMatch.address || paramMatch.address,
        website: draftMatch.website || paramMatch.website,
        hours: draftMatch.hours || paramMatch.hours,
        email: draftMatch.email || paramMatch.email,
      };
    }
    return paramMatch || draftMatch || fromParam || draft || null;
  }, [id, placeParam]);

  return (
    <View style={styles.safe}>
      <NearbyPlaceDetails place={place} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
});
