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

function coordFromParam(raw) {
  if (raw == null) return null;
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isFinite(value) ? value : null;
}

function mergePlace(base, lat, lng) {
  if (!base) return base;
  const next = { ...base };
  if (lat != null && lng != null) {
    next.latitude = lat;
    next.longitude = lng;
    if (String(next.id || "").startsWith("essential-")) {
      next.source = "community";
      next.isCommunityEssential = true;
    }
  }
  return next;
}

export default function NearbyPlaceScreen() {
  const { id, place: placeParam, lat: latParam, lng: lngParam } = useLocalSearchParams();
  const routeLat = coordFromParam(latParam);
  const routeLng = coordFromParam(lngParam);

  const place = useMemo(() => {
    const fromParam = parsePlaceParam(placeParam);
    const draft = getNearbyPlaceDraft();
    const wanted = String(id ?? fromParam?.id ?? draft?.id ?? "");
    const paramMatch = fromParam && String(fromParam.id) === wanted ? fromParam : null;
    const draftMatch = draft && String(draft.id) === wanted ? draft : null;
    let merged = null;
    if (paramMatch && draftMatch) {
      merged = {
        ...paramMatch,
        ...draftMatch,
        phone: draftMatch.phone || paramMatch.phone,
        address: draftMatch.address || paramMatch.address,
        website: draftMatch.website || paramMatch.website,
        hours: draftMatch.hours || paramMatch.hours,
        email: draftMatch.email || paramMatch.email,
        latitude: draftMatch.latitude ?? paramMatch.latitude ?? null,
        longitude: draftMatch.longitude ?? paramMatch.longitude ?? null,
        distanceMeters: draftMatch.distanceMeters ?? paramMatch.distanceMeters ?? 0,
        description: draftMatch.description || paramMatch.description,
        source: draftMatch.source || paramMatch.source,
        isCommunityEssential: draftMatch.isCommunityEssential || paramMatch.isCommunityEssential,
      };
    } else {
      merged = paramMatch || draftMatch || fromParam || draft || null;
    }
    return mergePlace(merged, routeLat, routeLng);
  }, [id, placeParam, routeLat, routeLng]);

  return (
    <View style={styles.safe}>
      <NearbyPlaceDetails place={place} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
});
