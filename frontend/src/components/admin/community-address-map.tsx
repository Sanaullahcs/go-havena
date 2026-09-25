"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./community-address-map.css";

type Props = {
  latitude: number;
  longitude: number;
  onMove: (latitude: number, longitude: number) => void;
};

const COMMUNITY_MAP_HEIGHT = 300;
const TILE_SIZE = 256;
const WORLD_BOUNDS = L.latLngBounds(
  L.latLng(-85.05112878, -180),
  L.latLng(85.05112878, 180),
);

/** Lowest zoom whose world tiles still cover the container, so the void never shows. */
function coverZoom(map: L.Map) {
  const size = map.getSize();
  if (size.x < 1 || size.y < 1) return map.getZoom();

  map.setMinZoom(0);
  let zoom = map.getBoundsZoom(WORLD_BOUNDS, true);
  const maxZoom = map.getMaxZoom();
  while (zoom < maxZoom) {
    const worldPx = TILE_SIZE * 2 ** zoom;
    if (worldPx >= size.x && worldPx >= size.y) break;
    zoom += 1;
  }
  map.setMinZoom(zoom);
  map.setMaxBounds(WORLD_BOUNDS);
  return zoom;
}

function createPinIcon() {
  return L.divIcon({
    className: "havena-map-pin",
    html: `<div class="havena-map-pin__stack">
      <span class="havena-map-pin__pulse"></span>
      <span class="havena-map-pin__marker">
        <svg viewBox="0 0 32 40" width="32" height="40" aria-hidden="true">
          <path fill="#1B4F8A" d="M16 1.5C8.8 1.5 3 7.3 3 14.6c0 9.6 13 23.9 13 23.9s13-14.3 13-23.9C29 7.3 23.2 1.5 16 1.5z"/>
          <circle cx="16" cy="14.5" r="5.2" fill="#14b8a6"/>
        </svg>
      </span>
    </div>`,
    iconSize: [36, 44],
    iconAnchor: [18, 42],
  });
}

function samePoint(a: L.LatLng, latitude: number, longitude: number) {
  return Math.abs(a.lat - latitude) < 0.0000001 && Math.abs(a.lng - longitude) < 0.0000001;
}

export function CommunityAddressMap({ latitude, longitude, onMove }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;

    const map = L.map(el, {
      center: [latitude, longitude],
      zoom: 16,
      minZoom: 0,
      maxBoundsViscosity: 1,
      scrollWheelZoom: true,
      zoomControl: false,
      attributionControl: false,
    });

    L.control.zoom({ position: "topright" }).addTo(map);

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
    }).addTo(map);

    const circle = L.circle([latitude, longitude], {
      radius: 90,
      color: "#14b8a6",
      weight: 1.5,
      opacity: 0.7,
      fillColor: "#14b8a6",
      fillOpacity: 0.1,
    }).addTo(map);

    const marker = L.marker([latitude, longitude], {
      draggable: true,
      autoPan: true,
      icon: createPinIcon(),
    }).addTo(map);

    const emit = (lat: number, lng: number) => {
      circle.setLatLng([lat, lng]);
      onMoveRef.current(lat, lng);
    };

    marker.on("drag", () => {
      const pos = marker.getLatLng();
      circle.setLatLng(pos);
    });

    marker.on("dragend", () => {
      const pos = marker.getLatLng();
      emit(pos.lat, pos.lng);
    });

    map.on("click", (event) => {
      marker.setLatLng(event.latlng);
      emit(event.latlng.lat, event.latlng.lng);
    });

    mapRef.current = map;
    markerRef.current = marker;
    circleRef.current = circle;

    const refreshSize = () => {
      map.invalidateSize({ animate: false });
      const pin = marker.getLatLng();
      const zoom = Math.max(map.getZoom(), coverZoom(map));
      map.setView(pin, zoom, { animate: false });
    };

    map.whenReady(refreshSize);
    const timers = [0, 80, 200, 400, 700].map((ms) => window.setTimeout(refreshSize, ms));
    const observer = new ResizeObserver(() => refreshSize());
    observer.observe(el);

    return () => {
      timers.forEach((handle) => window.clearTimeout(handle));
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
    };
    // First paint only — pin updates are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    const circle = circleRef.current;
    if (!map || !marker || !circle) return;
    if (samePoint(marker.getLatLng(), latitude, longitude)) return;
    marker.setLatLng([latitude, longitude]);
    circle.setLatLng([latitude, longitude]);
    map.setView([latitude, longitude], Math.max(map.getZoom(), 16));
    window.setTimeout(() => map.invalidateSize({ animate: false }), 40);
  }, [latitude, longitude]);

  const recenter = () => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    map.setView(marker.getLatLng(), 16, { animate: true });
    map.invalidateSize({ animate: false });
  };

  return (
    <div className="havena-address-map relative" style={{ height: COMMUNITY_MAP_HEIGHT, width: "100%" }}>
      <div ref={containerRef} className="absolute inset-0" />
      <button
        type="button"
        onClick={recenter}
        className="absolute bottom-3 left-3 z-[500] inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-[11px] font-semibold text-[#0b1f3a] shadow-[0_8px_20px_rgba(11,31,58,0.12)] ring-1 ring-slate-200/80 backdrop-blur hover:bg-white"
      >
        Recenter pin
      </button>
    </div>
  );
}
