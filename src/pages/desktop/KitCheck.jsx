import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { Button, Card, Modal, Tabs, formatDateTime } from "../../components/ui";
import KitPrints from "../../components/KitPrints";
import KitDeleteModal from "../../components/KitDeleteModal";
import {
  addMarker,
  applyLineAction,
  deleteKit,
  downloadKitFile,
  markAllOutstandingReceived,
  markAllPendingGot,
  recordReportGenerated,
  removeMarker,
  saveLineNote,
  setLineIncluded,
  undoLast,
  useKitDetail,
} from "../../data/kitStore";
import {
  KIT_STATUS_LABEL,
  buildReportModel,
  eventsToUndo,
  formatQty,
  kitProgress,
  outstandingLines,
  qtyShort,
  reportToEmail,
} from "../../data/kitData";
import { downloadBlob, downloadReportCsv, downloadReportPdf } from "../../data/kitReport";
import { buildMarkedBomPdf } from "../../data/kitBomPdf";
import { parseBom } from "../../data/kitData";

const STATUS_STYLE = {
  pending: "bg-paper-100 text-ink-500",
  got: "bg-good-50 text-good-600",
  missing: "bg-bad-50 text-bad-600",
  short: "bg-warn-50 text-warn-600",
  received: "bg-brand-50 text-brand-600",
};

const FILTERS = [
  { key: "todo", label: "To check" },
  { key: "all", label: "All" },
  { key: "got", label: "Got it" },
  { key: "out", label: "Missing / short" },
  { key: "received", label: "Received" },
];

