import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Share,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useNavigation, usePathname, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { WebView } from "react-native-webview";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import * as Sharing from "expo-sharing";
import Svg, { Polyline } from "react-native-svg";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import { useTranslation } from "react-i18next";
import i18n from "../../../../i18n";
import { getLocaleForLang } from "../../../../hooks/use-app-locale";
import InternalScreenHeader from "../../../../components/layout/internal-screen-header";
import LocaleTextInput from "../../../../components/ui/locale-text-input";
import { Fonts } from "../../../../constants/font";
import { sw, sf } from "../../../../utils/responsive";
import { fetchCommunityDocument, fetchSignedAgreementLink, signAgreement } from "../../../../services/documents-api";
import { PropertyManagementRoutes } from "../../../../constants/property-management-routes";
import { useApiAction } from "../../../../hooks/use-api-action";
import { useAppDialog } from "../../../../providers/app-dialog-provider";

const PDF_LIMIT = 8 * 1024 * 1024;

function formatWhen(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(getLocaleForLang(i18n.language), {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x2000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(index, index + chunk));
  }
  return global.btoa(binary);
}

export function viewerHtml(base64) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<style>
  html, body { margin: 0; height: 100%; overflow: auto; background: #F3F6FA; -webkit-overflow-scrolling: touch; }
  #wrap { display: flex; justify-content: center; padding: 8px 10px; box-sizing: border-box; min-height: 100%; }
  #stage { position: relative; display: inline-block; }
  canvas { display: block; background: #fff; box-shadow: 0 8px 24px rgba(16,24,40,.08); image-rendering: auto; }
  #sig {
    display: none; position: absolute; box-sizing: border-box; left: 30%; top: 74%; width: 40%; height: 12%;
    border: 1.5px dashed #3B82F6; border-radius: 6px; background: rgba(255,255,255,.94);
    touch-action: none; z-index: 2;
  }
  #sigBody { position: absolute; left: 2px; right: 2px; top: 1px; bottom: 11px; overflow: hidden; pointer-events: none; display: flex; align-items: center; justify-content: center; }
  #sigStamp {
    position: absolute; left: 4px; right: 4px; bottom: 1px; height: 9px;
    display: flex; align-items: center; justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 7px; font-weight: 500; letter-spacing: 0;
    color: #64748B; pointer-events: none; white-space: nowrap;
  }
  #sigBar {
    position: absolute; left: 50%; bottom: calc(100% + 4px); transform: translateX(-50%);
    display: flex; align-items: center; gap: 0; background: #111827; border-radius: 7px; padding: 1px; z-index: 3;
  }
  #sigBar span, #sigBar button {
    width: 22px; height: 20px; border: 0; background: transparent; color: #fff;
    font-size: 12px; line-height: 20px; text-align: center; padding: 0;
  }
  #sig svg { width: 100%; height: 100%; display: block; }
  #sig .name {
    max-width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
    font-family: "Times New Roman", Times, serif; font-style: italic; line-height: 1;
    color: #111827; padding: 0 8px; white-space: nowrap;
  }
  .handle {
    position: absolute; width: 12px; height: 12px; border-radius: 50%;
    background: #fff; border: 2px solid #3B82F6; touch-action: none; box-sizing: border-box;
  }
  .handle.nw { left: -7px; top: -7px; }
  .handle.ne { right: -7px; top: -7px; }
  .handle.sw { left: -7px; bottom: -7px; }
  .handle.se { right: -7px; bottom: -7px; }
  .handle.n { left: 50%; top: -7px; margin-left: -6px; }
  .handle.s { left: 50%; bottom: -7px; margin-left: -6px; }
  .handle.e { right: -7px; top: 50%; margin-top: -6px; }
  .handle.w { left: -7px; top: 50%; margin-top: -6px; }
</style>
</head>
<body>
<div id="wrap"><div id="stage"><canvas id="page"></canvas>
<div id="sig">
  <div id="sigBar"><span>✥</span><button id="sigClear" type="button">✕</button></div>
  <div id="sigBody"></div>
  <div id="sigStamp"></div>
  <span class="handle nw" data-h="nw"></span>
  <span class="handle n" data-h="n"></span>
  <span class="handle ne" data-h="ne"></span>
  <span class="handle e" data-h="e"></span>
  <span class="handle se" data-h="se"></span>
  <span class="handle s" data-h="s"></span>
  <span class="handle sw" data-h="sw"></span>
  <span class="handle w" data-h="w"></span>
