import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../context/AppContext";
import { Modal, Button } from "./ui";
import { readKitUpload } from "../data/kitZip";
import { createKit } from "../data/kitStore";
import { findPanelsForKit, formatQty } from "../data/kitData";

// Upload a Siemens kit zip: read it, show what was found, let the user
// confirm which panel it belongs to, then save it to the kit tables.
export default function KitUploadModal({ onClose, onDone, existingBuildIds, initialFile = null, initialFiles = null }) {
  const { panels, currentAdmin } = useApp();
  const [stage, setStage] = useState("pick"); // pick | reading | review | saving
  const [error, setError] = useState(null);
  const [kit, setKit] = useState(null);
  const [buildId, setBuildId] = useState("");
  const [search, setSearch] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const startedRef = useRef(false);

  const matches = useMemo(() => (kit?.nameInfo ? findPanelsForKit(panels, kit.nameInfo.panelId) : []), [kit, panels]);
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return panels
      .filter((p) => `${p.id} ${p.jobNumber} ${p.customer} ${p.order}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [panels, search]);

  // Files dropped onto the Kits page arrive here already chosen.
  useEffect(() => {
    const first = initialFiles?.length ? initialFiles : initialFile ? [initialFile] : null;
    if (first && !startedRef.current) {
      startedRef.current = true;
      onFiles(first);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFile, initialFiles]);

  async function onFiles(fileList) {
    const files = [...(fileList || [])];
    if (!files.length) return;
    setError(null);
    setStage("reading");
    try {
      const result = await readKitUpload(files);
      setKit(result);
      const first = result.nameInfo ? findPanelsForKit(panels, result.nameInfo.panelId)[0] : null;
      setBuildId(first?.buildId ?? "");
      setStage("review");
    } catch (e) {
      setError(e.message || String(e));
      setStage("pick");
    }
  }

  const chosen = panels.find((p) => p.buildId === buildId) || null;
  const replacing = chosen && existingBuildIds.has(chosen.buildId);
  const stats = kit?.parsed.stats;

  async function save() {
    if (!chosen) return;
    setStage("saving");
    setError(null);
    try {
      await createKit({
        buildId: chosen.buildId,
        panelId: chosen.id,
        parsed: kit.parsed,
        sourceFileName: kit.sourceFileName,
        uploadedBy: currentAdmin?.name ?? "Manager",
        files: kit.files,
      });
      onDone(chosen.buildId);
    } catch (e) {
      setError(e.message || String(e));
      setStage("review");
    }
  }

  return (
    <Modal onClose={stage === "saving" ? () => {} : onClose} widthClass="max-w-2xl">
      <h3 className="text-base font-bold text-ink-900">Add a Siemens kit</h3>
      <p className="text-xs text-ink-500 mt-1 mb-4">
        Add the zip Siemens sent for one panel — or drop the files loose: the BOM (.csv), drawings (PDF or DXF), the wire list (Excel) and anything else that goes with it.
      </p>

      {(stage === "pick" || stage === "reading") && (
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (stage === "pick") onFiles(e.dataTransfer.files);
          }}
          className={`block border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
            dragOver ? "border-brand-500 bg-brand-50" : "border-paper-200 hover:border-brand-300"
          }`}
        >
          <input type="file" multiple className="hidden" disabled={stage === "reading"} onChange={(e) => onFiles(e.target.files)} />
          <span className="block text-base font-semibold text-ink-800">{stage === "reading" ? "Reading the files…" : dragOver ? "Drop them here" : "Drag the Siemens .zip or files here"}</span>
          {stage === "pick" && <span className="block text-xs text-ink-500 mt-1">or tap here to choose (zip, PDF, Excel, CSV, DXF — anything)</span>}
        </label>
      )}

      {stage !== "pick" && stage !== "reading" && kit && (
        <div className="space-y-4">
          <div className="rounded-lg bg-paper-50 border border-paper-200 p-3 text-[13px] space-y-1">
            <p>
              <span className="font-semibold">SO {kit.parsed.meta.so} · Item {kit.parsed.meta.item}</span> — {kit.parsed.meta.topDescription}
            </p>
            <p className="text-ink-500">
              {stats.partLines} purchased parts to check ({formatQty(stats.partPieces)} pieces) · {stats.otherLines} raw-stock / other lines left off the checklist ·{" "}
              {kit.files.filter((f) => f.kind === "drawing").length} drawing sheet(s)
            </p>
            {kit.parsed.notes.length > 0 && <p className="text-ink-500">{kit.parsed.notes.length} build note(s) from Siemens will be shown on the checklist.</p>}
            {kit.converted?.length > 0 && (
              <p className="text-good-600">
                Converted {kit.converted.length} DXF drawing{kit.converted.length === 1 ? "" : "s"} to PDF automatically ({kit.converted.map((c) => c.from).join(", ")}). The original DXF file{kit.converted.length === 1 ? " is" : "s are"} kept too.
              </p>
            )}
            {kit.warnings?.map((w) => (
              <p key={w} className="text-warn-600">{w}</p>
            ))}
          </div>

          <div>
            <p className="text-[13px] font-semibold text-ink-900 mb-1.5">Which panel is this kit for?</p>
            {kit.nameInfo && matches.length === 0 && (
              <p className="text-xs text-warn-600 mb-2">No panel {kit.nameInfo.panelId} found in the app yet — search for it below.</p>
            )}
            {matches.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {matches.map((p) => (
                  <label key={p.buildId} className="flex items-center gap-2 text-[13px] rounded-lg border border-paper-200 px-3 py-2 cursor-pointer hover:bg-paper-50">
                    <input type="radio" name="panel" checked={buildId === p.buildId} onChange={() => setBuildId(p.buildId)} />
                    <span className="font-semibold">Panel {p.id}</span>
                    <span className="text-ink-500 truncate">
                      {[p.jobNumber && `Job ${p.jobNumber}`, p.customer].filter(Boolean).join(" · ")}
                    </span>
                  </label>
                ))}
              </div>
            )}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search a different panel (id, job, customer)…"
              className="w-full rounded-lg border border-paper-200 px-3 py-2 text-[13px]"
            />
            {searchResults.length > 0 && (
              <div className="mt-1.5 space-y-1">
                {searchResults.map((p) => (
                  <button
                    key={p.buildId}
                    onClick={() => {
                      setBuildId(p.buildId);
                      setSearch("");
                    }}
                    className="block w-full text-left text-[13px] rounded-lg border border-paper-200 px-3 py-1.5 hover:bg-paper-50"
                  >
                    Panel {p.id} <span className="text-ink-500">· {[p.jobNumber, p.customer].filter(Boolean).join(" · ")}</span>
                  </button>
                ))}
              </div>
            )}
            {chosen && !matches.some((m) => m.buildId === chosen.buildId) && (
              <p className="text-xs text-ink-500 mt-1.5">Selected: Panel {chosen.id}</p>
            )}
          </div>

          {replacing && (
            <p className="text-xs rounded-lg bg-warn-50 border border-warn-100 text-warn-600 p-2.5">
              This panel already has a kit. Saving replaces it and clears its check marks.
            </p>
          )}
        </div>
      )}

      {error && <p className="text-sm text-bad-600 mt-3">{error}</p>}

      <div className="flex justify-end gap-2 mt-5">
        <Button variant="ghost" onClick={onClose} disabled={stage === "saving"}>
          Cancel
        </Button>
        {stage !== "pick" && stage !== "reading" && (
          <Button onClick={save} disabled={!chosen || stage === "saving"}>
            {stage === "saving" ? "Saving…" : replacing ? "Replace kit" : "Save kit"}
          </Button>
        )}
      </div>
    </Modal>
  );
}
