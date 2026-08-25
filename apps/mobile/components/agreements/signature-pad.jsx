import React, { useRef } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { WebView } from "react-native-webview";
import { Fonts } from "../../constants/font";
import { sw, sf } from "../../utils/responsive";

const PAD_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<style>
  html, body { margin: 0; padding: 0; height: 100%; background: #FBFCFD; overflow: hidden; }
  canvas { display: block; width: 100%; height: 100%; touch-action: none; }
  .line { position: absolute; left: 24px; right: 24px; bottom: 36px; border-bottom: 1px dashed #E2E8F0; pointer-events: none; }
</style>
</head>
<body>
<div class="line"></div>
<canvas id="c"></canvas>
<script>
  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d");
  let drawing = false;
  let empty = true;
  let last = null;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0F2744";
  }
  resize();
  window.addEventListener("resize", resize);

  function point(e) {
    const t = e.touches ? e.touches[0] : e;
    const r = canvas.getBoundingClientRect();
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  }
  function start(e) { drawing = true; last = point(e); e.preventDefault(); }
  function move(e) {
    if (!drawing) return;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last = p;
    empty = false;
    e.preventDefault();
  }
  function end() { drawing = false; last = null; }

  canvas.addEventListener("pointerdown", start);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointerleave", end);
  canvas.addEventListener("touchstart", start, { passive: false });
  canvas.addEventListener("touchmove", move, { passive: false });
  canvas.addEventListener("touchend", end);

  window.clearPad = function () {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    empty = true;
  };
  window.exportPad = function () {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      empty: empty,
      dataUrl: empty ? "" : canvas.toDataURL("image/png")
    }));
  };
</script>
</body>
</html>`;

export default function MobileSignaturePad({ padRef }) {
  const webRef = useRef(null);

  if (padRef) {
    padRef.current = {
      clear: () => webRef.current?.injectJavaScript("clearPad(); true;"),
      exportSignature: () =>
        new Promise((resolve) => {
          padRef.current._resolve = resolve;
          webRef.current?.injectJavaScript("exportPad(); true;");
        }),
    };
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>
        <Text style={styles.label}>Draw your legal signature</Text>
        <Pressable onPress={() => webRef.current?.injectJavaScript("clearPad(); true;")}>
          <Text style={styles.clear}>Clear</Text>
        </Pressable>
      </View>
      <WebView
        ref={webRef}
        source={{ html: PAD_HTML }}
        style={styles.pad}
        scrollEnabled={false}
        javaScriptEnabled
        originWhitelist={["*"]}
        onMessage={(event) => {
          try {
            const payload = JSON.parse(event.nativeEvent.data);
            padRef?.current?._resolve?.(payload);
          } catch {
            padRef?.current?._resolve?.({ empty: true, dataUrl: "" });
          }
        }}
      />
      <Text style={styles.hint}>Sign above using your finger</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: sw(16),
    backgroundColor: "#FBFCFD",
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: sw(14),
    paddingVertical: sw(10),
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  label: {
    fontFamily: Fonts.bold,
    fontSize: sf(11),
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    fontWeight: "700",
  },
  clear: { fontFamily: Fonts.bold, fontSize: sf(12), color: "#1B4F8A", fontWeight: "700" },
  pad: { height: sw(180), backgroundColor: "#FBFCFD" },
  hint: {
    textAlign: "center",
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    color: "#94A3B8",
    paddingVertical: sw(8),
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
});