</div>
</div></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
<script>
  const send = (value) => { if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(value); };
  let pdf = null, page = 1, zoom = 1, ready = false, mode = null, handle = null, start = null, grabX = 0, grabY = 0, frame = 0, pending = null, renderTask = null;
  const sig = document.getElementById("sig");
  const body = document.getElementById("sigBody");
  const stage = document.getElementById("stage");
  function boxPct() {
    return {
      x: parseFloat(sig.style.left) || 48,
      y: parseFloat(sig.style.top) || 58,
      w: parseFloat(sig.style.width) || 36,
      h: parseFloat(sig.style.height) || 14,
    };
  }
  function applyBox(next) {
    const w = Math.max(28, Math.min(88, next.w));
    const h = Math.max(10, Math.min(28, next.h));
    const x = Math.max(0, Math.min(100 - w, next.x));
    const y = Math.max(0, Math.min(100 - h, next.y));
    sig.style.left = x + "%";
    sig.style.top = y + "%";
    sig.style.width = w + "%";
    sig.style.height = h + "%";
  }
  function sendPlace() {
    if (sig.style.display === "none") return;
    const box = boxPct();
    send("place:" + page + ":" + (box.x / 100).toFixed(4) + ":" + (box.y / 100).toFixed(4) + ":" + (box.w / 100).toFixed(4) + ":" + (box.h / 100).toFixed(4));
  }
  function paint() {
    pdf.getPage(page).then((item) => {
      const base = item.getViewport({ scale: 1 });
      const wrap = document.getElementById("wrap");
      const maxW = Math.max((wrap.clientWidth || base.width) - 24, 120);
      const cssWidth = maxW * zoom;
      const ratio = Math.min(Math.max(window.devicePixelRatio || 1, 2), 3);
      const viewport = item.getViewport({ scale: cssWidth / base.width });
      const canvas = document.getElementById("page");
      const context = canvas.getContext("2d", { alpha: false });
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = Math.floor(viewport.width) + "px";
      canvas.style.height = Math.floor(viewport.height) + "px";
      if (renderTask) {
        try { renderTask.cancel(); } catch (err) {}
        renderTask = null;
      }
      renderTask = item.render({
        canvasContext: context,
        viewport: viewport,
        transform: [ratio, 0, 0, ratio, 0, 0],
      });
      renderTask.promise.catch(() => {});
      send("page:" + page + ":" + pdf.numPages);
      send("zoom:" + Math.round(zoom * 100));
      sendPlace();
    }).catch(() => send("error"));
  }
  window.havenaPrev = () => { if (pdf && page > 1) { page -= 1; paint(); } };
  window.havenaNext = () => { if (pdf && page < pdf.numPages) { page += 1; paint(); } };
  window.havenaZoom = (delta) => { zoom = Math.min(2.5, Math.max(0.75, Math.round((zoom + delta) * 100) / 100)); if (pdf) paint(); };
  window.havenaFit = () => { zoom = 1; if (pdf) paint(); };
  window.havenaSignature = (payload) => {
    const stamp = document.getElementById("sigStamp");
    if (!payload || !payload.visible) { sig.style.display = "none"; body.innerHTML = ""; if (stamp) stamp.textContent = ""; return; }
    if (!sig.style.left) applyBox({ x: 30, y: 74, w: 40, h: 12 });
    sig.style.display = "block";
    if (payload.method === "type") {
      body.innerHTML = "";
      const name = document.createElement("div");
      name.className = "name";
      name.textContent = payload.name || "";
      body.appendChild(name);
      const box = body.getBoundingClientRect();
      let size = Math.max(16, Math.floor(box.height * 0.62));
      name.style.fontSize = size + "px";
      const max = Math.max(box.width * 0.92, 40);
      while (size > 12 && name.scrollWidth > max) {
        size -= 1;
        name.style.fontSize = size + "px";
      }
    } else {
      const paths = (payload.strokes || []).map((path) => {
        const points = path.map((point) => (Number(point.x) * 100) + "," + (Number(point.y) * 100)).join(" ");
        return '<polyline points="' + points + '" fill="none" stroke="#111827" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />';
      }).join("");
      body.innerHTML = '<svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%">' + paths + "</svg>";
    }
    if (stamp) stamp.textContent = payload.stamp || "";
    sendPlace();
  };
  function moveSig(clientX, clientY) {
    const bounds = stage.getBoundingClientRect();
    const width = sig.offsetWidth;
    const height = sig.offsetHeight;
    const left = Math.max(0, Math.min(bounds.width - width, clientX - bounds.left - grabX));
    const top = Math.max(0, Math.min(bounds.height - height, clientY - bounds.top - grabY));
    sig.style.left = ((left / Math.max(bounds.width, 1)) * 100) + "%";
    sig.style.top = ((top / Math.max(bounds.height, 1)) * 100) + "%";
  }
  function resizeSig(clientX, clientY) {
    const dx = ((clientX - start.x) / Math.max(start.bounds.width, 1)) * 100;
    const dy = ((clientY - start.y) / Math.max(start.bounds.height, 1)) * 100;
    const next = { x: start.box.x, y: start.box.y, w: start.box.w, h: start.box.h };
    if (handle.indexOf("e") >= 0) next.w = start.box.w + dx;
    if (handle.indexOf("s") >= 0) next.h = start.box.h + dy;
    if (handle.indexOf("w") >= 0) { next.x = start.box.x + dx; next.w = start.box.w - dx; }
    if (handle.indexOf("n") >= 0) { next.y = start.box.y + dy; next.h = start.box.h - dy; }
    applyBox(next);
  }
  const clearBtn = document.getElementById("sigClear");
  clearBtn.addEventListener("pointerdown", (event) => { event.stopPropagation(); });
  clearBtn.addEventListener("click", (event) => { event.stopPropagation(); send("clear"); });
  sig.addEventListener("pointerdown", (event) => {
    const target = event.target.closest ? event.target.closest("[data-h]") : null;
    const bounds = stage.getBoundingClientRect();
    mode = target ? "resize" : "move";
    handle = target ? target.getAttribute("data-h") : "";
    start = { x: event.clientX, y: event.clientY, box: boxPct(), bounds };
    if (mode === "move") {
      const box = sig.getBoundingClientRect();
      grabX = event.clientX - box.left;
      grabY = event.clientY - box.top;
    }
    sig.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  });
  sig.addEventListener("pointermove", (event) => {
    if (!mode) return;
    event.preventDefault();
    pending = { x: event.clientX, y: event.clientY, kind: mode };
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!pending) return;
      if (pending.kind === "resize") resizeSig(pending.x, pending.y);
      else moveSig(pending.x, pending.y);
    });
  });
  sig.addEventListener("pointerup", (event) => {
    if (!mode) return;
    const kind = mode;
    mode = null;
    if (frame) { cancelAnimationFrame(frame); frame = 0; }
    if (kind === "resize") resizeSig(event.clientX, event.clientY);
    else moveSig(event.clientX, event.clientY);
    sendPlace();
  });
  sig.addEventListener("pointercancel", () => { mode = null; sendPlace(); });
  sig.addEventListener("touchmove", (event) => { if (mode) event.preventDefault(); }, { passive: false });
  setTimeout(() => { if (!ready) send("error"); }, 12000);
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    const raw = atob(${JSON.stringify(base64)});
    const data = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) data[i] = raw.charCodeAt(i);
    pdfjsLib.getDocument({ data }).promise.then((loaded) => {
      pdf = loaded;
      ready = true;
      send("ready");
      paint();
    }).catch(() => send("error"));
  } catch (err) {
    send("error");
  }
