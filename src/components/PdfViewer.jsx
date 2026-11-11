import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 8;
const MAX_CANVAS_PIXELS = 12_000_000; // iPad Safari silently blanks canvases much larger than ~16M px
const clampZoom = (z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

// Renders every page of a PDF onto canvases. Built for wiring drawings on a
// tablet: pinch with two fingers to zoom (the point between your fingers
// stays put), drag with one finger to pan, double-tap to zoom in / back to
// fit. On a PC: Ctrl+scroll or the +/- buttons to zoom, drag or scroll to pan.
// A pin that stays the same on-screen size at every zoom level.
function Pin({ marker, onTap }) {
  const tone = marker.tone === "warn" ? { bg: "bg-warn-500", ring: "bg-warn-500/40", tag: "bg-warn-500" } : { bg: "bg-bad-500", ring: "bg-bad-500/40", tag: "bg-bad-500" };
  return (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onTap?.(marker);
      }}
      className="absolute z-10 [touch-action:manipulation]"
      style={{ left: `${marker.x * 100}%`, top: `${marker.y * 100}%`, transform: "translate(-50%, -50%)" }}
      aria-label={marker.label}
    >
      <span className={`absolute inset-0 -m-3 rounded-full ${tone.ring} animate-ping`} />
      <span className={`relative flex items-center justify-center w-9 h-9 rounded-full border-[3px] border-white shadow-popover ${tone.bg} text-white text-[18px] font-black leading-none`}>!</span>
      <span className={`absolute left-full top-1/2 -translate-y-1/2 ml-1.5 whitespace-nowrap rounded-md ${tone.tag} text-white text-[12px] font-bold px-2 py-1 shadow-popover`}>
        {marker.label}
      </span>
    </button>
  );
}

