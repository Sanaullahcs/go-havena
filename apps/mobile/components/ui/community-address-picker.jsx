import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { useTranslation } from "react-i18next";
import { MapPin } from "lucide-react-native";
import LocaleTextInput from "./locale-text-input";
import { reverseAddress, suggestAddress } from "../../services/geo-api";
import { Fonts } from "../../constants/font";
import { HomeTheme as T } from "../../constants/home-theme";
import { LIMITS } from "../../utils/form-validation";
import { rnShadow } from "../../utils/shadow";

const FIELD_BOX_HEIGHT = 52;
const FIELD_FONT_SIZE = 14;
const MAP_HEIGHT = 280;

const fieldTextStyle = {
  fontFamily: Fonts.regular,
  fontSize: FIELD_FONT_SIZE,
  color: T.navy,
  width: "100%",
  margin: 0,
  paddingHorizontal: 0,
  paddingTop: 0,
  paddingBottom: 0,
  textAlignVertical: "center",
  includeFontPadding: false,
};

function mapHtml(latitude, longitude) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { height: 100%; width: 100%; margin: 0; padding: 0; background: #dce7f2; }
    .leaflet-control-attribution { display: none; }
    .leaflet-container img.leaflet-tile { max-width: none !important; max-height: none !important; }
    .leaflet-tile-pane { filter: saturate(1.18) contrast(1.04) brightness(1.02); }
    .leaflet-control-zoom { border: 0 !important; border-radius: 12px !important; overflow: hidden; box-shadow: 0 8px 20px rgba(11,31,58,0.12) !important; }
    .havena-map-pin { background: transparent !important; border: 0 !important; }
    .havena-map-pin__stack { position: relative; width: 36px; height: 44px; }
    .havena-map-pin__pulse { position: absolute; left: 50%; bottom: 4px; width: 18px; height: 18px; margin-left: -9px; border-radius: 999px; background: rgba(20,184,166,0.28); animation: havena-pin-pulse 1.8s ease-out infinite; }
    .havena-map-pin__marker { position: absolute; inset: 0; filter: drop-shadow(0 6px 8px rgba(11,31,58,0.28)); }
    @keyframes havena-pin-pulse { 0% { transform: scale(0.7); opacity: 0.7; } 70% { transform: scale(2.4); opacity: 0; } 100% { transform: scale(2.4); opacity: 0; } }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const start = [${Number(latitude)}, ${Number(longitude)}];
    const map = L.map('map', { zoomControl: true, attributionControl: false }).setView(start, 16);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(map);
    const icon = L.divIcon({
      className: 'havena-map-pin',
      html: '<div class="havena-map-pin__stack"><span class="havena-map-pin__pulse"></span><span class="havena-map-pin__marker"><svg viewBox="0 0 32 40" width="32" height="40"><path fill="#1B4F8A" d="M16 1.5C8.8 1.5 3 7.3 3 14.6c0 9.6 13 23.9 13 23.9s13-14.3 13-23.9C29 7.3 23.2 1.5 16 1.5z"/><circle cx="16" cy="14.5" r="5.2" fill="#14b8a6"/></svg></span></div>',
      iconSize: [36, 44],
      iconAnchor: [18, 42]
    });
    const circle = L.circle(start, {
      radius: 90,
      color: '#14b8a6',
      weight: 1.5,
      opacity: 0.7,
      fillColor: '#14b8a6',
      fillOpacity: 0.1
    }).addTo(map);
    const marker = L.marker(start, { draggable: true, icon: icon, autoPan: true }).addTo(map);
    function send(lat, lng) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ latitude: lat, longitude: lng }));
      }
    }
    marker.on('drag', function () { circle.setLatLng(marker.getLatLng()); });
    marker.on('dragend', function () {
      const pos = marker.getLatLng();
      circle.setLatLng(pos);
      send(pos.lat, pos.lng);
    });
    map.on('click', function (event) {
      marker.setLatLng(event.latlng);
      circle.setLatLng(event.latlng);
      send(event.latlng.lat, event.latlng.lng);
    });
    window.setPin = function (lat, lng) {
      marker.setLatLng([lat, lng]);
      circle.setLatLng([lat, lng]);
      map.setView([lat, lng], map.getZoom());
      map.invalidateSize();
    };
    function refresh() { map.invalidateSize({ animate: false }); }
    map.whenReady(refresh);
    [0, 80, 200, 400, 800].forEach(function (ms) { setTimeout(refresh, ms); });
    window.addEventListener('resize', refresh);
  </script>
