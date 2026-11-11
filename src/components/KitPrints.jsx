import { useEffect, useMemo, useRef, useState } from "react";
import PdfViewer from "./PdfViewer";
import { Button } from "./ui";
import { downloadKitFile } from "../data/kitStore";
import { drawingLabel, formatQty, qtyShort } from "../data/kitData";

// Drawing picker + viewer for one kit, with the red "MISSING — on order" pins.
// Pins exist so the people wiring from this print can see at a glance that a
// part is already known to be missing and the supervisor is waiting on it —
// they move on instead of stopping to ask. A pin only shows while its part is
// still missing or short; once the part is received it disappears by itself.
export default function KitPrints({ kit, files, lines = [], markers = [], placingLineId = null, onPlacingChange, onPlace, onRemoveMarker }) {
  const drawings = files.filter((f) => f.kind === "drawing");
  const [activeId, setActiveId] = useState(drawings[0]?.id ?? null);
  const [blobs, setBlobs] = useState({});
  const [error, setError] = useState(null);
  const [openMarker, setOpenMarker] = useState(null);
  const [showParts, setShowParts] = useState(false);
  const rootRef = useRef(null);
  const lastPlacedAt = useRef(0);

  // Starting to mark a part brings the drawing to the top of the screen so
  // nobody has to hunt for it on a small tablet.
  useEffect(() => {
    if (placingLineId) rootRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [placingLineId]);

  const active = drawings.find((d) => d.id === activeId) || drawings[0] || null;
  const outstanding = useMemo(() => lines.filter((l) => l.included && (l.status === "missing" || l.status === "short")), [lines]);
  const lineById = useMemo(() => new Map(lines.map((l) => [l.id, l])), [lines]);
  const placingLine = placingLineId ? lineById.get(placingLineId) : null;

  // Only pins for parts that are still outstanding, on the sheet being viewed.
  const pins = useMemo(
    () =>
      markers
        .filter((m) => m.fileId === active?.id)
        .map((m) => ({ m, l: lineById.get(m.lineId) }))
        .filter(({ l }) => l && l.included && (l.status === "missing" || l.status === "short"))
        .map(({ m, l }) => ({
          id: m.id,
          page: m.page,
          x: m.x,
          y: m.y,
          tone: l.status === "short" ? "warn" : "bad",
          label: `${l.status === "short" ? "SHORT" : "MISSING"} · ${l.pn}`,
          lineId: l.id,
        })),
    [markers, active, lineById]
  );
  const countFor = (lineId) => markers.filter((m) => m.lineId === lineId).length;
  const shownMarker = openMarker ? markers.find((m) => m.id === openMarker) : null;
  const shownLine = shownMarker ? lineById.get(shownMarker.lineId) : null;

  useEffect(() => {
    if (!active || blobs[active.id]) return;
    let cancelled = false;
    downloadKitFile(active.storagePath)
      .then((b) => !cancelled && (setError(null), setBlobs((m) => ({ ...m, [active.id]: b }))))
      .catch((e) => !cancelled && setError(e.message || String(e)));
    return () => {
      cancelled = true;
    };
  }, [active, blobs]);

  if (!drawings.length) {
    return <p className="text-sm text-ink-500 py-8 text-center">No drawings were in this kit's zip.</p>;
  }
  return (
    <div ref={rootRef} className="scroll-mt-2">
      {outstanding.length > 0 && (
        <div className="mb-2 rounded-xl border border-bad-500/50 bg-bad-50 px-3 py-1.5">
          <button onClick={() => setShowParts((v) => !v)} className="flex w-full items-center gap-2 text-left [touch-action:manipulation]">
            <span className="flex-1 text-[12px] font-bold text-bad-600">
              ⚠ {outstanding.length} part{outstanding.length === 1 ? " is" : "s are"} missing / on order — supervisor already knows. Keep going with the next step.
            </span>
            <span className="text-[11px] font-semibold text-bad-600 shrink-0">{showParts ? "Hide ▲" : "Parts ▼"}</span>
          </button>
          {showParts && (
            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
              {outstanding.map((l) => (
                <button
                  key={l.id}
                  onClick={() => onPlacingChange?.(placingLineId === l.id ? null : l.id)}
                  title="Tap, then tap the spot on the drawing where this part goes"
                  className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-left text-[12px] [touch-action:manipulation] ${
                    placingLineId === l.id ? "border-bad-600 bg-bad-500 text-white" : "border-bad-100 bg-white text-ink-800 hover:bg-paper-50"
                  }`}
                >
                  <span className="font-bold">{l.pn}</span>
                  <span className="opacity-80"> · {l.status === "short" ? `short ${formatQty(qtyShort(l))}` : "missing"}</span>
                  <span className="block text-[11px] opacity-80 truncate max-w-[220px]">{l.description}</span>
                  <span className="block text-[11px] font-semibold">{countFor(l.id) > 0 ? `${countFor(l.id)} marked · + add another` : "+ Mark on print"}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {placingLine && (
        <div className="mb-2 flex items-center gap-3 rounded-xl bg-bad-500 text-white px-3 py-1.5">
          <p className="flex-1 text-[13px] font-bold">
            Tap the spot on the drawing where <span className="underline">{placingLine.pn}</span> goes
            
          </p>
          <Button variant="subtle" className="!h-9 shrink-0" onClick={() => onPlacingChange?.(null)}>
            Done
          </Button>
        </div>
      )}

      <div className="flex gap-1.5 mb-2 overflow-x-auto pb-1">
        {drawings.map((d) => (
          <button
            key={d.id}
            onClick={() => setActiveId(d.id)}
            className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg text-[12px] font-semibold border [touch-action:manipulation] ${
              d.id === active?.id ? "bg-brand-500 text-white border-brand-500" : "bg-white text-ink-700 border-paper-200 hover:bg-paper-100"
            }`}
          >
            {drawingLabel(d.fileName, kit.topDescription)}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-bad-600 mb-2">Couldn't load that drawing: {error}</p>}

      <div className="relative">
      {shownMarker && shownLine && (
        <div className="absolute left-2 right-2 top-14 z-30 rounded-xl border-2 border-bad-500 bg-white px-3 py-2.5 flex items-start gap-3 shadow-popover">
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold text-bad-600">
              {shownLine.status === "short" ? "SHORT" : "MISSING"} — {shownLine.pn}
            </p>
            <p className="text-[12px] text-ink-700">{shownLine.description}</p>
            <p className="text-[12px] text-ink-500 mt-0.5">
              Need {formatQty(shownLine.qtyRequired)} {shownLine.unit}, have {formatQty(shownLine.qtyReceived)}. Waiting on this part — the supervisor knows about it. Move on to the next step.
            </p>
          </div>
          <div className="flex gap-1.5 shrink-0">
            {onRemoveMarker && (
              <Button
                variant="ghost"
                className="!h-10"
                onClick={() => {
                  onRemoveMarker(shownMarker.id);
                  setOpenMarker(null);
                }}
              >
                Remove pin
              </Button>
            )}
            <Button variant="subtle" className="!h-10" onClick={() => setOpenMarker(null)}>
              Close
            </Button>
          </div>
        </div>
      )}

      {active && blobs[active.id] ? (
        <PdfViewer
          key={active.id}
          blob={blobs[active.id]}
          fileName={active.fileName}
          markers={pins}
          placing={!!placingLine}
          onPlace={(pos) => {
            lastPlacedAt.current = Date.now();
            onPlace?.(placingLine.id, active.id, pos);
          }}
          // A touch tap places the pin and then the browser's own click lands on it —
          // ignore that echo so the detail card doesn't pop open by itself.
          onMarkerTap={(pin) => Date.now() - lastPlacedAt.current > 800 && setOpenMarker(pin.id)}
        />
      ) : (
        !error && <p className="text-sm text-ink-500 py-10 text-center">Loading drawing…</p>
      )}
      </div>
    </div>
  );
}
