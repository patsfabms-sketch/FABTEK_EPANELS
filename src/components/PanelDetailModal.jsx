import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import QRCode from "qrcode";
import { useApp } from "../context/AppContext";
import {
  panelQrValue,
  siblingBuilds,
  computeBuildStats,
  connectionsForPanel,
  taskProgress,
  unitLabel,
  CONNECT_STAGE_LABEL,
} from "../data/mockData";
import { getPdfBlob } from "../data/pdfStore";
import { Modal, Button, RoleBadge, formatNumber, formatDate } from "./ui";

const SIZE_PRESETS = [
  { label: "Small", inches: 1 },
  { label: "Medium", inches: 1.5 },
  { label: "Large", inches: 2 },
  { label: "X-Large", inches: 3 },
];

// Usable print area on a US Letter sheet with a quarter-inch margin on every
// side — used only to give the user a live estimate of how many stickers
// will land on each physical page. The actual print layout (flex-wrap) fits
// however many really do based on the browser's own pagination, so this is
// informational, not a hard constraint.
const PAGE_USABLE_WIDTH_IN = 8;
const PAGE_USABLE_HEIGHT_IN = 10.5;
const GAP_IN = 0.15;
// Two lines now (Job #/Panel # and Description), not one — see the
// qr-sticker markup in PrintQrModal.
const LABEL_HEIGHT_IN = 0.34;