</body>
</html>`;
}

export default function CommunityAddressPicker({
  value,
  onChange,
  onBlur,
  error,
  placeholder,
}) {
  const { t } = useTranslation();
  const webRef = useRef(null);
  const skipSuggest = useRef(true);
  const typingRef = useRef(false);
  const reverseTimer = useRef(null);
  const reverseSeq = useRef(0);
  const valueRef = useRef(value);
  const queryRef = useRef(value?.address ?? "");
  valueRef.current = value;
  const [query, setQuery] = useState(value?.address ?? "");
  queryRef.current = query;
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resolvingAddress, setResolvingAddress] = useState(false);
  const [suggestions, setSuggestions] = useState([]);

  const latitude = value?.latitude ?? null;
  const longitude = value?.longitude ?? null;
  const hasPin = latitude != null && longitude != null;
  const html = useMemo(
    () => (hasPin ? mapHtml(latitude, longitude) : ""),
    // Recreate only when the map first appears so later pin moves use injectJavaScript.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasPin],
  );

  useEffect(() => {
    const next = value?.address ?? "";
    if (next === queryRef.current) return;
    skipSuggest.current = true;
    typingRef.current = false;
    setQuery(next);
    setOpen(false);
    setSuggestions([]);
  }, [value?.address]);

  useEffect(() => {
    if (skipSuggest.current || !typingRef.current) {
      skipSuggest.current = false;
      return undefined;
    }

    const term = query.trim();
    if (term.length < 3) {
      setSuggestions([]);
      setOpen(false);
      return undefined;
    }

    const handle = setTimeout(() => {
      setLoading(true);
      suggestAddress(term)
        .then((rows) => {
          setSuggestions(rows);
          setOpen(rows.length > 0);
        })
        .catch(() => {
          setSuggestions([]);
          setOpen(false);
        })
        .finally(() => setLoading(false));
    }, 300);

    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    if (!hasPin || !webRef.current) return;
    webRef.current.injectJavaScript(`window.setPin && window.setPin(${latitude}, ${longitude}); true;`);
  }, [hasPin, latitude, longitude]);

  useEffect(() => {
    return () => {
      if (reverseTimer.current) clearTimeout(reverseTimer.current);
    };
  }, []);

  const cancelReverse = () => {
    reverseSeq.current += 1;
    if (reverseTimer.current) {
      clearTimeout(reverseTimer.current);
      reverseTimer.current = null;
    }
    setResolvingAddress(false);
  };

  const applyPinMove = (nextLat, nextLng) => {
    onChange?.({
      address: valueRef.current?.address ?? query,
      latitude: nextLat,
      longitude: nextLng,
    });

    const seq = ++reverseSeq.current;
    setResolvingAddress(true);
    if (reverseTimer.current) clearTimeout(reverseTimer.current);
    reverseTimer.current = setTimeout(() => {
      reverseAddress(nextLat, nextLng)
        .then((row) => {
          if (seq !== reverseSeq.current || !row?.address) return;
          skipSuggest.current = true;
          typingRef.current = false;
          setQuery(row.address);
          onChange?.({
            address: row.address,
            latitude: nextLat,
            longitude: nextLng,
          });
        })
        .catch(() => {
          // Keep the pin; leave the last known address in place.
        })
        .finally(() => {
          if (seq === reverseSeq.current) setResolvingAddress(false);
        });
    }, 400);
  };

  const pick = (row) => {
    cancelReverse();
    skipSuggest.current = true;
    typingRef.current = false;
    setOpen(false);
    setSuggestions([]);
    setQuery(row.address || row.label);
    onChange?.({
      address: row.address || row.label,
      latitude: row.latitude,
      longitude: row.longitude,
    });
  };

  return (
    <View style={styles.wrap}>
      <View style={[styles.inputWrap, error && styles.inputError]}>
        <View style={[styles.iconSlot, { pointerEvents: "none" }]}>
          <MapPin size={16} color={T.gray} strokeWidth={1.75} />
        </View>
        <View style={styles.textSlot}>
          <LocaleTextInput
            value={query}
            onChangeText={(text) => {
              cancelReverse();
              typingRef.current = true;
              setQuery(text);
              const same = text.trim() === String(value?.address ?? "").trim();
              onChange?.({
                address: text,
                latitude: same ? latitude : null,
                longitude: same ? longitude : null,
              });
            }}
            onFocus={() => {
              if (suggestions.length > 0) setOpen(true);
            }}
            onBlur={onBlur}
            placeholder={placeholder || t("guests.addressPlaceholder")}
            placeholderTextColor={T.gray}
            style={fieldTextStyle}
            maxLength={LIMITS.communityAddress}
            underlineColorAndroid="transparent"
            textAlignVertical="center"
            allowFontScaling={false}
            autoCorrect={false}
          />
        </View>
      </View>

      {open ? (
        <View style={styles.dropdown}>
          <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
            {suggestions.map((row) => (
              <Pressable
                key={`${row.latitude}-${row.longitude}-${row.label}`}
                style={styles.option}
                onPress={() => pick(row)}
              >
                <Text style={styles.optionText}>{row.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {loading ? <Text style={styles.hint}>{t("guests.addressSearching")}</Text> : null}
      {resolvingAddress ? <Text style={styles.hint}>{t("guests.addressUpdating")}</Text> : null}

      {hasPin ? (
        <View style={styles.mapWrap}>
          <WebView
            ref={webRef}
            originWhitelist={["*"]}
            source={{ html }}
            style={styles.map}
            scrollEnabled={false}
            javaScriptEnabled
            onLoadEnd={() => {
              webRef.current?.injectJavaScript?.(
                "try { map && map.invalidateSize({ animate: false }); } catch (e) {} true;",
              );
            }}
            onMessage={(event) => {
              try {
                const next = JSON.parse(event.nativeEvent.data);
                if (Number.isFinite(next.latitude) && Number.isFinite(next.longitude)) {
                  applyPinMove(next.latitude, next.longitude);
                }
              } catch {
                // ignore malformed map messages
              }
            }}
          />
        </View>
      ) : (
        <Text style={styles.hint}>{t("guests.addressSearchHint")}</Text>
      )}
      {hasPin ? <Text style={styles.hint}>{t("guests.addressPinHint")}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 8,
    position: "relative",
    zIndex: 4,
  },
  inputWrap: {
    height: FIELD_BOX_HEIGHT,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: T.white,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    overflow: "hidden",
  },
  inputError: {
    borderColor: "#DC2626",
  },
  iconSlot: {
    width: 16,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  textSlot: {
    flex: 1,
    height: "100%",
    justifyContent: "center",
  },
  dropdown: {
    marginTop: 6,
    maxHeight: 220,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 14,
    backgroundColor: T.white,
    overflow: "hidden",
  },
  option: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: T.border,
  },
  optionText: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: T.navy,
  },
  hint: {
    marginTop: 8,
    fontFamily: Fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    color: T.gray,
  },
  mapWrap: {
    marginTop: 10,
    height: MAP_HEIGHT,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: "#DCE7F2",
    ...rnShadow({ color: "#0B1F3A", offset: { width: 0, height: 6 }, opacity: 0.08, radius: 12, elevation: 2 }),
  },
  map: {
    flex: 1,
    backgroundColor: "#DCE7F2",
  },
});