</script>
</body>
</html>`;
}

function signaturePadHeight(windowHeight) {
  return Math.min(240, Math.max(180, Math.round(windowHeight * 0.24)));
}

function clampUnit(value, size) {
  return Number(Math.max(0, Math.min(1, value / Math.max(size, 1))).toFixed(4));
}

function SignaturePad({ strokes, onCommit, scrollGesture, hint, height }) {
  const navigation = useNavigation();
  const { height: windowHeight } = useWindowDimensions();
  const padHeight = height || signaturePadHeight(windowHeight);
  const layout = useRef({ width: 1, height: padHeight });
  const [box, setBox] = useState({ width: 1, height: padHeight });
  const pathRef = useRef([]);
  const [live, setLive] = useState([]);
  const frame = useRef(0);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  useEffect(() => {
    navigation.setOptions({ gestureEnabled: false });
    return () => navigation.setOptions({ gestureEnabled: true });
  }, [navigation]);

  const drawing = useRef({
    start(x, y) {
      const next = [{ x: clampUnit(x, layout.current.width), y: clampUnit(y, layout.current.height) }];
      pathRef.current = next;
      setLive(next);
    },
    move(x, y) {
      const nextPoint = { x: clampUnit(x, layout.current.width), y: clampUnit(y, layout.current.height) };
      const last = pathRef.current[pathRef.current.length - 1];
      if (last) {
        const dx = (nextPoint.x - last.x) * layout.current.width;
        const dy = (nextPoint.y - last.y) * layout.current.height;
        if (dx * dx + dy * dy < 0.36) return;
      }
      pathRef.current = [...pathRef.current, nextPoint];
      if (!frame.current) {
        frame.current = requestAnimationFrame(() => {
          frame.current = 0;
          setLive(pathRef.current);
        });
      }
    },
    end() {
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = 0;
      const finished = pathRef.current;
      pathRef.current = [];
      setLive([]);
      if (finished.length > 1) commitRef.current(finished);
    },
  });

  const draw = usePanGesture(useMemo(() => ({
    minDistance: 0,
    maxPointers: 1,
    shouldCancelWhenOutside: false,
    runOnJS: true,
    block: scrollGesture || undefined,
    onBegin: (event) => drawing.current.start(event.x, event.y),
    onUpdate: (event) => drawing.current.move(event.x, event.y),
    onFinalize: () => drawing.current.end(),
  }), [scrollGesture]));

  const paths = live.length > 1 ? [...strokes, live] : strokes;

  return (
    <GestureDetector gesture={draw}>
      <View
        collapsable={false}
        style={[styles.canvas, { height: padHeight }]}
        onLayout={(event) => {
          const next = event.nativeEvent.layout;
          const width = Math.max(next.width, 1);
          const height = Math.max(next.height, 1);
          layout.current = { width, height };
          setBox((current) => (current.width === width && current.height === height ? current : { width, height }));
        }}
      >
        <Svg pointerEvents="none" width="100%" height="100%" viewBox={`0 0 ${box.width} ${box.height}`}>
          {paths.map((path, index) => (
            <Polyline
              key={`${index}-${path.length}`}
              points={path.map((point) => `${point.x * box.width},${point.y * box.height}`).join(" ")}
              fill="none"
              stroke="#111827"
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </Svg>
        <View pointerEvents="none" style={styles.baseline} />
        {strokes.length === 0 && live.length === 0 ? (
          <Text pointerEvents="none" style={styles.canvasHint}>{hint}</Text>
        ) : null}
      </View>
    </GestureDetector>
  );
}

function Progress({ index }) {
  const { t } = useTranslation();
  const steps = [t("propertyMgmt.reviewStep"), t("propertyMgmt.signStep"), t("propertyMgmt.completeStep")];
  const dot = sw(36);
  return (
    <View style={styles.progress}>
      <View pointerEvents="none" style={[styles.progressRail, { top: (dot - 2) / 2 }]}>
        <View style={styles.progressRailBase} />
        <View style={[styles.progressRailFill, { width: index <= 1 ? "0%" : index === 2 ? "50%" : "100%" }]} />
      </View>
      {steps.map((label, position) => {
        const step = position + 1;
        const done = index > step;
        const current = index === step;
        const active = done || current;
        return (
          <View key={label} style={styles.progressStep}>
            <View style={[styles.progressDot, { width: dot, height: dot, borderRadius: dot / 2 }, active && styles.progressDotOn]}>
              {done ? (
                <Feather name="check" size={sf(15)} color="#FFFFFF" />
              ) : (
                <Text style={[styles.progressNum, active && styles.progressNumOn]}>{step}</Text>
              )}
            </View>
            <Text style={[styles.progressLabel, current && styles.progressLabelOn]} numberOfLines={1}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

export default function SignAgreement() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { documentId, assignmentId, mode, source } = useLocalSearchParams();
  const { showFailure } = useApiAction();
  const dialog = useAppDialog();
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState("review");
  const [reviewed, setReviewed] = useState(false);
  const [pdfError, setPdfError] = useState(false);
  const [viewer, setViewer] = useState(null);
  const [pageLabel, setPageLabel] = useState("");
  const [method, setMethod] = useState("draw");
  const [typedName, setTypedName] = useState("");
  const [strokes, setStrokes] = useState([]);
  const [placement, setPlacement] = useState({ page: 1, x: 0.3, y: 0.74, width: 0.4, height: 0.12 });
  const [zoomLabel, setZoomLabel] = useState("100%");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [copyBusy, setCopyBusy] = useState(null);
  const webRef = useRef(null);
  const lock = useRef(false);
  const typeInputRef = useRef(null);
  const typeBoxRef = useRef(null);
  const typeBoxFrame = useRef(null);
  const viewOnly = mode === "view";
  const viewingSigned = viewOnly && source === "signed";

  const loadPdfUrl = useCallback(async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error("pdf");
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > PDF_LIMIT) throw new Error("large");
    setViewer(viewerHtml(bytesToBase64(new Uint8Array(buffer))));
    setPdfError(false);
  }, []);

  useFocusEffect(useCallback(() => {
    setConsent(false);
  }, []));

  useEffect(() => {
    let cancelled = false;
    fetchCommunityDocument(documentId)
      .then((found) => {
        if (!cancelled) setDoc(found);
      })
      .catch((err) => {
        if (!cancelled) showFailure(t("propertyMgmt.couldNotLoadDocs"), err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  const assignment = (doc?.assignments ?? []).find(
    (item) => String(item.assignment_id) === String(assignmentId),
  ) ?? doc?.assignments?.[0];

  useEffect(() => {
    if (!doc) return undefined;
    if (viewingSigned || (!viewOnly && assignment?.signature_status === "signed")) {
      setResult((current) => current ?? {
        replayed: true,
        signed_file_url: assignment?.signed_file_url,
        signature: { signed_at: assignment?.signed_at },
      });
      setStep("signed");
      return undefined;
    }
    let cancelled = false;
    (async () => {
      if (!doc.file_url) {
        setPdfError(true);
        return;
      }
      try {
        await loadPdfUrl(doc.file_url);
      } catch {
        if (!cancelled) setPdfError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doc?.id, doc?.file_url, viewOnly, viewingSigned, assignment?.signature_status, assignment?.signed_file_url, loadPdfUrl]);

  useEffect(() => {
    if (step !== "signed" || !doc?.id || !assignment?.assignment_id) return undefined;
    let cancelled = false;
    let tries = 0;
    const pollSignedPdf = async () => {
      if (cancelled) return;
      try {
        let url = result?.signed_file_url ?? null;
        if (!url) {
          url = await fetchSignedAgreementLink(doc.id, assignment.assignment_id);
        }
        if (url) {
          await loadPdfUrl(url);
          return;
        }
      } catch {
        // Queue may still be rendering the stamped PDF.
      }
      tries += 1;
      if (!cancelled && tries < 20) {
        setTimeout(pollSignedPdf, 2000);
      } else if (!cancelled) {
        setPdfError(true);
      }
    };
    void pollSignedPdf();
    return () => {
      cancelled = true;
    };
  }, [step, doc?.id, assignment?.assignment_id, result?.signed_file_url, loadPdfUrl]);

  const commitStroke = useCallback((path) => {
    setStrokes((current) => [...current, path]);
  }, []);

  const clearStrokes = useCallback(() => {
    setStrokes([]);
  }, []);

  const clearSignature = useCallback(() => {
    setStrokes([]);
    setTypedName("");
  }, []);

  const hasSignature = method === "draw" ? strokes.length > 0 : typedName.trim().length >= 2;
  const canSubmit = Boolean(assignment?.can_sign) && reviewed && hasSignature && consent && !submitting;

  const downloadOriginal = async () => {
    if (!doc?.file_url || copyBusy) return;
    setCopyBusy("download");
    try {
      const file = await FileSystem.downloadAsync(doc.file_url, `${FileSystem.cacheDirectory}agreement-${doc.id}.pdf`);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: "application/pdf",
          UTI: "com.adobe.pdf",
          dialogTitle: t("propertyMgmt.downloadPdf"),
        });
      }
    } catch (err) {
      if (err?.message && /cancel|did not share/i.test(String(err.message))) return;
      await showFailure(t("propertyMgmt.downloadPdf"), err);
    } finally {
      setCopyBusy(null);
    }
  };

  const openPdf = async () => {
    if (!doc?.file_url) {
      setPdfError(true);
      setReviewed(false);
      return;
    }
    try {
      await loadPdfUrl(doc.file_url);
      setReviewed(true);
    } catch {
      setPdfError(true);
      setReviewed(false);
    }
  };

  const keepViewerInside = (request) => !/\.pdf($|\?)/i.test(request?.url ?? "");

  useEffect(() => {
    if (step !== "signed" || !doc) return undefined;
    let cancelled = false;
    (async () => {
      try {
        let url = result?.signed_file_url || assignment?.signed_file_url || null;
        if (doc.id && assignment?.assignment_id) {
          try {
            const fresh = await fetchSignedAgreementLink(doc.id, assignment.assignment_id);
            if (fresh) url = fresh;
          } catch {
            // The link returned with the signature is still valid for a few minutes.
          }
        }
        if (!url) throw new Error("missing");
        const response = await fetch(url);
        if (!response.ok) throw new Error("pdf");
        const buffer = await response.arrayBuffer();
        if (cancelled) return;
        if (buffer.byteLength > PDF_LIMIT) throw new Error("large");
        setViewer(viewerHtml(bytesToBase64(new Uint8Array(buffer))));
        setPdfError(false);
      } catch {
        if (!cancelled) setPdfError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, doc?.id, assignment?.assignment_id, assignment?.signed_file_url, result?.signed_file_url]);

  const onViewerMessage = (event) => {
    const message = event.nativeEvent.data;
    if (message === "ready") {
      setReviewed(true);
      setPdfError(false);
      return;
    }
    if (message === "error") {
      setReviewed(false);
      setPdfError(true);
      return;
    }
    if (message.startsWith("page:")) {
      const [, page, total] = message.split(":");
      setPageLabel(t("propertyMgmt.pageOf", { page, total }));
      return;
    }
    if (message.startsWith("zoom:")) {
      setZoomLabel(`${message.slice(5)}%`);
      return;
    }
    if (message.startsWith("place:")) applyPlacement(message);
  };

  const applyPlacement = (message) => {
    const [, page, x, y, width, height] = message.split(":");
    const next = { page: Number(page), x: Number(x), y: Number(y), width: Number(width), height: Number(height) };
    if ([next.page, next.x, next.y, next.width, next.height].every((value) => Number.isFinite(value))) {
      setPlacement(next);
    }
  };

  const onPlaceMessage = (event) => {
    const message = event.nativeEvent.data;
    if (message.startsWith("page:")) {
      const [, page, total] = message.split(":");
      setPageLabel(t("propertyMgmt.pageOf", { page, total }));
      return;
    }
    if (message === "clear") {
      clearSignature();
      return;
    }
    if (message.startsWith("zoom:")) {
      setZoomLabel(`${message.slice(5)}%`);
      return;
    }
    if (message.startsWith("place:")) applyPlacement(message);
  };

  const inject = (script) => {
    webRef.current?.injectJavaScript(`${script}; true;`);
  };

  const signaturePreview = {
    visible: hasSignature,
    method,
    name: typedName.trim(),
    strokes: method === "draw" ? strokes : [],
    stamp: new Date().toLocaleString(getLocaleForLang(i18n.language), {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    }),
  };
  const signaturePreviewKey = JSON.stringify(signaturePreview);

  useEffect(() => {
    if (step !== "sign") return;
    inject(`window.havenaSignature && window.havenaSignature(${signaturePreviewKey})`);
  }, [step, viewer, signaturePreviewKey]);

  const submit = async () => {
    if (lock.current || !canSubmit || !doc || !assignment) return;
    if (assignment.signature_status === "signed") {
      setStep("success");
      return;
    }
    lock.current = true;
    setSubmitting(true);
    try {
      const response = await signAgreement(doc.id, {
        version: doc.version,
        assignment_id: assignment.assignment_id,
        method,
        consent: true,
        typed_name: method === "type" ? typedName.trim() : null,
        strokes: method === "draw" ? strokes : [],
        ...(viewer && !pdfError ? { placement } : {}),
      });
      const payload = response?.data ?? response;
      setResult(payload);
      const signedAt = payload?.signature?.signed_at ?? new Date().toISOString();
      setDoc((current) => {
        if (!current) return current;
        const targetId = assignment.assignment_id;
        const nextAssignments = (current.assignments ?? []).map((item) => (
          String(item.assignment_id) === String(targetId)
            ? {
              ...item,
              signature_status: "signed",
              display_status: "signed",
              signed_at: signedAt,
              signed_file_url: payload?.signed_file_url ?? item.signed_file_url ?? null,
              can_sign: false,
            }
            : item
        ));
        return {
          ...current,
          assignments: nextAssignments,
          signature_status: "signed",
          signed_file_url: payload?.signed_file_url ?? current.signed_file_url ?? null,
        };
      });
      setViewer(null);
      setPageLabel("");
      setPdfError(false);
      setStep("signed");
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (err) {
      await showFailure(t("propertyMgmt.signAgreement"), err);
    } finally {
      lock.current = false;
      setSubmitting(false);
    }
  };

  const askSubmit = async () => {
    if (!canSubmit) return;
    Keyboard.dismiss();
    const choice = await dialog.showConfirm(
      t("propertyMgmt.confirmSignTitle"),
      t("propertyMgmt.confirmSignBody"),
      { confirmLabel: t("propertyMgmt.signAndComplete"), cancelLabel: t("common.cancel") },
    );
    if (choice !== "confirm") return;
    void submit();
  };

  const footerPad = { paddingBottom: Math.max(insets.bottom, sw(12)) };
  const signPadHeight = Math.min(118, Math.max(104, Math.round(windowHeight * 0.13)));

  const rememberTypeBox = useCallback(() => {
    typeBoxRef.current?.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) typeBoxFrame.current = { x, y, width, height };
    });
  }, []);

  useEffect(() => {
      const events = Platform.OS === "ios"
      ? ["keyboardWillChangeFrame", "keyboardDidShow", "keyboardDidHide"]
      : ["keyboardDidShow", "keyboardDidHide"];
    const subscriptions = events.map((event) => Keyboard.addListener(event, () => requestAnimationFrame(rememberTypeBox)));
    return () => {
      subscriptions.forEach((subscription) => subscription.remove());
    };
  }, [rememberTypeBox]);

  const dismissIfOutsideTypeField = (event) => {
    if (step !== "sign") return false;
    const { pageX, pageY } = event.nativeEvent;
    if (typeof pageX !== "number" || typeof pageY !== "number") return false;
    const box = typeBoxFrame.current;
    const inside = method === "type" && box
      && pageX >= box.x && pageX <= box.x + box.width
      && pageY >= box.y && pageY <= box.y + box.height;
    if (!inside) Keyboard.dismiss();
    return false;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.screen} edges={["left", "right"]}>
        <InternalScreenHeader title={t("propertyMgmt.signAgreement")} />
        <View style={styles.centered}><ActivityIndicator color="#1B4F8A" /></View>
      </SafeAreaView>
    );
  }

  if (step === "signed") {
    const signedAt = formatWhen(result?.signature?.signed_at);
    const signature = result?.signature;
    const reference = signature?.checksum ? String(signature.checksum).slice(0, 8).toUpperCase() : null;

    const signedUrl = async () => {
      try {
        if (doc?.id && assignment?.assignment_id) {
          const url = await fetchSignedAgreementLink(doc.id, assignment.assignment_id);
          if (url) return url;
        }
      } catch {
        // The link from the sign response is still valid for a few minutes.
      }
      return result?.signed_file_url ?? null;
    };

    const saveSignedCopy = async (kind) => {
      if (copyBusy) return;
      setCopyBusy(kind);
      try {
        const url = await signedUrl();
        if (!url) throw new Error("missing");
        const downloadUrl = url.includes("download=") ? url : `${url}${url.includes("?") ? "&" : "?"}download=1`;
        const safeName = `signed-agreement-${doc?.id ?? "copy"}.pdf`;
        const file = await FileSystem.downloadAsync(downloadUrl, `${FileSystem.cacheDirectory}${safeName}`);
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(file.uri, {
            mimeType: "application/pdf",
            UTI: "com.adobe.pdf",
            dialogTitle: kind === "download" ? t("propertyMgmt.downloadPdf") : t("propertyMgmt.shareSignedCopy"),
          });
          return;
        }
        await Share.share({ url: file.uri, message: doc?.title || "" });
      } catch (err) {
        if (err?.message && /cancel|did not share/i.test(String(err.message))) return;
        await showFailure(kind === "download" ? t("propertyMgmt.downloadPdf") : t("propertyMgmt.shareSignedCopy"), err?.message === "missing" ? { message: t("propertyMgmt.couldNotOpenSigned") } : err);
      } finally {
        setCopyBusy(null);
      }
    };

    const backToDocuments = () => {
      const documents = pathname.includes("/screens/property-management")
        ? PropertyManagementRoutes.DOCUMENTS_SCREEN
        : PropertyManagementRoutes.DOCUMENTS;
      if (typeof router.dismissTo === "function") router.dismissTo(documents);
      else router.replace(documents);
    };

    return (
      <SafeAreaView style={styles.screen} edges={["left", "right"]}>
        <InternalScreenHeader title={doc?.title || t("propertyMgmt.agreementSigned")} />
        <View style={styles.signedBanner}>
          <View style={styles.signedCheck}><Feather name="check" size={sf(14)} color="#FFFFFF" /></View>
          <View style={styles.docHeadText}>
            <Text style={styles.signedBannerTitle}>{t("propertyMgmt.agreementSigned")}</Text>
            <Text style={styles.signedBannerBody} numberOfLines={2}>
              {result?.replayed ? t("propertyMgmt.agreementAlreadySignedBody") : t("propertyMgmt.signedOpenHint")}
            </Text>
          </View>
        </View>
        {viewer && !pdfError ? (
          <WebView
            ref={webRef}
            source={{ html: viewer }}
            style={styles.web}
            originWhitelist={["*"]}
            scalesPageToFit={false}
            androidLayerType="hardware"
            javaScriptEnabled
            domStorageEnabled
            setSupportMultipleWindows={false}
            onShouldStartLoadWithRequest={keepViewerInside}
            onMessage={onViewerMessage}
          />
        ) : (
          <View style={styles.fallback}>
            {pdfError ? <Text style={styles.error}>{t("propertyMgmt.pdfFailed")}</Text> : <ActivityIndicator color="#1B4F8A" />}
          </View>
        )}
        {pageLabel ? (
          <View style={styles.pageBar}>
            <Pressable style={styles.pageBtn} onPress={() => inject("window.havenaPrev()")}>
              <Feather name="chevron-left" size={sf(18)} color="#1B4F8A" />
            </Pressable>
            <Text style={styles.pageLabel}>{pageLabel}</Text>
            <Pressable style={styles.pageBtn} onPress={() => inject("window.havenaNext()")}>
              <Feather name="chevron-right" size={sf(18)} color="#1B4F8A" />
            </Pressable>
          </View>
        ) : null}
        {reference ? <Text style={styles.signedRef}>{t("propertyMgmt.signatureReference")} {reference}{signedAt ? ` · ${signedAt}` : ""}</Text> : null}
        <View style={[styles.footer, footerPad]}>
          <View style={styles.footerRow}>
            <Pressable style={[styles.secondary, styles.footerHalf, copyBusy && styles.disabled]} disabled={Boolean(copyBusy)} onPress={() => void saveSignedCopy("share")}>
              {copyBusy === "share" ? <ActivityIndicator color="#1B4F8A" /> : <Feather name="share-2" size={sf(15)} color="#1B4F8A" />}
              <Text style={styles.secondaryText}>{t("propertyMgmt.shareSignedCopy")}</Text>
            </Pressable>
            <Pressable style={[styles.primary, styles.footerHalf, copyBusy && styles.disabled]} disabled={Boolean(copyBusy)} onPress={() => void saveSignedCopy("download")}>
              {copyBusy === "download" ? <ActivityIndicator color="#FFFFFF" /> : <Feather name="download" size={sf(16)} color="#FFFFFF" />}
              <Text style={styles.primaryText}>{t("propertyMgmt.downloadPdf")}</Text>
            </Pressable>
          </View>
          <Pressable style={styles.linkBtn} onPress={backToDocuments}>
            <Text style={styles.linkText}>{t("propertyMgmt.backToDocuments")}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const title = step === "review" ? t("propertyMgmt.reviewAgreement") : t("propertyMgmt.signAgreement");
  const pageCount = Number(doc?.page_count) > 0
    ? (Number(doc.page_count) === 1 ? t("propertyMgmt.onePage") : t("propertyMgmt.pageCount", { count: doc.page_count }))
    : "";
  const fileMeta = [doc?.file_size_label, pageCount].filter(Boolean).join(" · ");

  return (
    <SafeAreaView
      style={styles.screen}
      edges={["left", "right"]}
      onStartShouldSetResponderCapture={step === "sign" ? dismissIfOutsideTypeField : undefined}
    >
      <InternalScreenHeader title={title} />
      <View style={styles.progressWrap}><Progress index={step === "review" ? 1 : 2} /></View>
      {step === "review" ? (
        <View style={styles.flex}>
          {pdfError ? <Text style={styles.error}>{t("propertyMgmt.pdfFailed")}</Text> : null}
          {viewer && !pdfError ? (
            <>
              <WebView
                ref={webRef}
                source={{ html: viewer }}
                style={styles.web}
                originWhitelist={["*"]}
                scalesPageToFit={false}
                androidLayerType="hardware"
                javaScriptEnabled
                domStorageEnabled
                setSupportMultipleWindows={false}
                onShouldStartLoadWithRequest={keepViewerInside}
                onMessage={onViewerMessage}
                onError={() => { setReviewed(false); setPdfError(true); }}
              />
              {pageLabel ? <View style={styles.pageBar}>
                <Pressable style={styles.pageBtn} onPress={() => inject("window.havenaPrev()")}>
                  <Feather name="chevron-left" size={sf(18)} color="#1B4F8A" />
                </Pressable>
                <Text style={styles.pageLabel}>{pageLabel}</Text>
                <Pressable style={styles.pageBtn} onPress={() => inject("window.havenaNext()")}>
                  <Feather name="chevron-right" size={sf(18)} color="#1B4F8A" />
                </Pressable>
                <View style={styles.pageGap} />
                <Pressable style={styles.pageBtn} onPress={() => inject("window.havenaZoom(-0.25)")}>
                  <Feather name="minus" size={sf(16)} color="#1B4F8A" />
                </Pressable>
                <Pressable style={styles.pageBtn} onPress={() => inject("window.havenaZoom(0.25)")}>
                  <Feather name="plus" size={sf(16)} color="#1B4F8A" />
                </Pressable>
              </View> : null}
            </>
          ) : (
            <View style={styles.fallback}>
              {pdfError ? (
                <Pressable style={styles.secondary} onPress={openPdf}>
                  <Text style={styles.secondaryText}>{t("propertyMgmt.openAgreement")}</Text>
                </Pressable>
              ) : (
                <ActivityIndicator color="#1B4F8A" />
              )}
            </View>
          )}
          <View style={[styles.footer, footerPad]}>
            {viewOnly ? (
              <View style={styles.footerRow}>
                <Pressable style={[styles.secondary, styles.footerHalf, copyBusy && styles.disabled]} disabled={Boolean(copyBusy)} onPress={() => void downloadOriginal()}>
                  {copyBusy === "download" ? <ActivityIndicator color="#1B4F8A" /> : <Feather name="download" size={sf(16)} color="#1B4F8A" />}
                  <Text style={styles.secondaryText}>{t("propertyMgmt.downloadPdf")}</Text>
                </Pressable>
                <Pressable style={[styles.primary, styles.footerHalf]} onPress={() => router.back()}>
                  <Text style={styles.primaryText}>{t("propertyMgmt.backToDocuments")}</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                style={[styles.primary, !reviewed && styles.disabled]}
                disabled={!reviewed}
                onPress={() => {
                  setConsent(false);
                  setStep("sign");
                }}
              >
                <Text style={styles.primaryText}>{t("propertyMgmt.continueToSign")}</Text>
              </Pressable>
            )}
          </View>
        </View>
      ) : (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          {pdfError ? <Text style={styles.error}>{t("propertyMgmt.pdfFailed")}</Text> : null}
          <View style={styles.docCard}>
            <View style={styles.docHead}>
              <Text numberOfLines={1} style={styles.docTitle}>{doc?.title}</Text>
              <View style={styles.pageChip}>
                <Pressable hitSlop={8} onPress={() => inject("window.havenaPrev()")} accessibilityLabel="Previous page">
                  <Feather name="chevron-left" size={sf(15)} color="#1B4F8A" />
                </Pressable>
                <Text style={styles.pageChipText}>{pageLabel || t("propertyMgmt.pageOf", { page: 1, total: doc?.page_count || 1 })}</Text>
                <Pressable hitSlop={8} onPress={() => inject("window.havenaNext()")} accessibilityLabel="Next page">
                  <Feather name="chevron-right" size={sf(15)} color="#1B4F8A" />
                </Pressable>
              </View>
              <View style={styles.zoomChip}>
                <Pressable hitSlop={8} onPress={() => inject("window.havenaZoom(-0.25)")} accessibilityLabel="Zoom out">
                  <Feather name="minus" size={sf(14)} color="#1B4F8A" />
                </Pressable>
                <Pressable hitSlop={6} onPress={() => inject("window.havenaFit()")}>
                  <Text style={styles.zoomText}>{zoomLabel}</Text>
                </Pressable>
                <Pressable hitSlop={8} onPress={() => inject("window.havenaZoom(0.25)")} accessibilityLabel="Zoom in">
                  <Feather name="plus" size={sf(14)} color="#1B4F8A" />
                </Pressable>
              </View>
            </View>
            <View style={styles.docStage}>
              {viewer && !pdfError ? (
                <WebView
                  ref={webRef}
                  source={{ html: viewer }}
                  style={styles.web}
                  originWhitelist={["*"]}
                  scalesPageToFit={false}
                  androidLayerType="hardware"
                  javaScriptEnabled
                  domStorageEnabled
                  setSupportMultipleWindows={false}
                  onShouldStartLoadWithRequest={keepViewerInside}
                  scrollEnabled
                  nestedScrollEnabled
                  bounces
                  showsVerticalScrollIndicator
                  onMessage={onPlaceMessage}
                  onTouchStart={Keyboard.dismiss}
                  onLoadEnd={() => {
                    inject(`window.havenaSignature && window.havenaSignature(${signaturePreviewKey})`);
                  }}
                />
              ) : (
                <View style={styles.fallback}>
                  {pdfError ? (
                    <Pressable style={styles.secondary} onPress={openPdf}>
                      <Text style={styles.secondaryText}>{t("propertyMgmt.openAgreement")}</Text>
                    </Pressable>
                  ) : (
                    <ActivityIndicator color="#1B4F8A" />
                  )}
                </View>
              )}
            </View>
          </View>
          <View style={styles.toolRow}>
            <Pressable onPress={() => setMethod("draw")} style={[styles.tool, method === "draw" && styles.toolOn]}>
              <Feather name="edit-3" size={sf(14)} color={method === "draw" ? "#FFFFFF" : "#334155"} />
              <Text style={[styles.toolText, method === "draw" && styles.toolTextOn]}>{t("propertyMgmt.signatureTool")}</Text>
            </Pressable>
            <Pressable onPress={() => setMethod("type")} style={[styles.tool, method === "type" && styles.toolOn]}>
              <Feather name="type" size={sf(14)} color={method === "type" ? "#FFFFFF" : "#334155"} />
              <Text style={[styles.toolText, method === "type" && styles.toolTextOn]}>{t("propertyMgmt.typeSignature")}</Text>
            </Pressable>
            <Pressable
              onPress={clearSignature}
              style={styles.tool}
            >
              <Feather name="rotate-ccw" size={sf(14)} color="#334155" />
              <Text style={styles.toolText}>{t("propertyMgmt.clearSignature")}</Text>
            </Pressable>
          </View>
          {method === "draw" ? (
            <View style={styles.padWrap}>
              <SignaturePad
                strokes={strokes}
                onCommit={commitStroke}
                hint={t("propertyMgmt.drawHere")}
                height={signPadHeight}
              />
            </View>
          ) : (
            <View
              ref={typeBoxRef}
              style={styles.typeLine}
              onLayout={rememberTypeBox}
              onStartShouldSetResponder={() => {
                typeInputRef.current?.focus();
                return false;
              }}
            >
              <LocaleTextInput
                ref={typeInputRef}
                value={typedName}
                onChangeText={setTypedName}
                placeholder={t("propertyMgmt.typeSignature")}
                style={typeSignatureText}
                textAlignVertical="center"
                autoCapitalize="words"
              />
            </View>
          )}
          <Pressable style={styles.consentRow} onPress={() => setConsent((value) => !value)}>
            <View style={[styles.box, consent && styles.boxOn]}>
              {consent ? <Feather name="check" size={sf(14)} color="#FFFFFF" /> : null}
            </View>
            <Text style={styles.consentText}>{t("propertyMgmt.signatureConsent")}</Text>
          </Pressable>
          <View style={[styles.footer, footerPad]}>
            <Pressable style={[styles.primary, !canSubmit && styles.disabled]} disabled={!canSubmit} onPress={askSubmit}>
              {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>{t("propertyMgmt.signAndComplete")}</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const typeFontSize = sf(20);
/**
 * Plain object so the text-metrics patch cannot add lineHeight.
 * iOS top-aligns TextInput glyphs when lineHeight is set. The shell centers this line.
 */
const typeSignatureText = {
  width: "100%",
  height: typeFontSize + 8,
  margin: 0,
  paddingTop: Platform.OS === "ios" ? 4 : 0,
  paddingBottom: 0,
  paddingHorizontal: 0,
  fontFamily: Fonts.medium,
  fontSize: typeFontSize,
  color: "#111827",
  includeFontPadding: false,
  textAlignVertical: "center",
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F6F8FB" },
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  progressWrap: { paddingTop: sw(20), paddingHorizontal: sw(24), paddingBottom: sw(18) },
  progress: { flexDirection: "row", alignItems: "flex-start" },
  progressRail: {
    position: "absolute", left: "16.666%", right: "16.666%", height: 2,
  },
  progressRailBase: { ...StyleSheet.absoluteFillObject, backgroundColor: "#E2E8F0", borderRadius: 1 },
  progressRailFill: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: "#1B4F8A", borderRadius: 1 },
  progressStep: { flex: 1, alignItems: "center" },
  progressDot: {
    backgroundColor: "#FFFFFF", borderWidth: 1.5, borderColor: "#D5DEE8",
    alignItems: "center", justifyContent: "center",
  },
  progressDotOn: { backgroundColor: "#1B4F8A", borderColor: "#1B4F8A" },
  progressNum: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(15),
    lineHeight: sf(18),
    height: sf(18),
    color: "#475569",
    textAlign: "center",
    textAlignVertical: "center",
    includeFontPadding: false,
    fontVariant: ["tabular-nums"],
    marginTop: Platform.OS === "ios" ? 1 : 0,
  },
  progressNumOn: { color: "#FFFFFF" },
  progressLabel: {
    marginTop: sw(10), fontFamily: Fonts.medium, fontSize: sf(12), lineHeight: sf(16),
    color: "#94A3B8", textAlign: "center",
  },
  progressLabelOn: { color: "#1B4F8A", fontFamily: Fonts.semiBold },
  web: { flex: 1, backgroundColor: "#F4F7FB" },
  pageBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: sw(6), paddingVertical: sw(8), backgroundColor: "#FFFFFF",
  },
  pageBtn: {
    width: sw(36), height: sw(36), borderRadius: sw(10),
    backgroundColor: "#F4F7FB", alignItems: "center", justifyContent: "center",
  },
  pageLabel: { minWidth: sw(72), textAlign: "center", fontFamily: Fonts.medium, fontSize: sf(13), color: "#334155" },
  pageGap: { width: sw(8) },
  fallback: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: sw(18) },
  error: { color: "#B91C1C", fontFamily: Fonts.regular, fontSize: sf(13), marginHorizontal: sw(16), marginBottom: sw(8) },
  footer: { paddingHorizontal: sw(16), paddingTop: sw(10), gap: sw(8), backgroundColor: "#FFFFFF" },
  footerRow: { flexDirection: "row", gap: sw(8) },
  footerHalf: { flex: 1 },
  signedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(10),
    marginHorizontal: sw(12),
    marginBottom: sw(8),
    padding: sw(10),
    borderRadius: sw(14),
    backgroundColor: "#F0FDFA",
  },
  signedCheck: {
    width: sw(28),
    height: sw(28),
    borderRadius: sw(14),
    backgroundColor: "#0F766E",
    alignItems: "center",
    justifyContent: "center",
  },
  signedBannerTitle: { fontFamily: Fonts.bold, fontSize: sf(14), color: "#115E59" },
  signedBannerBody: { marginTop: 2, fontFamily: Fonts.regular, fontSize: sf(12), lineHeight: sf(16), color: "#0F766E" },
  signedRef: {
    paddingHorizontal: sw(16),
    paddingVertical: sw(6),
    fontFamily: Fonts.medium,
    fontSize: sf(11),
    color: "#64748B",
    backgroundColor: "#FFFFFF",
  },
  primary: {
    flexDirection: "row", backgroundColor: "#1B4F8A", borderRadius: sw(14),
    paddingVertical: sw(14), alignItems: "center", justifyContent: "center", gap: sw(8),
  },
  primaryText: { color: "#FFFFFF", fontFamily: Fonts.bold, fontSize: sf(15) },
  secondary: {
    flexDirection: "row",
    gap: sw(8),
    borderWidth: 1, borderColor: "#D7DEE8", borderRadius: sw(14),
    paddingVertical: sw(13), alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF",
  },
  secondaryText: { color: "#1B4F8A", fontFamily: Fonts.bold, fontSize: sf(15) },
  disabled: { opacity: 0.45 },
  docCard: {
    flex: 1,
    marginHorizontal: sw(12),
    marginTop: sw(4),
    backgroundColor: "#FFFFFF",
    borderRadius: sw(16),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E6EBF1",
    overflow: "hidden",
  },
  docHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    paddingHorizontal: sw(10),
    paddingVertical: sw(6),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E6EBF1",
  },
  pdfBadge: {
    width: sw(32),
    height: sw(32),
    borderRadius: sw(8),
    backgroundColor: "#FEF2F2",
    alignItems: "center",
    justifyContent: "center",
  },
  docHeadText: { flex: 1, minWidth: 0 },
  docTitle: { flex: 1, minWidth: 0, fontFamily: Fonts.semiBold, fontSize: sf(12), color: "#101828" },
  docMeta: { marginTop: 2, fontFamily: Fonts.regular, fontSize: sf(11), color: "#64748B" },
  pageChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(2),
    paddingHorizontal: sw(6),
    paddingVertical: sw(4),
    borderRadius: sw(999),
    backgroundColor: "#F4F7FB",
  },
  pageChipText: { minWidth: sw(64), textAlign: "center", fontFamily: Fonts.semiBold, fontSize: sf(12), color: "#1B4F8A" },
  docToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: sw(8),
    paddingHorizontal: sw(10),
    paddingBottom: sw(8),
  },
  zoomChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    paddingHorizontal: sw(8),
    paddingVertical: sw(4),
    borderRadius: sw(999),
    backgroundColor: "#F4F7FB",
  },
  docStage: { flex: 1, backgroundColor: "#F3F6FA" },
  zoomText: { minWidth: sw(40), textAlign: "center", fontFamily: Fonts.semiBold, fontSize: sf(12), color: "#1B4F8A" },
  toolRow: {
    flexDirection: "row",
    gap: sw(8),
    paddingHorizontal: sw(12),
    paddingTop: sw(6),
  },
  tool: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(6),
    paddingVertical: sw(7),
    borderRadius: sw(999),
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E6EBF1",
  },
  toolOn: { backgroundColor: "#1B4F8A", borderColor: "#1B4F8A" },
  toolText: { fontFamily: Fonts.medium, fontSize: sf(13), color: "#334155" },
  toolTextOn: { color: "#FFFFFF" },
  toolMark: { fontFamily: Fonts.bold, fontSize: sf(13), color: "#334155" },
  padWrap: { marginHorizontal: sw(12), marginTop: sw(8) },
  typeLine: {
    marginHorizontal: sw(12),
    marginTop: sw(8),
    height: sw(48),
    borderWidth: 1,
    borderColor: "#D5DDE8",
    borderRadius: sw(12),
    paddingHorizontal: sw(14),
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
  },
  methods: { flexDirection: "row", gap: sw(8), marginBottom: sw(10) },
  method: { paddingHorizontal: sw(16), paddingVertical: sw(8), borderRadius: sw(999), backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E6EBF1" },
  methodOn: { backgroundColor: "#1B4F8A", borderColor: "#1B4F8A" },
  methodText: { fontFamily: Fonts.medium, fontSize: sf(14), color: "#475569" },
  methodTextOn: { color: "#FFFFFF" },
  canvas: {
    borderRadius: sw(16),
    borderWidth: 1,
    borderColor: "#D5DDE8",
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  baseline: {
    position: "absolute",
    left: sw(18),
    right: sw(18),
    bottom: sw(28),
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E2E8F0",
  },
  canvasHint: {
    position: "absolute",
    alignSelf: "center",
    top: "42%",
    color: "#94A3B8",
    fontFamily: Fonts.regular,
    fontSize: sf(13),
  },
  typeInput: {
    minHeight: sw(88),
    borderWidth: 1,
    borderColor: "#D5DDE8",
    borderRadius: sw(16),
    paddingHorizontal: sw(16),
    paddingVertical: sw(14),
    backgroundColor: "#FFFFFF",
    fontFamily: Fonts.medium,
    fontSize: sf(24),
    color: "#111827",
  },
  placeBlock: { flex: 1, minHeight: 180, marginHorizontal: sw(16), marginTop: sw(8) },
  placeHint: { fontFamily: Fonts.medium, fontSize: sf(13), color: "#475569", marginBottom: sw(8) },
  placeFrame: {
    flex: 1,
    minHeight: 160,
    borderRadius: sw(16),
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#D5DDE8",
    backgroundColor: "#F4F7FB",
  },
  placeWeb: { flex: 1, backgroundColor: "#F4F7FB" },
  clearBtn: { alignSelf: "flex-end", marginTop: sw(6), paddingVertical: sw(2) },
  clear: { color: "#1B4F8A", fontFamily: Fonts.bold, fontSize: sf(14) },
  consentRow: { flexDirection: "row", gap: sw(10), alignItems: "flex-start", marginTop: sw(6), marginHorizontal: sw(16) },
  box: {
    width: sw(22), height: sw(22), borderRadius: sw(6), marginTop: sw(1),
    borderWidth: 1, borderColor: "#CBD5E1", alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF",
  },
  boxOn: { backgroundColor: "#1B4F8A", borderColor: "#1B4F8A" },
  consentText: { flex: 1, fontFamily: Fonts.regular, fontSize: sf(13), color: "#334155", lineHeight: sf(18) },
  successScroll: { paddingHorizontal: sw(20), paddingTop: sw(16), paddingBottom: sw(24), alignItems: "center" },
  successRing: {
    width: sw(84),
    height: sw(84),
    borderRadius: sw(42),
    backgroundColor: "#CCFBF1",
    alignItems: "center",
    justifyContent: "center",
    marginTop: sw(16),
    marginBottom: sw(14),
  },
  successIcon: {
    width: sw(58),
    height: sw(58),
    borderRadius: sw(29),
    backgroundColor: "#0F766E",
    alignItems: "center",
    justifyContent: "center",
  },
  successTitle: { fontFamily: Fonts.bold, fontSize: sf(22), color: "#101828", textAlign: "center" },
  successBody: { fontFamily: Fonts.regular, fontSize: sf(14), lineHeight: sf(21), color: "#64748B", textAlign: "center", marginTop: sw(8), marginBottom: sw(16) },
  successCard: {
    alignSelf: "stretch",
    backgroundColor: "#FFFFFF",
    borderRadius: sw(16),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E6EBF1",
    paddingHorizontal: sw(14),
    paddingTop: sw(14),
    paddingBottom: sw(6),
  },
  successName: { fontFamily: Fonts.bold, fontSize: sf(16), color: "#101828", marginBottom: sw(8) },
  successRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: sw(12),
    paddingVertical: sw(10),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E6EBF1",
  },
  successLabel: { fontFamily: Fonts.regular, fontSize: sf(13), color: "#64748B" },
  successValue: { flex: 1, fontFamily: Fonts.semiBold, fontSize: sf(13), color: "#101828", textAlign: "right" },
  successNote: {
    alignSelf: "stretch",
    flexDirection: "row",
    gap: sw(8),
    alignItems: "flex-start",
    marginTop: sw(12),
    padding: sw(12),
    borderRadius: sw(12),
    backgroundColor: "#F0FDFA",
  },
  successNoteText: { flex: 1, fontFamily: Fonts.regular, fontSize: sf(12), lineHeight: sf(18), color: "#115E59" },
  linkBtn: { alignItems: "center", paddingVertical: sw(6) },
  linkText: { fontFamily: Fonts.semiBold, fontSize: sf(14), color: "#1B4F8A" },
  metaLine: { fontFamily: Fonts.regular, fontSize: sf(13), color: "#64748B", marginTop: sw(4) },
});