function formatElapsed(startedAt, now) {
  const mins = Math.max(0, Math.round((now - startedAt) / 60000));
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

// Takes a buildId (not a snapshotted group object) and computes everything
// it shows live from context on every render — so an edit made via
// EditPanelModal (which mutates the shared `panels` array) is reflected
// immediately instead of only after the modal is closed and reopened.
export default function PanelDetailModal({ buildId, onClose, onSelectBuild }) {
  const navigate = useNavigate();
  const { panels, workHistory, activeSessions, employees, pricePerConnection } = useApp();
  const [showPrint, setShowPrint] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [endingSession, setEndingSession] = useState(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const panel = panels.find((p) => p.buildId === buildId);

  // Guard first — a panel can disappear out from under an open modal (it was
  // just deleted), and everything below assumes `panel` exists.
  if (!panel) return null;

  const employeeById = new Map(employees.map((e) => [e.id, e]));
  const tag = `#${panel.id}`;
  const target = connectionsForPanel(panel, pricePerConnection);
  const active = activeSessions
    .filter((s) => s.panel === tag && s.buildId === panel.buildId)
    .map((s) => ({
      ...s,
      employee: employeeById.get(s.employeeId),
      stageProgress: taskProgress(workHistory, tag, s.stage, panel.buildId),
    }));
  const completed = workHistory
    .filter((h) => h.panel === tag && h.buildId === panel.buildId)
    .map((h) => ({ ...h, employee: employeeById.get(h.employeeId) }));

  // Every other build (past or, in principle, future) of this same panel
  // id — how a manager compares "did this job take longer or shorter than
  // last time." Newest first so the build being viewed is easy to spot.
  const builds = siblingBuilds(panels, panel.id)
    .map((b) => ({ build: b, stats: computeBuildStats(workHistory, b) }))
    .sort((a, b) => (b.build.dateAdded || "").localeCompare(a.build.dateAdded || ""));
  const thisBuildStats = computeBuildStats(workHistory, panel);

  return (
    <Modal onClose={onClose} widthClass="max-w-2xl">
      <div className="flex items-start justify-between mb-1">
        <div>
          <h2 className="text-lg font-bold text-ink-900">
            Job #{panel.jobNumber || panel.id}
            {panel.jobNumber && <span className="text-ink-400 font-normal text-sm"> · Panel #{panel.id}</span>}
            {unitLabel(panel) && (
              <span className="ml-2 inline-block rounded-full bg-brand-50 text-brand-700 text-[11px] font-semibold px-2 py-0.5 align-middle">
                {unitLabel(panel)}
              </span>
            )}
          </h2>
          <p className="text-sm text-ink-500 mt-0.5">
            {panel.customer}
            {panel.order ? ` · ${panel.order}` : ""}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="text-ink-400 hover:text-ink-700 text-xl leading-none px-1"
        >
          ×
        </button>
      </div>

      <div className="flex flex-wrap gap-3 my-5">
        <StatBlock label="Connection Target" value={formatNumber(target)} />
        <StatBlock label="Estimate" value={`$${formatNumber(panel.price)}`} />
        <StatBlock label="Active Now" value={active.length} />
        <StatBlock label="Total Hours (this build)" value={thisBuildStats.hours} />
      </div>

      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-semibold text-ink-500 uppercase tracking-wide">Details</p>
        <button onClick={() => setShowEdit(true)} className="text-[11px] font-semibold text-brand-600 hover:text-brand-700">
          Edit
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5 text-[12px]">
        <DetailField label="Date Added" value={formatDate(panel.dateAdded)} />
        <DetailField label="Job Number" value={panel.jobNumber || "—"} />
        <DetailField
          label="PO Number"
          value={panel.poNumber || "Not on file — click Edit to add"}
          muted={!panel.poNumber}
        />
        <DetailField label="Description" value={panel.order || "—"} />
      </div>

      {builds.length > 1 && (
        <>
          <p className="text-[11px] font-semibold text-ink-500 uppercase tracking-wide mb-2">
            Build History — Panel #{panel.id} ({builds.length} builds)
          </p>
          <div className="rounded-lg border border-paper-200 overflow-x-auto mb-5">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-ink-500 border-b border-paper-100 bg-paper-50">
                  <th className="px-3 py-2 font-semibold">Job #</th>
                  <th className="px-3 py-2 font-semibold">Date</th>
                  <th className="px-3 py-2 font-semibold text-right">Hours</th>
                  <th className="px-3 py-2 font-semibold text-right">Connections</th>
                  <th className="px-3 py-2 font-semibold text-right">Sessions</th>
                </tr>
              </thead>
              <tbody>
                {builds.map(({ build, stats }) => {
                  const isCurrent = build.buildId === panel.buildId;
                  return (
                    <tr
                      key={build.buildId}
                      onClick={() => onSelectBuild?.(build.buildId)}
                      className={`border-b border-paper-50 last:border-0 ${
                        onSelectBuild ? "cursor-pointer hover:bg-brand-50/60" : ""
                      } ${isCurrent ? "bg-brand-50/40 font-semibold text-ink-900" : "text-ink-700"}`}
                    >
                      <td className="px-3 py-2">
                        #{build.jobNumber || build.id}
                        {isCurrent && <span className="text-brand-600 font-semibold"> · viewing</span>}
                      </td>
                      <td className="px-3 py-2">{formatDate(build.dateAdded)}</td>
                      <td className="px-3 py-2 text-right">{stats.hours}</td>
                      <td className="px-3 py-2 text-right">{stats.connections || "—"}</td>
                      <td className="px-3 py-2 text-right">{stats.sessions}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="text-[11px] font-semibold text-ink-500 uppercase tracking-wide mb-2">
        Currently scanned in ({active.length})
      </p>
      {active.length === 0 ? (
        <p className="text-xs text-ink-400 mb-5">No one is currently scanned into this panel.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 mb-5">
          {active.map((s) => (
            <div key={s.id} className="rounded-lg border border-paper-200 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={() => s.employee && navigate(`/team/${s.employee.id}`)}
                  className="text-[13px] font-medium text-ink-900 hover:text-brand-600 text-left truncate"
                >
                  {s.employee?.name ?? "Unknown Technician"}
                </button>
                <span className="w-1.5 h-1.5 rounded-full bg-good-500 animate-pulse shrink-0" />
              </div>
              {s.employee && <RoleBadge role={s.employee.role} />}
              <p className="text-[11px] font-semibold text-brand-700 mt-1.5">{s.stage}</p>
              <p className={`text-[11px] mt-0.5 ${now - s.startedAt > 4 * 3600000 ? "text-warn-600 font-semibold" : "text-ink-500"}`}>
                {formatElapsed(s.startedAt, now)} elapsed
                {now - s.startedAt > 4 * 3600000 ? " — looks stuck?" : ""}
              </p>
              <button
                onClick={() => setEndingSession(s)}
                className="text-[11px] font-semibold text-bad-600 hover:text-bad-700 mt-1.5"
              >
                End Session
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] font-semibold text-ink-500 uppercase tracking-wide mb-2 pt-3 border-t border-paper-100">
        Completed work on this panel
      </p>
      {completed.length === 0 ? (
        <p className="text-xs text-ink-400 mb-1">Nothing logged on this panel yet.</p>
      ) : (
        <div className="space-y-1.5 max-h-52 overflow-y-auto scrollbar-thin pr-1">
          {completed.map((h) => (
            <div key={h.id} className="flex items-center justify-between text-[12px]">
              <span className="text-ink-700">
                <span className="font-medium text-ink-900">{h.employee?.name ?? "Unknown"}</span> added{" "}
                <span className="font-semibold">+{h.percentAdded}%</span> to {h.stage ?? "a task"}
                {h.taskCompleted && <span className="text-good-600 font-semibold"> (completed)</span>}
              </span>
              <span className="text-ink-400 shrink-0 ml-2">{h.date}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 pt-4 border-t border-paper-100 flex flex-wrap justify-end gap-2">
        <ViewPdfButton panel={panel} />
        <Button variant="subtle" onClick={() => downloadPanelQr(panel)}>
          <DownloadIcon /> Download QR (PNG)
        </Button>
        <Button variant="subtle" onClick={() => downloadPanelQrSvg(panel)}>
          <DownloadIcon /> Download QR (SVG)
        </Button>
        <Button onClick={() => setShowPrint(true)}>
          <PrinterIcon /> Print QR Code
        </Button>
      </div>

      {showPrint && <PrintQrModal panel={panel} onClose={() => setShowPrint(false)} />}
      {showEdit && (
        <EditPanelModal
          panel={panel}
          onClose={() => setShowEdit(false)}
          onDeleted={() => {
            setShowEdit(false);
            onClose();
          }}
        />
      )}
      {endingSession && (
        <EndSessionModal activeSession={endingSession} now={now} onClose={() => setEndingSession(null)} />
      )}
    </Modal>
  );
}

// Admin correction for a session that's still showing "active" but
// shouldn't be — most commonly a technician who forgot to scan out (see the
// "looks stuck?" hint above). Unlike a technician's own Stop Session screen,
// the runaway elapsed time here is never trusted or pre-filled as the
// answer — the admin enters what was actually worked, or discards the
// session outright with nothing logged if it shouldn't be credited at all.
// Ending it this way is a stopgap for a session that's ALREADY stuck; the
// weekly clock-in/out QR (Team page) is what's meant to catch this going
// forward, since a clock-out scan auto-ends any session the technician
// still has open at that moment using the scan time as the real stop time.
function EndSessionModal({ activeSession, now, onClose }) {
  const { adminEndSession, employees } = useApp();
  const employee = employees.find((e) => e.id === activeSession.employeeId);
  const [hours, setHours] = useState("");
  const [percentAdded, setPercentAdded] = useState("0");
  const [connectionsCredited, setConnectionsCredited] = useState("0");
  const [taskCompleted, setTaskCompleted] = useState(false);
  const rawElapsed = formatElapsed(activeSession.startedAt, now);

  function handleLogAndEnd() {
    adminEndSession(activeSession, {
      hours: Number(hours) || 0,
      percentAdded: Number(percentAdded) || 0,
      connectionsCredited: Number(connectionsCredited) || 0,
      taskCompleted,
    });
    onClose();
  }

  function handleDiscard() {
    adminEndSession(activeSession, { discard: true });
    onClose();
  }

  return (
    <Modal onClose={onClose} widthClass="max-w-sm">
      <h3 className="text-base font-bold text-ink-900 mb-1">End Session</h3>
      <p className="text-[11px] text-ink-500 mb-4">
        {employee?.name ?? "Unknown Technician"} · {activeSession.stage} · Panel {activeSession.panel}
      </p>

      <div className="rounded-lg bg-warn-50 border border-warn-100 px-3 py-2.5 mb-4">
        <p className="text-[11px] text-warn-700">
          Raw elapsed time on this session: <span className="font-semibold">{rawElapsed}</span>. That's almost
          certainly not accurate if they forgot to scan out — enter the real hours worked below (or discard the
          session if nothing should be credited).
        </p>
      </div>

      <label className="text-xs font-semibold text-ink-500">Hours actually worked</label>
      <input
        type="number"
        step="0.1"
        min="0"
        value={hours}
        onChange={(e) => setHours(e.target.value)}
        placeholder="e.g. 2.5"
        className="mt-1 mb-3 w-full rounded-lg border border-paper-200 px-3 py-2 text-sm"
      />

      <label className="text-xs font-semibold text-ink-500">Progress Added (%)</label>
      <input
        type="number"
        step="10"
        min="0"
        max="100"
        value={percentAdded}
        onChange={(e) => setPercentAdded(e.target.value)}
        className="mt-1 mb-3 w-full rounded-lg border border-paper-200 px-3 py-2 text-sm"
      />

      {activeSession.stage === CONNECT_STAGE_LABEL && (
        <>
          <label className="text-xs font-semibold text-ink-500">Connections Credited</label>
          <input
            type="number"
            step="1"
            min="0"
            value={connectionsCredited}
            onChange={(e) => setConnectionsCredited(e.target.value)}
            className="mt-1 mb-3 w-full rounded-lg border border-paper-200 px-3 py-2 text-sm"
          />
        </>
      )}

      <label className="flex items-center gap-2 mb-5 cursor-pointer">
        <input type="checkbox" checked={taskCompleted} onChange={(e) => setTaskCompleted(e.target.checked)} />
        <span className="text-xs font-semibold text-ink-700">Task marked complete</span>
      </label>

      <p className="text-[11px] text-ink-400 mb-4">
        This gets logged as <span className="font-semibold">Flagged</span>, same as anything else corrected
        outside a technician's normal Stop Session screen — visible on their Recent Activity for a second look.
      </p>

      <div className="flex items-center justify-between pt-3 border-t border-paper-100">
        <button onClick={handleDiscard} className="text-[12px] font-semibold text-bad-600 hover:text-bad-700">
          Discard (no hours logged)
        </button>
        <Button onClick={handleLogAndEnd}>Log &amp; End Session</Button>
      </div>
    </Modal>
  );
}

// Full edit for a scheduled panel — every detail an admin might need to
// correct, including its own price-per-connection rate (see the note on
// initialPricePerConnection in mockData.js for why that's locked per panel
// rather than shared) — plus the ability to remove it from the schedule
// entirely.
function EditPanelModal({ panel, onClose, onDeleted }) {
  const { updatePanel, deletePanel } = useApp();
  const [customer, setCustomer] = useState(panel.customer || "");
  const [jobNumber, setJobNumber] = useState(panel.jobNumber || "");
  const [poNumber, setPoNumber] = useState(panel.poNumber || "");
  const [description, setDescription] = useState(panel.order || "");
  const [dateAdded, setDateAdded] = useState(panel.dateAdded || "");
  const [price, setPrice] = useState(String(panel.price ?? ""));
  const [rate, setRate] = useState(String(panel.pricePerConnection ?? ""));
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const priceNum = Number(price);
  const rateNum = Number(rate);
  const previewConnections =
    Number.isFinite(priceNum) && Number.isFinite(rateNum) && rateNum > 0 ? Math.round(priceNum / rateNum) : null;

  function handleSave() {
    updatePanel(panel.buildId, {
      customer: customer.trim() || "Unknown Customer",
      jobNumber: jobNumber.trim(),
      poNumber: poNumber.trim(),
      order: description.trim(),
      dateAdded: dateAdded || panel.dateAdded,
      price: Number.isFinite(priceNum) && priceNum >= 0 ? priceNum : panel.price,
      pricePerConnection: Number.isFinite(rateNum) && rateNum > 0 ? rateNum : panel.pricePerConnection,
    });
    onClose();
  }

  function handleDelete() {
    deletePanel(panel.buildId);
    onDeleted?.();
  }

  if (confirmingDelete) {
    return (
      <Modal onClose={() => setConfirmingDelete(false)} widthClass="max-w-sm">
        <h3 className="text-base font-bold text-ink-900 mb-2">Delete Panel #{panel.id}?</h3>
        <p className="text-sm text-ink-600 mb-1">
          Job #{panel.jobNumber || "—"}
          {panel.customer ? ` · ${panel.customer}` : ""} will be removed from the schedule permanently.
        </p>
        <p className="text-[12px] text-ink-500 mb-5">
          Any hours already logged against it stay on record for reporting, but won't be linked to a panel anymore.
          This can't be undone.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmingDelete(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDelete}>
            Delete Panel
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} widthClass="max-w-sm">
      <h3 className="text-base font-bold text-ink-900 mb-1">Edit Panel Details — #{panel.id}</h3>
      <p className="text-[11px] text-brand-700 mb-4">
        {unitLabel(panel)
          ? `${unitLabel(panel)} — this is one of ${panel.unitCount} identical panels split off the same estimate line. The price/connection rate below applies to this physical unit only.`
          : " "}
      </p>

      <label className="text-xs font-semibold text-ink-500">Customer</label>
      <input
        value={customer}
        onChange={(e) => setCustomer(e.target.value)}
        className="mt-1 mb-3 w-full rounded-lg border border-paper-200 px-3 py-2 text-sm"
      />

      <label className="text-xs font-semibold text-ink-500">Job Number</label>
      <input
        value={jobNumber}
        onChange={(e) => setJobNumber(e.target.value)}
        placeholder="e.g. 8016"
        className="mt-1 mb-3 w-full rounded-lg border border-paper-200 px-3 py-2 text-sm"
      />

      <label className="text-xs font-semibold text-ink-500">PO Number</label>
      <input
        value={poNumber}
        onChange={(e) => setPoNumber(e.target.value)}
        placeholder="Not on the estimate — enter it here"
        className="mt-1 mb-3 w-full rounded-lg border border-paper-200 px-3 py-2 text-sm"
      />

      <label className="text-xs font-semibold text-ink-500">Description</label>
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="mt-1 mb-3 w-full rounded-lg border border-paper-200 px-3 py-2 text-sm"
      />

      <label className="text-xs font-semibold text-ink-500">Date Added</label>
      <input
        type="date"
        value={dateAdded}
        onChange={(e) => setDateAdded(e.target.value)}
        className="mt-1 mb-3 w-full rounded-lg border border-paper-200 px-3 py-2 text-sm"
      />

      <div className="grid grid-cols-2 gap-3 mb-1">
        <div>
          <label className="text-xs font-semibold text-ink-500">Estimate ($)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="mt-1 w-full rounded-lg border border-paper-200 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-ink-500">$ / connection</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-paper-200 px-3 py-2 text-sm"
          />
        </div>
      </div>
      <p className="text-[11px] text-ink-500 mb-5">
        {previewConnections !== null
          ? `= ${formatNumber(previewConnections)} connections at this rate`
          : "Enter an estimate and rate to see connections"}{" "}
        — this rate applies only to this panel, not the shop default.
      </p>

      <div className="flex items-center justify-between pt-3 border-t border-paper-100">
        <button
          onClick={() => setConfirmingDelete(true)}
          className="text-[12px] font-semibold text-bad-600 hover:text-bad-700"
        >
          Delete this panel
        </button>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't load the generated QR code."));
    img.src = src;
  });
}

// Canvas-measures how much of `text` fits in `maxWidth` at ctx's current
// font, truncating with an ellipsis rather than letting a long job
// description run off the edge of the label.
function truncateToWidth(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = `${text.slice(0, mid)}…`;
    if (ctx.measureText(candidate).width <= maxWidth) low = mid;
    else high = mid - 1;
  }
  return `${text.slice(0, low)}…`;
}

// Draws the panel's Job #, Panel #, and Description directly onto the QR
// image itself (not just encoded inside it) — this download is meant to
// leave the app entirely (dropped into thermal-printer label software, a
// shared folder, etc.), so the identifying text needs to travel with the
// picture, not live only in this modal.
async function composeQrLabel(qrDataUrl, panel) {
  const qrImg = await loadImage(qrDataUrl);
  const size = qrImg.width;
  const padding = Math.round(size * 0.05);
  const line1FontPx = Math.round(size * 0.05);
  const line2FontPx = Math.round(size * 0.042);
  const lineGap = Math.round(size * 0.02);
  const textBlockHeight = line1FontPx + lineGap + line2FontPx + padding * 1.5;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size + textBlockHeight;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(qrImg, 0, 0, size, size);

  const maxTextWidth = size - padding * 2;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#111111";

  const line1 = `Job #${panel.jobNumber || "—"}  ·  Panel #${panel.id}${unitLabel(panel) ? `  ·  ${unitLabel(panel)}` : ""}`;
  ctx.font = `bold ${line1FontPx}px Arial, sans-serif`;
  ctx.fillText(truncateToWidth(ctx, line1, maxTextWidth), size / 2, size + padding / 2);

  const line2 = panel.order || panel.customer || "";
  if (line2) {
    ctx.font = `${line2FontPx}px Arial, sans-serif`;
    ctx.fillText(
      truncateToWidth(ctx, line2, maxTextWidth),
      size / 2,
      size + padding / 2 + line1FontPx + lineGap
    );
  }

  return canvas.toDataURL("image/png");
}

// Generates a QR at print-shop resolution, labels it with the panel's
// identifying info, and triggers a browser download — separate from the
// Print flow so a sticker can be dropped straight into thermal-printer
// label software instead of going through this app's own print layout.
async function downloadPanelQr(panel) {
  try {
    const qrDataUrl = await QRCode.toDataURL(panelQrValue(panel), { width: 1024, margin: 1 });
    const labeledDataUrl = await composeQrLabel(qrDataUrl, panel);
    const a = document.createElement("a");
    a.href = labeledDataUrl;
    a.download = `panel-${panel.jobNumber || panel.id}-qr.png`;
    a.click();
  } catch {
    // best-effort — if generation fails there's nothing else useful to do here
  }
}

// Minimal escaping for the two bits of user-entered text (job description /
// customer name) that get interpolated directly into the SVG below as
// element content — enough to keep a stray "&", "<", or quote from breaking
// the markup.
function escapeXml(str) {
  return String(str).replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));
}

// Vector twin of composeQrLabel/downloadPanelQr above, for label software
// that wants art it can rescale without going soft (LabelForge PRO's Image
// import accepts .svg directly, same as .png). Reuses panelQrValue() so the
// PNG and SVG downloads always encode identical panel/job data — only the
// output format differs.
async function composeQrLabelSvg(panel) {
  const rawSvg = await QRCode.toString(panelQrValue(panel), { type: "svg", margin: 1 });
  const viewBoxMatch = rawSvg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  const size = viewBoxMatch ? Number(viewBoxMatch[1]) : 100;
  const innerMatch = rawSvg.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
  const qrInner = innerMatch ? innerMatch[1] : "";

  const padding = size * 0.05;
  const line1FontPx = size * 0.05;
  const line2FontPx = size * 0.042;
  const lineGap = size * 0.02;
  const textBlockHeight = line1FontPx + lineGap + line2FontPx + padding * 1.5;
  const totalHeight = size + textBlockHeight;

  const line1 = escapeXml(
    `Job #${panel.jobNumber || "—"}  ·  Panel #${panel.id}${unitLabel(panel) ? `  ·  ${unitLabel(panel)}` : ""}`
  );
  const line2 = escapeXml(panel.order || panel.customer || "");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${totalHeight}" viewBox="0 0 ${size} ${totalHeight}">
<rect x="0" y="0" width="${size}" height="${totalHeight}" fill="#ffffff"/>
<g>${qrInner}</g>
<text x="${size / 2}" y="${size + padding / 2}" text-anchor="middle" dominant-baseline="hanging" font-family="Arial, sans-serif" font-weight="bold" font-size="${line1FontPx}" fill="#111111">${line1}</text>${
    line2
      ? `\n<text x="${size / 2}" y="${size + padding / 2 + line1FontPx + lineGap}" text-anchor="middle" dominant-baseline="hanging" font-family="Arial, sans-serif" font-size="${line2FontPx}" fill="#111111">${line2}</text>`
      : ""
  }
</svg>`;
}

async function downloadPanelQrSvg(panel) {
  try {
    const svg = await composeQrLabelSvg(panel);
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `panel-${panel.jobNumber || panel.id}-qr.svg`;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    // best-effort — if generation fails there's nothing else useful to do here
  }
}

const PDF_BUTTON_BASE_CLASS =
  "inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-colors";

// The estimate PDF a panel was imported from lives in IndexedDB (see
// data/pdfStore.js), keyed by panel.pdfId — panels only carry that short id,
// not the file itself. This loads the actual Blob as soon as the detail
// view opens (not on click) and turns it into a real <a href> link, so
// clicking it is an ordinary same-tab-click browser navigation.
//
// The previous version opened a blank tab on click (window.open("", "_blank"))
// and filled in its location once the blob finished loading a moment later.
// That gap between opening the tab and navigating it is exactly the pattern
// some browsers' popup/redirect heuristics silently block — the tab opens,
// nothing ever loads into it, and no error surfaces anywhere for the app to
// catch. Pre-loading the blob means the link's href is already resolved
// before the user ever clicks, so there's no delayed navigation for a
// blocker to catch in the first place.
//
// `panel.pdfDataUrl` is also still honored, for any panel saved back when
// PDFs were embedded as data URLs directly (before this fix), so an older
// panel's link keeps working without needing to be re-imported.
function ViewPdfButton({ panel }) {
  const [objectUrl, setObjectUrl] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ready | error | none

  useEffect(() => {
    let cancelled = false;
    let createdUrl = null;
    setObjectUrl(null);

    if (panel.pdfDataUrl) {
      setStatus("ready");
      return undefined;
    }
    if (!panel.pdfId) {
      setStatus("none");
      return undefined;
    }

    setStatus("loading");
    getPdfBlob(panel.pdfId)
      .then((blob) => {
        if (cancelled) return;
        if (!blob) {
          setStatus("error");
          return;
        }
        createdUrl = URL.createObjectURL(blob);
        setObjectUrl(createdUrl);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [panel.pdfId, panel.pdfDataUrl]);

  if (status === "none") {
    return (
      <span
        title="No source PDF on file for this panel (imported from a CSV, or before PDF import was supported)"
        className={`${PDF_BUTTON_BASE_CLASS} bg-transparent text-ink-300 border border-paper-200 cursor-not-allowed`}
      >
        <DocIcon /> View Estimate PDF
      </span>
    );
  }

  if (status === "loading") {
    return (
      <span className={`${PDF_BUTTON_BASE_CLASS} bg-transparent text-ink-400 border border-paper-200`}>
        <DocIcon /> Loading PDF…
      </span>
    );
  }

  if (status === "error") {
    return (
      <span
        title="Couldn't find the saved PDF for this panel — try re-importing this estimate on the Estimates page"
        className={`${PDF_BUTTON_BASE_CLASS} bg-transparent text-bad-600 border border-bad-200`}
      >
        <DocIcon /> Couldn't find saved PDF
      </span>
    );
  }

  return (
    <a
      href={panel.pdfDataUrl || objectUrl}
      target="_blank"
      rel="noreferrer"
      className={`${PDF_BUTTON_BASE_CLASS} bg-transparent text-ink-700 border border-paper-200 hover:bg-paper-100`}
    >
      <DocIcon /> View Estimate PDF
    </a>
  );
}

function StatBlock({ label, value }) {
  return (
    <div className="flex-1 min-w-[130px] rounded-lg bg-paper-50 border border-paper-200 px-3 py-2.5">
      <p className="text-[11px] font-medium text-ink-500">{label}</p>
      <p className="text-lg font-bold text-ink-900 mt-0.5">{value}</p>
    </div>
  );
}

function DetailField({ label, value, muted = false }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-ink-500 uppercase tracking-wide">{label}</p>
      <p className={`mt-0.5 truncate ${muted ? "text-ink-400 italic" : "text-ink-900 font-medium"}`} title={value}>
        {value}
      </p>
    </div>
  );
}

function PrintQrModal({ panel, onClose }) {
  const value = useMemo(() => panelQrValue(panel), [panel]);
  const [sizeIn, setSizeIn] = useState(1.5);
  const [quantity, setQuantity] = useState(12);
  const [dataUrl, setDataUrl] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setDataUrl(null);
    QRCode.toDataURL(value, { width: 512, margin: 1 })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't generate the QR code. Try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  const perRow = Math.max(1, Math.floor((PAGE_USABLE_WIDTH_IN + GAP_IN) / (sizeIn + GAP_IN)));
  const rowHeight = sizeIn + LABEL_HEIGHT_IN + GAP_IN;
  const rows = Math.ceil(quantity / perRow);
  const rowsPerSheet = Math.max(1, Math.floor((PAGE_USABLE_HEIGHT_IN + GAP_IN) / rowHeight));
  const sheets = Math.max(1, Math.ceil(rows / rowsPerSheet));

  function handleSizePreset(inches) {
    setSizeIn(inches);
  }

  function handlePrint() {
    if (!dataUrl) return;
    window.print();
  }

  function handleQuantityChange(e) {
    const n = Math.round(Number(e.target.value));
    if (Number.isFinite(n)) setQuantity(Math.min(200, Math.max(1, n)));
  }

  return (
    <Modal onClose={onClose} widthClass="max-w-md">
      <div className="flex items-start justify-between mb-4">
        <h3 className="text-base font-bold text-ink-900">Print QR Code — Panel #{panel.id}</h3>
        <button
          onClick={onClose}
          aria-label="Close"
          className="text-ink-400 hover:text-ink-700 text-xl leading-none px-1"
        >
          ×
        </button>
      </div>

      <div className="flex justify-center mb-2">
        <div className="rounded-lg border border-paper-200 bg-white p-3">
          {dataUrl ? (
            <img src={dataUrl} alt={`QR code for panel ${panel.id}`} width={140} height={140} />
          ) : error ? (
            <p className="text-xs text-bad-600 w-[140px] text-center py-10">{error}</p>
          ) : (
            <div className="w-[140px] h-[140px] flex items-center justify-center text-xs text-ink-400">
              Generating…
            </div>
          )}
        </div>
      </div>
      <p className="text-center text-[12px] font-semibold text-ink-900">
        Job #{panel.jobNumber || "—"} · Panel #{panel.id}
        {unitLabel(panel) && <span className="text-brand-600"> · {unitLabel(panel)}</span>}
      </p>
      {(panel.order || panel.customer) && (
        <p className="text-center text-[11px] text-ink-500 mb-1 truncate">{panel.order || panel.customer}</p>
      )}
      <p className="text-center text-[10px] text-ink-400 mb-5">
        Every sticker printed below includes this Job #, Panel #, and description as text
      </p>

      <label className="text-xs font-semibold text-ink-500">QR code size</label>
      <div className="grid grid-cols-4 gap-2 mt-1.5 mb-3">
        {SIZE_PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => handleSizePreset(p.inches)}
            className={`rounded-lg border px-2 py-2 text-[12px] font-semibold text-center ${
              sizeIn === p.inches
                ? "border-brand-500 bg-brand-50 text-brand-700"
                : "border-paper-200 text-ink-700 hover:border-brand-300"
            }`}
          >
            {p.label}
            <span className="block text-[10px] font-normal text-ink-400">{p.inches}"</span>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 mb-5">
        <label className="text-xs font-semibold text-ink-500 shrink-0">Custom size (inches)</label>
        <input
          type="number"
          min="0.5"
          max="4"
          step="0.25"
          value={sizeIn}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) setSizeIn(Math.min(4, Math.max(0.5, n)));
          }}
          className="w-20 rounded-lg border border-paper-200 px-2 py-1.5 text-sm"
        />
      </div>

      <label className="text-xs font-semibold text-ink-500">How many to print</label>
      <input
        type="number"
        min="1"
        max="200"
        value={quantity}
        onChange={handleQuantityChange}
        className="mt-1.5 w-full rounded-lg border border-paper-200 px-3 py-2 text-sm"
      />
      <p className="text-[11px] text-ink-500 mt-2 mb-5">
        About {perRow} per row · {rows} row{rows === 1 ? "" : "s"} · roughly {sheets} sheet
        {sheets === 1 ? "" : "s"} of paper at this size.
      </p>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="subtle" onClick={() => downloadPanelQr(panel)} disabled={!dataUrl}>
          <DownloadIcon /> PNG
        </Button>
        <Button variant="subtle" onClick={() => downloadPanelQrSvg(panel)} disabled={!dataUrl}>
          <DownloadIcon /> SVG
        </Button>
        <Button onClick={handlePrint} disabled={!dataUrl}>
          <PrinterIcon /> Print
        </Button>
      </div>

      {dataUrl &&
        createPortal(
          <div id="qr-print-area">
            <style>{`
              #qr-print-area { display: none; }
              @media print {
                body > #root { display: none !important; }
                #qr-print-area {
                  display: flex;
                  flex-wrap: wrap;
                  align-content: flex-start;
                  gap: ${GAP_IN}in;
                  padding: 0.25in;
                }
                #qr-print-area .qr-sticker {
                  width: ${sizeIn}in;
                  break-inside: avoid;
                  page-break-inside: avoid;
                }
                #qr-print-area .qr-sticker img {
                  width: ${sizeIn}in;
                  height: ${sizeIn}in;
                  display: block;
                }
                #qr-print-area .qr-sticker p {
                  font-size: 7pt;
                  text-align: center;
                  margin: 2pt 0 0;
                  color: #000;
                  white-space: nowrap;
                  overflow: hidden;
                  text-overflow: ellipsis;
                  width: ${sizeIn}in;
                }
                #qr-print-area .qr-sticker .qr-line1 {
                  font-weight: 700;
                }
                @page { size: letter; margin: 0; }
              }
            `}</style>
            {Array.from({ length: quantity }).map((_, i) => (
              <div className="qr-sticker" key={i}>
                <img src={dataUrl} alt="" />
                <p className="qr-line1">
                  Job #{panel.jobNumber || "—"} · Panel #{panel.id}
                  {unitLabel(panel) ? ` · ${unitLabel(panel)}` : ""}
                </p>
                {(panel.order || panel.customer) && <p className="qr-line2">{panel.order || panel.customer}</p>}
              </div>
            ))}
          </div>,
          document.body
        )}
    </Modal>
  );
}

function PrinterIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 9V3.5h12V9" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="4" y="9" width="16" height="8" rx="1.5" />
      <path d="M6 14.5h12V20a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5v-5.5Z" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3.5v11.5M12 15l-4-4M12 15l4-4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.5 17.5V19a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M7 3.5h7l4 4v13a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5v-16a.5.5 0 0 1 .5-.5Z" strokeLinejoin="round" />
      <path d="M14 3.5V8h4" strokeLinejoin="round" />
      <path d="M9 12.5h6M9 15.5h6M9 9.5h2" strokeLinecap="round" />
    </svg>
  );
}
