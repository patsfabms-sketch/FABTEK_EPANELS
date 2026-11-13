import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../context/AppContext";
import { Modal, Button } from "./ui";
import { readKitUpload } from "../data/kitZip";
import { createKit } from "../data/kitStore";
import { currentBuilds } from "../data/mockData";
import { formatQty, groupPanelsByRfq, suggestRfqs } from "../data/kitData";
import KitPanelPicker from "./KitPanelPicker";

// Upload a Siemens kit zip: read it, show what was found, let the user
// confirm which panel(s) it belongs to (one kit can be saved to several panels
// at once), then save it to the kit tables.
export default function KitUploadModal({ onClose, onDone, existingKits = [], initialFile = null, initialFiles = null }) {
  const { panels, currentAdmin } = useApp();
  const [stage, setStage] = useState("pick"); // pick | reading | review | saving
  const [error, setError] = useState(null);
  const [kit, setKit] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [progress, setProgress] = useState(null); // { done, total }
  const [dragOver, setDragOver] = useState(false);
  const startedRef = useRef(false);

  const groups = useMemo(() => groupPanelsByRfq(currentBuilds(panels)), [panels]);
  const kitByBuild = useMemo(() => new Map(existingKits.map((k) => [k.buildId, k])), [existingKits]);
  const suggested = useMemo(
    () => (kit ? suggestRfqs({ nameInfo: kit.nameInfo, meta: kit.parsed.meta, kits: existingKits, panels }) : new Set()),
    [kit, existingKits, panels]
  );

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
      // Come in with the likely job already ticked (every unit of it).
      const likely = suggestRfqs({ nameInfo: result.nameInfo, meta: result.parsed.meta, kits: existingKits, panels });
      setSelected(new Set(groups.filter((g) => likely.has(g.rfq)).flatMap((g) => g.units.map((u) => u.buildId))));
      setStage("review");
    } catch (e) {
      setError(e.message || String(e));
      setStage("pick");
    }
  }

  const chosenPanels = useMemo(() => currentBuilds(panels).filter((p) => selected.has(p.buildId)), [panels, selected]);
  const replacing = chosenPanels.filter((p) => kitByBuild.has(p.buildId));
  const stats = kit?.parsed.stats;

  async function save() {
    if (!chosenPanels.length) return;
    setStage("saving");
    setError(null);
    const saved = [];
    try {
      for (const p of chosenPanels) {
        setProgress({ done: saved.length, total: chosenPanels.length });
        await createKit({
          buildId: p.buildId,
          panelId: p.id,
          parsed: kit.parsed,
          sourceFileName: kit.sourceFileName,
          uploadedBy: currentAdmin?.name ?? "Manager",
          files: kit.files,
        });
        saved.push(p.buildId);
      }
      onDone(saved);
    } catch (e) {
      setError(
        (saved.length ? `Saved ${saved.length} of ${chosenPanels.length} before this went wrong, so those are done. ` : "") + (e.message || String(e))
      );
      setProgress(null);
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
            <p className="text-[13px] font-semibold text-ink-900">Which panels is this kit for?</p>
            <p className="text-xs text-ink-500 mb-2">
              Tick every panel it covers — tap a job to select all its units, or tap single units. The same kit is saved to each, and each panel gets its own checklist.
            </p>
            {kit.nameInfo && !groups.some((g) => suggested.has(g.rfq)) && (
              <p className="text-xs text-warn-600 mb-2">The file name points to {kit.nameInfo.panelId}, but no panel with that number is in the app yet — pick it below.</p>
            )}
            <KitPanelPicker groups={groups} selected={selected} onChange={setSelected} kitByBuild={kitByBuild} suggested={suggested} />
          </div>

          {replacing.length > 0 && (
            <p className="text-xs rounded-lg bg-warn-50 border border-warn-100 text-warn-600 p-2.5">
              {replacing.map((p) => p.id).join(", ")} {replacing.length === 1 ? "already has a kit" : "already have kits"}. Saving replaces {replacing.length === 1 ? "it" : "them"} and clears {replacing.length === 1 ? "its" : "their"} check marks.
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
          <Button onClick={save} disabled={!chosenPanels.length || stage === "saving"}>
            {stage === "saving"
              ? progress && progress.total > 1
                ? `Saving ${progress.done + 1} of ${progress.total}…`
                : "Saving…"
              : `${replacing.length ? "Save / replace" : "Save"} kit${chosenPanels.length > 1 ? ` for ${chosenPanels.length} panels` : ""}`}
          </Button>
        )}
      </div>
    </Modal>
  );
}