export default function KitCheck() {
  const { buildId } = useParams();
  const navigate = useNavigate();
  const { panels, currentAdmin } = useApp();
  const { data, loading, error, reload } = useKitDetail(buildId);
  const [tab, setTab] = useState("check");
  const [filter, setFilter] = useState("todo");
  const [search, setSearch] = useState("");
  const [split, setSplit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [shortFor, setShortFor] = useState(null); // line being marked missing/short
  const [receiveFor, setReceiveFor] = useState(null);
  const [showExcluded, setShowExcluded] = useState(false);
  const [placingLineId, setPlacingLineId] = useState(null);
  const [showDelete, setShowDelete] = useState(false);
  const [bulk, setBulk] = useState(null); // 'got' | 'received' — confirm dialog

  const by = currentAdmin?.name ?? "Manager";
  const panel = panels.find((p) => p.buildId === buildId) || null;
  const lines = useMemo(() => data?.lines ?? [], [data]);
  const events = useMemo(() => data?.events ?? [], [data]);
  const progress = useMemo(() => kitProgress(lines), [lines]);
  const undoBatch = useMemo(() => eventsToUndo(events), [events]);
  const undoLine = undoBatch.length ? lines.find((l) => l.id === undoBatch[0].lineId) : null;

  const flash = useCallback((msg, kind = "ok") => {
    setToast({ msg, kind });
    setTimeout(() => setToast((t) => (t?.msg === msg ? null : t)), 3500);
  }, []);

  // Every write goes through here: one busy flag (no double clicks), errors
  // shown, then a refresh so what's on screen is what's saved.
  const run = useCallback(
    async (fn, okMsg) => {
      if (busy) return;
      setBusy(true);
      try {
        const out = await fn();
        await reload();
        if (okMsg) flash(typeof okMsg === "function" ? okMsg(out) : okMsg);
      } catch (e) {
        await reload();
        flash(e.message || String(e), "err");
      } finally {
        setBusy(false);
      }
    },
    [busy, reload, flash]
  );

  const doGot = (l) => run(() => applyLineAction(l, "got", { by }));
  const doReset = (l) => run(() => applyLineAction(l, "reset", { by }));
  const doUndo = useCallback(
    () =>
      run(
        () => undoLast(events, lines),
        (n) => (n > 1 ? `Undid ${n} lines` : "Undid last action")
      ),
    [run, events, lines]
  );

  // Ctrl/Cmd+Z = Undo (when not typing in a field).
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName || "")) {
        e.preventDefault();
        if (undoBatch.length) doUndo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undoBatch.length, doUndo]);

  if (loading) return <p className="p-8 text-sm text-ink-500">Loading kit…</p>;
  if (error) return <p className="p-8 text-sm text-bad-600">Couldn't load this kit: {error}</p>;
  if (!data) {
    return (
      <div className="p-8">
        <p className="text-sm text-ink-700 mb-3">No kit found for this panel.</p>
        <Link to="/kits" className="text-brand-600 text-sm font-semibold">
          ← Back to kits
        </Link>
      </div>
    );
  }
  const { kit, files, markers = [] } = data;
  const prints = (
    <KitPrints
      kit={kit}
      files={files}
      lines={lines}
      markers={markers}
      placingLineId={placingLineId}
      onPlacingChange={setPlacingLineId}
      onPlace={(lineId, fileId, pos) => run(() => addMarker({ buildId, lineId, fileId, page: pos.page, x: pos.x, y: pos.y, by }), "Marked on the print")}
      onRemoveMarker={(id) => run(() => removeMarker(id), "Pin removed")}
    />
  );
  const markOnPrint = (l) => {
    setPlacingLineId(l.id);
    if (window.innerWidth >= 1024) {
      setSplit(true);
      setTab("check");
    } else {
      setTab("prints");
    }
  };

  const q = search.trim().toLowerCase();
  const visible = lines.filter((l) => {
    if (!showExcluded && !l.included) return false;
    if (showExcluded && l.included) return false;
    if (q && !`${l.pn} ${l.description} ${l.refs} ${l.usedIn}`.toLowerCase().includes(q)) return false;
    if (showExcluded) return true;
    switch (filter) {
      case "todo":
        return l.status === "pending";
      case "got":
        return l.status === "got";
      case "out":
        return l.status === "missing" || l.status === "short";
      case "received":
        return l.status === "received";
      default:
        return true;
    }
  });

  const report = buildReportModel({ kit, panel, lines, preparedBy: by });
  const email = reportToEmail(report);
  const outstanding = outstandingLines(lines);
  const excludedCount = lines.filter((l) => !l.included).length;
  const hasDrawings = files.some((f) => f.kind === "drawing");

  const checklist = (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex rounded-lg border border-paper-200 overflow-hidden bg-white">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => {
                setShowExcluded(false);
                setFilter(f.key);
              }}
              className={`px-3 py-1.5 text-[12px] font-semibold ${!showExcluded && filter === f.key ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-paper-100"}`}
            >
              {f.label}
              {f.key === "todo" && progress.pending > 0 ? ` (${progress.pending})` : ""}
              {f.key === "out" && progress.outstanding > 0 ? ` (${progress.outstanding})` : ""}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search part #, description…"
          className="flex-1 min-w-[160px] max-w-xs rounded-lg border border-paper-200 px-3 py-1.5 text-[13px]"
        />
        {hasDrawings && (
          <Button variant={split ? "primary" : "ghost"} onClick={() => setSplit((s) => !s)}>
            {split ? "Hide prints" : "Show prints beside list"}
          </Button>
        )}
        {progress.pending > 0 && (
          <Button variant="ghost" disabled={busy} onClick={() => setBulk("got")}>
            Got all remaining
          </Button>
        )}
        {progress.outstanding > 0 && (
          <Button variant="ghost" disabled={busy} onClick={() => setBulk("received")}>
            All outstanding received
          </Button>
        )}
      </div>

      <Card padded={false}>
        {visible.length === 0 ? (
          <p className="p-8 text-sm text-ink-500 text-center">
            {showExcluded
              ? "No lines are left off the checklist."
              : filter === "todo" && progress.total > 0
              ? "Everything on the list has been checked."
              : "Nothing matches."}
          </p>
        ) : (
          <ul>
            {visible.map((l) => (
              <LineRow
                key={l.id}
                line={l}
                busy={busy}
                excluded={showExcluded}
                onGot={() => doGot(l)}
                onMissing={() => setShortFor(l)}
                onReset={() => doReset(l)}
                onReceive={() => setReceiveFor(l)}
                onMarkOnPrint={hasDrawings ? () => markOnPrint(l) : null}
                markerCount={markers.filter((m) => m.lineId === l.id).length}
                onToggleIncluded={() => run(() => setLineIncluded(l, !l.included, by), l.included ? "Left off the checklist" : "Added to the checklist")}
                onNote={(note) => run(() => saveLineNote(l, note))}
              />
            ))}
          </ul>
        )}
      </Card>
      {excludedCount > 0 && (
        <button className="mt-3 text-[12px] font-semibold text-brand-600" onClick={() => setShowExcluded((s) => !s)}>
          {showExcluded ? "← Back to the checklist" : `${excludedCount} raw-stock / other lines are left off the checklist — view or add`}
        </button>
      )}
    </div>
  );

  return (
    <div className="p-6 lg:p-8">
      <Link to="/kits" className="text-[12px] font-semibold text-brand-600">
        ← All kits
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3 mt-1 mb-4">
        <div>
          <h1 className="text-xl font-bold text-ink-900">
            Panel {kit.panelId}
            <span className="text-ink-500 font-medium text-sm ml-2">
              SO {kit.soNumber} · Item {kit.itemNumber}
            </span>
          </h1>
          <p className="text-xs text-ink-500 mt-0.5">
            {[kit.topPn, kit.topDescription].filter(Boolean).join(" — ")}
            {panel && ` · ${[panel.jobNumber && `Job ${panel.jobNumber}`, panel.customer].filter(Boolean).join(" · ")}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" className="!text-bad-600" onClick={() => setShowDelete(true)} title="Wrong zip? Remove this kit">
            Delete kit
          </Button>
          <Button variant="ghost" disabled={!undoBatch.length || busy} onClick={doUndo} title="Ctrl+Z">
            ↶ Undo{undoBatch.length > 1 ? ` (${undoBatch.length})` : ""}
          </Button>
        </div>
      </div>
      {undoLine && (
        <p className="text-[11px] text-ink-500 -mt-2 mb-3 text-right">
          Last action: {undoBatch.length > 1 ? `${undoBatch.length} parts` : undoLine.pn} — {undoBatch[0].action === "short" ? "short" : undoBatch[0].action}
        </p>
      )}

      <ProgressBar progress={progress} />

      {kit.bomNotes.length > 0 && (
        <details className="mb-4 rounded-lg border border-paper-200 bg-white px-3 py-2 text-[12px]">
          <summary className="cursor-pointer font-semibold text-ink-700">Siemens build notes ({kit.bomNotes.length})</summary>
          <ul className="list-disc pl-5 mt-1.5 space-y-0.5 text-ink-600">
            {kit.bomNotes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </details>
      )}

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "check", label: "Checklist", badge: progress.pending },
          { key: "report", label: "Missing report", badge: progress.outstanding },
          { key: "prints", label: "Prints", badge: files.filter((f) => f.kind === "drawing").length },
          { key: "files", label: "Files & history" },
        ]}
      />

      {tab === "check" &&
        (split ? (
          <div className="grid lg:grid-cols-2 gap-4 items-start">
            <div>{checklist}</div>
            <div className="lg:sticky lg:top-4">
              {prints}
            </div>
          </div>
        ) : (
          checklist
        ))}

      {tab === "report" && (
        <ReportTab
          report={report}
          email={email}
          files={files}
          lines={lines}
          panel={panel}
          by={by}
          outstanding={outstanding}
          progress={progress}
          kit={kit}
          busy={busy}
          onReceive={setReceiveFor}
          onReceiveAll={() => setBulk("received")}
          onRecord={(format) => run(() => recordReportGenerated(buildId, by, format, kit))}
          flash={flash}
        />
      )}

      {tab === "prints" && prints}

      {tab === "files" && (
        <FilesTab
          files={files}
          events={events}
          lines={lines}
          onDelete={() => setShowDelete(true)}
        />
      )}

      {showDelete && (
        <KitDeleteModal
          kit={kit}
          onClose={() => setShowDelete(false)}
          onConfirm={async () => {
            await deleteKit(buildId);
            navigate("/kits");
          }}
        />
      )}

      {shortFor && (
        <MissingModal
          line={shortFor}
          onClose={() => setShortFor(null)}
          onSave={(qty, note) => {
            const l = shortFor;
            setShortFor(null);
            run(() => applyLineAction(l, "missing", { by, qty, note: note || undefined }), qty > 0 ? "Marked short" : "Marked missing");
          }}
        />
      )}
      {receiveFor && (
        <ReceiveModal
          line={receiveFor}
          onClose={() => setReceiveFor(null)}
          onSave={(qty, at, note) => {
            const l = receiveFor;
            setReceiveFor(null);
            run(() => applyLineAction(l, "receive", { by, qty, at, note: note || undefined }), "Marked received");
          }}
        />
      )}

      {bulk && (
        <BulkConfirmModal
          kind={bulk}
          count={bulk === "got" ? progress.pending : progress.outstanding}
          busy={busy}
          onClose={() => setBulk(null)}
          onConfirm={async () => {
            const kind = bulk;
            setBulk(null);
            await run(
              () => (kind === "got" ? markAllPendingGot(lines, by) : markAllOutstandingReceived(lines, by)),
              (r) =>
                `${kind === "got" ? "Marked" : "Received"} ${r.done} part${r.done === 1 ? "" : "s"}${r.skipped ? ` (${r.skipped} skipped — changed by someone else)` : ""}`
            );
          }}
        />
      )}

      {toast && (
        <div
          className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-40 rounded-lg px-4 py-2.5 text-[13px] font-semibold shadow-popover ${
            toast.kind === "err" ? "bg-bad-500 text-white" : "bg-ink-900 text-white"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function BulkConfirmModal({ kind, count, busy, onClose, onConfirm }) {
  const got = kind === "got";
  return (
    <Modal onClose={onClose} widthClass="max-w-md">
      <h3 className="text-base font-bold text-ink-900">{got ? "Mark everything left as “Got it”?" : "Mark everything outstanding as received?"}</h3>
      <p className="text-[13px] text-ink-700 mt-2">
        {got
          ? `${count} part${count === 1 ? "" : "s"} you haven't checked yet will be marked as got it, with the full quantity.`
          : `${count} missing/short part${count === 1 ? "" : "s"} will be marked as received in full, dated today. Use “Received…” on a single part for a partial delivery or a different date.`}
      </p>
      <p className="text-[12px] text-ink-500 mt-1">You can undo this in one click.</p>
      <div className="flex justify-end gap-2 mt-5">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={busy || count === 0} onClick={onConfirm}>
          {got ? "Yes, got them all" : "Yes, all received"}
        </Button>
      </div>
    </Modal>
  );
}