export default function PdfViewer({ blob, fileName, markers = [], placing = false, onPlace, onMarkerTap }) {
  const [overlays, setOverlays] = useState([]);
  const placingRef = useRef(placing);
  const onPlaceRef = useRef(onPlace);
  placingRef.current = placing;
  onPlaceRef.current = onPlace;
  const scrollRef = useRef(null);
  const pagesRef = useRef(null);
  const docRef = useRef(null);
  const zoomRef = useRef(1);
  const pendingScrollRef = useRef(null);
  const overlaysRef = useRef([]);
  overlaysRef.current = overlays;
  const [zoom, setZoomState] = useState(1);
  const [state, setState] = useState({ status: "loading", pages: 0, error: null });
  const gesture = useRef({ pointers: new Map(), startDist: 0, startZoom: 1, ratio: 1, center: null, lastTap: 0, dragging: null });

  const setZoom = useCallback((z, anchor) => {
    const next = clampZoom(z);
    const el = scrollRef.current;
    if (el && next !== zoomRef.current) {
      // Keep the point under `anchor` (viewport coords; default = middle of the
      // viewer) fixed on screen after the pages re-render at the new size.
      const rect = el.getBoundingClientRect();
      const ax = anchor ? anchor.x - rect.left : rect.width / 2;
      const ay = anchor ? anchor.y - rect.top : rect.height / 2;
      const ratio = next / zoomRef.current;
      pendingScrollRef.current = { left: (el.scrollLeft + ax) * ratio - ax, top: (el.scrollTop + ay) * ratio - ay };
    }
    zoomRef.current = next;
    setZoomState(next);
  }, []);

  // Load the document.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const buf = await blob.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ data: buf }).promise;
        if (cancelled) return doc.destroy();
        docRef.current = doc;
        setState({ status: "ready", pages: doc.numPages, error: null });
      } catch (e) {
        if (!cancelled) setState({ status: "error", pages: 0, error: e.message || String(e) });
      }
    })();
    return () => {
      cancelled = true;
      docRef.current?.destroy?.();
      docRef.current = null;
    };
  }, [blob]);

  // (Re)draw all pages whenever the zoom changes. Canvases are created at their
  // final size first and swapped in together, so the scroll position can be
  // restored straight away; the drawing then fills in page by page.
  useEffect(() => {
    const doc = docRef.current;
    const host = pagesRef.current;
    const scroller = scrollRef.current;
    if (state.status !== "ready" || !doc || !host || !scroller) return;
    let cancelled = false;
    const tasks = [];
    (async () => {
      const width = Math.max(300, scroller.clientWidth - 8);
      const items = [];
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        const scale = (width / base.width) * zoom;
        const viewport = page.getViewport({ scale });
        let dpr = Math.min(window.devicePixelRatio || 1, 2);
        const px = viewport.width * viewport.height * dpr * dpr;
        if (px > MAX_CANVAS_PIXELS) dpr = Math.max(0.5, Math.sqrt(MAX_CANVAS_PIXELS / (viewport.width * viewport.height)));
        const wrap = document.createElement("div");
        wrap.className = "relative mb-3 w-max";
        const overlay = document.createElement("div");
        overlay.className = "absolute inset-0";
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        canvas.className = "bg-white shadow-card border border-paper-200 max-w-none block";
        wrap.append(canvas, overlay);
        items.push({ page, canvas, viewport, dpr, wrap, overlay });
      }
      if (cancelled) return;
      host.replaceChildren(...items.map((i) => i.wrap));
      setOverlays(items.map((i) => i.overlay));
      host.style.transform = "";
      const p = pendingScrollRef.current;
      if (p) {
        scroller.scrollLeft = p.left;
        scroller.scrollTop = p.top;
        pendingScrollRef.current = null;
      }
      for (const { page, canvas, viewport, dpr } of items) {
        if (cancelled) return;
        const task = page.render({ canvasContext: canvas.getContext("2d"), viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null });
        tasks.push(task);
        try {
          await task.promise;
        } catch (e) {
          if (e?.name !== "RenderingCancelledException") throw e;
        }
      }
    })().catch((e) => {
      if (!cancelled) setState((s) => ({ ...s, status: "error", error: e.message || String(e) }));
    });
    return () => {
      cancelled = true;
      tasks.forEach((t) => t.cancel?.());
    };
  }, [state.status, zoom]);

  // ---- touch / mouse gestures ---------------------------------------------
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  const onPointerDown = (e) => {
    const g = gesture.current;
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      /* capture is only a nicety — pinch/pan still work without it */
    }
    if (g.pointers.size === 2) {
      const [a, b] = [...g.pointers.values()];
      g.startDist = dist(a, b);
      g.startZoom = zoomRef.current;
      g.ratio = 1;
      g.center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      g.dragging = null;
    } else if (g.pointers.size === 1) {
      const el = scrollRef.current;
      g.dragging = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop, moved: false, type: e.pointerType };
    }
  };

  const onPointerMove = (e) => {
    const g = gesture.current;
    if (!g.pointers.has(e.pointerId)) return;
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (g.pointers.size === 2 && g.startDist) {
      const [a, b] = [...g.pointers.values()];
      const target = clampZoom(g.startZoom * (dist(a, b) / g.startDist));
      g.ratio = target / g.startZoom;
      g.center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      // Live preview: scale the already-drawn canvases; the crisp re-render
      // happens when the fingers lift.
      const el = scrollRef.current;
      const rect = el.getBoundingClientRect();
      const ox = el.scrollLeft + (g.center.x - rect.left);
      const oy = el.scrollTop + (g.center.y - rect.top);
      pagesRef.current.style.transformOrigin = `${ox}px ${oy}px`;
      pagesRef.current.style.transform = `scale(${g.ratio})`;
    } else if (g.dragging && g.pointers.size === 1 && e.pointerType === "mouse") {
      // Touch panning is native scrolling; the mouse gets click-and-drag.
      const el = scrollRef.current;
      const dx = e.clientX - g.dragging.x;
      const dy = e.clientY - g.dragging.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) g.dragging.moved = true;
      el.scrollLeft = g.dragging.left - dx;
      el.scrollTop = g.dragging.top - dy;
    }
  };

  const endPointer = (e) => {
    const g = gesture.current;
    const wasPinch = g.pointers.size === 2 && g.startDist > 0;
    g.pointers.delete(e.pointerId);
    if (wasPinch) {
      if (Math.abs(g.ratio - 1) > 0.02) {
        // Commit the pinch: re-render at the new zoom, keeping the pinch point fixed.
        pagesRef.current.style.transform = "";
        const el = scrollRef.current;
        const rect = el.getBoundingClientRect();
        const target = clampZoom(g.startZoom * g.ratio);
        const ratio = target / zoomRef.current;
        const ax = g.center.x - rect.left;
        const ay = g.center.y - rect.top;
        pendingScrollRef.current = { left: (el.scrollLeft + ax) * ratio - ax, top: (el.scrollTop + ay) * ratio - ay };
        zoomRef.current = target;
        setZoomState(target);
      } else {
        pagesRef.current.style.transform = "";
      }
      g.startDist = 0;
      g.ratio = 1;
      g.dragging = null;
      return;
    }
    if (g.pointers.size === 0 && g.dragging) {
      // Double-tap / double-click: zoom in on that spot, or back to fit.
      if (!g.dragging.moved && e.type === "pointerup" && placingRef.current) {
        // Placing a marker: the tap's position on whichever page it landed on.
        const hit = overlaysRef.current.findIndex((o) => {
          const r = o.getBoundingClientRect();
          return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        });
        if (hit >= 0) {
          const r = overlaysRef.current[hit].getBoundingClientRect();
          onPlaceRef.current?.({ page: hit + 1, x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height });
        }
      } else if (!g.dragging.moved && e.type === "pointerup") {
        const now = Date.now();
        if (now - g.lastTap < 320) {
          g.lastTap = 0;
          setZoom(zoomRef.current > 1.2 ? 1 : 2.5, { x: e.clientX, y: e.clientY });
        } else {
          g.lastTap = now;
        }
      }
      g.dragging = null;
    }
  };

  // Ctrl/Cmd + wheel zooms (also what a laptop trackpad pinch sends).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom(zoomRef.current * Math.exp(-e.deltaY * 0.002), { x: e.clientX, y: e.clientY });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setZoom]);

  const openInTab = () => {
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const btn = "h-10 min-w-10 px-3 rounded-lg border border-paper-200 bg-white text-[14px] font-semibold text-ink-800 hover:bg-paper-100 active:bg-paper-200 [touch-action:manipulation]";
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <button className={btn} aria-label="Zoom out" onClick={() => setZoom(zoomRef.current / 1.4)}>
          −
        </button>
        <span className="w-14 text-center text-[13px] font-semibold text-ink-700">{Math.round(zoom * 100)}%</span>
        <button className={btn} aria-label="Zoom in" onClick={() => setZoom(zoomRef.current * 1.4)}>
          +
        </button>
        <button className={btn} onClick={() => setZoom(1)}>
          Fit
        </button>
        <button className={`${btn} ml-auto`} onClick={openInTab}>
          Open in new tab
        </button>
        <span className="text-[11px] text-ink-400 basis-full hidden md:block">Pinch or double-tap to zoom · drag to move{fileName ? ` · ${fileName}` : ""}</span>
      </div>
      {state.status === "loading" && <p className="text-sm text-ink-500 py-10 text-center">Loading drawing…</p>}
      {state.status === "error" && <p className="text-sm text-bad-600 py-10 text-center">Couldn't open this drawing: {state.error}</p>}
      <div
        ref={scrollRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        className={`overflow-auto max-h-[calc(100dvh-14rem)] min-h-[320px] rounded-lg bg-paper-100 p-1 ${placing ? "cursor-crosshair ring-4 ring-bad-500/60" : "cursor-grab active:cursor-grabbing"} [touch-action:pan-x_pan-y] [overscroll-behavior:contain]`}
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div ref={pagesRef} className="w-max" />
        {overlays.map((node, i) =>
          createPortal(
            markers.filter((m) => m.page === i + 1).map((m) => <Pin key={m.id} marker={m} onTap={onMarkerTap} />),
            node,
            `ov-${i}`
          )
        )}
      </div>
    </div>
  );
}
