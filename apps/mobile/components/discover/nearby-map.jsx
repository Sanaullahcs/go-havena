import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { sw } from "../../utils/responsive";

function mapDocument(latitude, longitude, places) {
  const markers = (places || [])
    .filter((place) => Number.isFinite(place.latitude) && Number.isFinite(place.longitude))
    .slice(0, 12)
    .map((place) => ({
      lat: place.latitude,
      lng: place.longitude,
      name: place.name,
    }));
  const payload = JSON.stringify({
    lat: Number(latitude),
    lng: Number(longitude),
    markers,
  });

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  html, body, #map { margin: 0; height: 100%; background: #E7EEF2; }
  .leaflet-control-attribution { font-size: 9px; background: rgba(255,255,255,.75); }
  .pin { width: 16px; height: 16px; border-radius: 50% 50% 50% 0; background: #0F766E; border: 2px solid #fff; transform: rotate(-45deg); box-shadow: 0 1px 4px rgba(15,23,42,.28); }
  .pin.home { width: 18px; height: 18px; background: #14B8A6; }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  const data = ${payload};
  const map = L.map('map', { zoomControl: false, attributionControl: true }).setView([data.lat, data.lng], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
    maxZoom: 19,
    subdomains: 'abc',
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);
  const pin = (home) => L.divIcon({
    className: '',
    html: '<div class="pin' + (home ? ' home' : '') + '"></div>',
    iconSize: home ? [18, 18] : [16, 16],
    iconAnchor: home ? [9, 16] : [8, 14],
  });
  L.marker([data.lat, data.lng], { icon: pin(true) }).addTo(map);
  data.markers.forEach((marker) => {
    L.marker([marker.lat, marker.lng], { icon: pin(false) }).addTo(map).bindTooltip(marker.name, { direction: 'top' });
  });
</script>
</body>
</html>`;
}

export default function NearbyMap({ latitude, longitude, places, height }) {
  const html = useMemo(
    () => mapDocument(latitude, longitude, places),
    [latitude, longitude, places],
  );

  if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) {
    return null;
  }

  return (
    <View style={[styles.frame, height ? { height } : null]}>
      <WebView
        originWhitelist={["*"]}
        source={{ html }}
        style={styles.web}
        scrollEnabled={false}
        setSupportMultipleWindows={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    height: sw(196),
    borderRadius: sw(18),
    overflow: "hidden",
    backgroundColor: "#E7EEF2",
  },
  web: { flex: 1, backgroundColor: "transparent" },
});