function ProgressBar({ progress }) {
  const seg = (n, cls) => (n > 0 ? <div className={cls} style={{ width: `${(n / progress.total) * 100}%` }} /> : null);
  return (
    <Card className="mb-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[13px] mb-2">
        <span className="font-semibold text-ink-900">
          {progress.checked} of {progress.total} checked
          {progress.verified && <span className="ml-2 text-good-600">✓ Verified</span>}
        </span>
        <span className="text-good-600">{progress.got} got it</span>
        <span className="text-bad-600">{progress.missing} missing</span>
        <span className="text-warn-600">{progress.short} short</span>
        <span className="text-brand-600">{progress.received} received</span>
        <span className="text-ink-500">{progress.pending} to check</span>
      </div>
      <div className="h-2.5 rounded-full bg-paper-100 overflow-hidden flex gap-[2px]">
        {progress.total > 0 && (
          <>
            {seg(progress.got, "bg-good-500")}
            {seg(progress.received, "bg-brand-500")}
            {seg(progress.short, "bg-warn-500")}
            {seg(progress.missing, "bg-bad-500")}
          </>
        )}
      </div>
    </Card>
  );
}

function LineRow({ line: l, busy, excluded, onGot, onMissing, onReset, onReceive, onMarkOnPrint, markerCount, onToggleIncluded, onNote }) {
  const [editingNote, setEditingNote] = useState(false);
  const [note, setNote] = useState(l.note);
  useEffect(() => setNote(l.note), [l.note]);
  const outstanding = l.status === "missing" || l.status === "short";

  return (
    <li className="px-4 py-3 border-b border-paper-100 last:border-0">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-[14px] text-ink-900">{l.pn}</span>
            <span className={`rounded-full text-[10px] font-bold px-2 py-0.5 ${STATUS_STYLE[l.status]}`}>
              {KIT_STATUS_LABEL[l.status]}
              {l.status === "short" || l.status === "received" ? ` ${formatQty(l.qtyReceived)}/${formatQty(l.qtyRequired)}` : ""}
            </span>
          </div>
          <p className="text-[13px] text-ink-700">{l.description || "—"}</p>
          <p className="text-[11px] text-ink-500 mt-0.5">
            {l.refs && <span className="font-semibold text-ink-600">{l.refs} · </span>}
            {l.usedIn}
          </p>
          {l.note && !editingNote && <p className="text-[11px] text-warn-600 mt-0.5">Note: {l.note}</p>}
        </div>
        <div className="text-right shrink-0">
          <p className="text-[11px] text-ink-500">Need</p>
          <p className="text-lg font-bold text-ink-900 leading-tight">
            {formatQty(l.qtyRequired)} <span className="text-[11px] font-semibold text-ink-500">{l.unit}</span>
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {excluded ? (
            <Button variant="subtle" disabled={busy} onClick={onToggleIncluded}>
              Add to checklist
            </Button>
          ) : (
            <>
              {l.status === "pending" && (
                <>
                  <button
                    disabled={busy}
                    onClick={onGot}
                    title="Got it"
                    className="w-14 h-11 rounded-lg bg-good-500 text-white text-xl font-bold hover:bg-good-600 disabled:opacity-40"
                  >
                    ✓
                  </button>
                  <button
                    disabled={busy}
                    onClick={onMissing}
                    title="Missing or short"
                    className="w-14 h-11 rounded-lg bg-bad-500 text-white text-xl font-bold hover:bg-bad-600 disabled:opacity-40"
                  >
                    ✗
                  </button>
                </>
              )}
              {outstanding && onMarkOnPrint && (
                <Button variant="ghost" disabled={busy} onClick={onMarkOnPrint} title="Drop a red pin on the drawing so the wirers know">
                  {markerCount > 0 ? `On print (${markerCount})` : "Mark on print"}
                </Button>
              )}
              {outstanding && (
                <Button disabled={busy} onClick={onReceive}>
                  Received…
                </Button>
              )}
              {l.status !== "pending" && (
                <Button variant="ghost" disabled={busy} onClick={onReset} title="Put back to not-checked">
                  Reset
                </Button>
              )}
            </>
          )}
        </div>
      </div>
      {!excluded && (
        <div className="mt-1.5 flex items-center gap-3 text-[11px]">
          {editingNote ? (
            <form
              className="flex gap-1.5 flex-1"
              onSubmit={(e) => {
                e.preventDefault();
                setEditingNote(false);
                if (note !== l.note) onNote(note);
              }}
            >
              <input autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for this part…" className="flex-1 rounded border border-paper-200 px-2 py-1 text-[12px]" />
              <Button type="submit" variant="subtle" className="!py-1">
                Save
              </Button>
            </form>
          ) : (
            <>
              <button className="font-semibold text-ink-500 hover:text-ink-900" onClick={() => setEditingNote(true)}>
                {l.note ? "Edit note" : "Add note"}
              </button>
              <button className="font-semibold text-ink-400 hover:text-ink-900" onClick={onToggleIncluded} disabled={busy}>
                Leave off checklist
              </button>
              {l.checkedBy && l.checkedAt && (
                <span className="text-ink-400">
                  checked by {l.checkedBy} · {formatDateTime(l.checkedAt)}
                </span>
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
}

function MissingModal({ line, onClose, onSave }) {
  const [qty, setQty] = useState("0");
  const [note, setNote] = useState("");
  const n = Number(qty);
  const valid = Number.isFinite(n) && n >= 0 && n < line.qtyRequired;
  return (
    <Modal onClose={onClose} widthClass="max-w-md">
      <h3 className="text-base font-bold text-ink-900">Missing or short</h3>
      <p className="text-[13px] text-ink-700 mt-1">
        {line.pn} — {line.description}
      </p>
      <p className="text-xs text-ink-500 mb-4">
        Needed: {formatQty(line.qtyRequired)} {line.unit}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onSave(n, note.trim());
        }}
      >
        <label className="block text-[13px] font-semibold text-ink-900 mb-1">How many {line.unit} do you actually have?</label>
        <input
          autoFocus
          type="number"
          min="0"
          step="any"
          value={qty}
          onFocus={(e) => e.target.select()}
          onChange={(e) => setQty(e.target.value)}
          className="w-full rounded-lg border border-paper-200 px-3 py-2 text-lg font-bold"
        />
        <p className="text-[11px] text-ink-500 mt-1">
          {valid ? (n === 0 ? "None here — will show as Missing." : `${formatQty(line.qtyRequired - n)} short — will show as Short.`) : `Enter 0 to ${formatQty(line.qtyRequired - 1)}. If you have all of them, close this and press ✓ instead.`}
        </p>
        <label className="block text-[13px] font-semibold text-ink-900 mt-3 mb-1">Note (optional)</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-lg border border-paper-200 px-3 py-2 text-[13px]" placeholder="e.g. box was opened, wrong part sent" />
        <div className="flex justify-end gap-2 mt-5">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" disabled={!valid}>
            {n > 0 ? "Mark short" : "Mark missing"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ReceiveModal({ line, onClose, onSave }) {
  const remaining = qtyShort(line);
  const [qty, setQty] = useState(String(remaining));
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const n = Number(qty);
  const valid = Number.isFinite(n) && n > 0;
  return (
    <Modal onClose={onClose} widthClass="max-w-md">
      <h3 className="text-base font-bold text-ink-900">Mark received</h3>
      <p className="text-[13px] text-ink-700 mt-1">
        {line.pn} — {line.description}
      </p>
      <p className="text-xs text-ink-500 mb-4">
        Still outstanding: {formatQty(remaining)} {line.unit} (have {formatQty(line.qtyReceived)} of {formatQty(line.qtyRequired)})
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onSave(n, new Date(`${date}T12:00:00`).toISOString(), note.trim());
        }}
      >
        <label className="block text-[13px] font-semibold text-ink-900 mb-1">How many just arrived?</label>
        <input autoFocus type="number" min="0" step="any" value={qty} onFocus={(e) => e.target.select()} onChange={(e) => setQty(e.target.value)} className="w-full rounded-lg border border-paper-200 px-3 py-2 text-lg font-bold" />
        <p className="text-[11px] text-ink-500 mt-1">{valid ? (n >= remaining ? "That completes this part." : `Still ${formatQty(remaining - n)} outstanding after this.`) : "Enter a quantity above 0."}</p>
        <label className="block text-[13px] font-semibold text-ink-900 mt-3 mb-1">Date received</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-lg border border-paper-200 px-3 py-2 text-[13px]" />
        <label className="block text-[13px] font-semibold text-ink-900 mt-3 mb-1">Note (optional)</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-lg border border-paper-200 px-3 py-2 text-[13px]" placeholder="e.g. tracking #, partial shipment" />
        <div className="flex justify-end gap-2 mt-5">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!valid}>
            Mark received
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ReportTab({ report, email, files, lines, panel, by, outstanding, progress, kit, busy, onReceive, onReceiveAll, onRecord, flash }) {
  const [onlyMarked, setOnlyMarked] = useState(true);
  const [making, setMaking] = useState(false);

  // Siemens' own BOM, same layout they know, with the missing parts
  // highlighted and the quantity written beside each.
  async function downloadMarkedBom() {
    const bomFile = files.find((f) => f.kind === "bom");
    if (!bomFile) {
      flash("This kit has no BOM file stored, so it can't be marked up.", "err");
      return;
    }
    setMaking(true);
    try {
      const parsed = parseBom(await (await downloadKitFile(bomFile.storagePath)).text());
      const { doc } = buildMarkedBomPdf({ rows: parsed.rows, lines, kit, panel, preparedBy: by, onlyMarkedPages: onlyMarked });
      const h = report.header;
      const name = ["BOM_Missing_Parts", h.so && `SO${h.so}`, h.item && `Item${h.item}`, h.panelId && `Panel${h.panelId}`].filter(Boolean).join("_").replace(/[^A-Za-z0-9_-]+/g, "_");
      doc.save(`${name}.pdf`);
      onRecord("marked-bom");
    } catch (e) {
      flash(`Couldn't build the marked-up BOM: ${e.message || e}`, "err");
    } finally {
      setMaking(false);
    }
  }

  async function copyEmail() {
    const text = `Subject: ${email.subject}\n\n${email.body}`;
    try {
      await navigator.clipboard.writeText(text);
      flash("Email text copied");
      onRecord("email-text");
    } catch {
      flash("Couldn't copy automatically — select the text below and copy it.", "err");
    }
  }
  return (
    <div className="space-y-4">
      {progress.pending > 0 && (
        <p className="text-[13px] rounded-lg bg-warn-50 border border-warn-100 text-warn-600 px-3 py-2">
          {progress.pending} part{progress.pending === 1 ? "" : "s"} haven't been checked yet, so they aren't in this report. Finish the checklist first for a complete list.
        </p>
      )}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-semibold text-ink-900">Missing parts report</h3>
            <p className="text-xs text-ink-500">
              {report.summary.outstandingLines} line{report.summary.outstandingLines === 1 ? "" : "s"} · {formatQty(report.summary.outstandingPieces)} pieces to ship
              {kit.reportCount > 0 && ` · generated ${kit.reportCount}× (last ${formatDateTime(kit.reportLastGeneratedAt)})`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <Button disabled={busy || making || outstanding.length === 0} onClick={downloadMarkedBom}>
              {making ? "Building…" : "Marked-up BOM (PDF)"}
            </Button>
            <Button
              variant="ghost"
              disabled={busy || outstanding.length === 0}
              onClick={() => {
                downloadReportPdf(report);
                onRecord("pdf");
              }}
            >
              Summary list (PDF)
            </Button>
            <Button
              variant="ghost"
              disabled={busy || outstanding.length === 0}
              onClick={() => {
                downloadReportCsv(report);
                onRecord("csv");
              }}
            >
              Download CSV
            </Button>
            <Button variant="ghost" disabled={busy || outstanding.length === 0} onClick={copyEmail}>
              Copy email text
            </Button>
            <Button variant="subtle" disabled={busy || outstanding.length === 0} onClick={onReceiveAll}>
              All received
            </Button>
          </div>
        </div>
        <label className="mt-3 flex items-center gap-2 text-[12px] text-ink-600">
          <input type="checkbox" checked={onlyMarked} onChange={(e) => setOnlyMarked(e.target.checked)} />
          Marked-up BOM: only include the BOM pages that have a missing part (uncheck to send the whole BOM)
        </label>
      </Card>

      {outstanding.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-500 text-center py-6">Nothing is missing or short right now.</p>
        </Card>
      ) : (
        <>
          <Card padded={false}>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-ink-500 border-b border-paper-200">
                  <th className="px-4 py-2.5">Part</th>
                  <th className="px-4 py-2.5 text-right">Need</th>
                  <th className="px-4 py-2.5 text-right">Have</th>
                  <th className="px-4 py-2.5 text-right">Short</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {outstanding.map((l) => (
                  <tr key={l.id} className="border-b border-paper-100">
                    <td className="px-4 py-2.5">
                      <p className="font-semibold">{l.pn}</p>
                      <p className="text-[11px] text-ink-500">{l.description}</p>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {formatQty(l.qtyRequired)} {l.unit}
                    </td>
                    <td className="px-4 py-2.5 text-right">{formatQty(l.qtyReceived)}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-bad-600">{formatQty(qtyShort(l))}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Button variant="subtle" disabled={busy} onClick={() => onReceive(l)}>
                        Received…
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card>
            <p className="text-[12px] font-semibold text-ink-700 mb-1">Email text</p>
            <p className="text-[12px] text-ink-500 mb-2">Subject: {email.subject}</p>
            <pre className="whitespace-pre-wrap text-[12px] text-ink-700 bg-paper-50 border border-paper-200 rounded-lg p-3 max-h-72 overflow-auto font-sans">{email.body}</pre>
          </Card>
        </>
      )}
    </div>
  );
}

const ACTION_LABEL = {
  got: "Got it",
  missing: "Missing",
  short: "Short",
  reset: "Reset",
  receive: "Received",
  include: "Added to checklist",
  exclude: "Left off checklist",
  report: "Report generated",
  upload: "Kit uploaded",
};

function FilesTab({ files, events, lines, onDelete }) {
  const byId = new Map(lines.map((l) => [l.id, l]));
  const recent = [...events].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 80);
  const [busyId, setBusyId] = useState(null);
  async function download(f) {
    setBusyId(f.id);
    try {
      downloadBlob(await downloadKitFile(f.storagePath), f.fileName);
    } finally {
      setBusyId(null);
    }
  }
  return (
    <div className="space-y-4">
      <Card>
        <h3 className="text-[15px] font-semibold text-ink-900 mb-2">Files from Siemens</h3>
        <ul className="divide-y divide-paper-100">
          {files.map((f) => (
            <li key={f.id} className="flex items-center justify-between py-2 text-[13px]">
              <span>
                <span className="text-[10px] uppercase font-bold text-ink-400 mr-2">{f.kind}</span>
                {f.fileName}
              </span>
              <Button variant="ghost" disabled={busyId === f.id} onClick={() => download(f)}>
                Download
              </Button>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <h3 className="text-[15px] font-semibold text-ink-900 mb-2">History</h3>
        {recent.length === 0 ? (
          <p className="text-sm text-ink-500">Nothing yet.</p>
        ) : (
          <ul className="divide-y divide-paper-100 text-[12px]">
            {recent.map((e) => {
              const l = e.lineId ? byId.get(e.lineId) : null;
              return (
                <li key={e.id} className={`py-1.5 flex gap-3 ${e.undoneAt ? "text-ink-400 line-through" : "text-ink-700"}`}>
                  <span className="w-36 shrink-0 text-ink-500">{formatDateTime(e.createdAt)}</span>
                  <span className="w-28 shrink-0 font-semibold">{ACTION_LABEL[e.action] || e.action}</span>
                  <span className="flex-1 truncate">{l ? `${l.pn} — ${l.description}` : e.note || ""}</span>
                  <span className="text-ink-500">{e.by}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <div>
        <Button variant="danger" onClick={onDelete}>
          Delete this kit
        </Button>
      </div>
    </div>
  );
}
