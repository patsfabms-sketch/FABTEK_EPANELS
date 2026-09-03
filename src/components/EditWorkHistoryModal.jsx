import { useMemo, useState } from "react";
import { useApp } from "../context/AppContext";
import {
  productionStages,
  CONNECT_STAGE_LABEL,
  REWORK_STAGE_LABEL,
  taskProgress,
  connectionsPerHour,
  CONNECTIONS_PER_HOUR_REVIEW_THRESHOLD,
} from "../data/mockData";
import { Modal, Button, formatTimeRange } from "./ui";

// Same sentinel ActiveSession.jsx's Stop Session flow uses for the
// "Attributed to" picker — an explicit "not one person's error" answer,
// distinct from not having picked anything, and stored as a real `null` on
// save either way.
const UNKNOWN_ATTRIBUTION = "unknown";

// datetime-local inputs work in the browser's local time with no timezone
// info in the string ("YYYY-MM-DDTHH:mm") — new Date() on a string like
// that is parsed as local time already, so this round-trips cleanly with
// the ISO strings AppContext stores (startedAt/endedAt).
function isoToDatetimeLocal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function datetimeLocalToIso(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Admin-only correction tool for a single logged session — for the
// "mishap" cases: wrong stage scanned, hours mistyped, wrong panel,
// progress reported wrong, a session that ran way over before it was
// stopped, or an entry that shouldn't exist at all. Mirrors EditPanelModal's
// edit/confirm-delete pattern in PanelDetailModal.jsx.
//
// Shared between EmployeeDetail.jsx (that technician's own history) and
// SessionLog.jsx (every technician's history, in one place) — same modal,
// same fields, same delete confirmation, regardless of where an admin
// found the entry from.
export default function EditWorkHistoryModal({ entry, employeeName, onClose }) {
  const { updateWorkHistoryEntry, deleteWorkHistoryEntry, workHistory, employees } = useApp();
  const [date, setDate] = useState(entry.date || "");
  const [stage, setStage] = useState(entry.stage || "");
  const [hours, setHours] = useState(String(entry.hours ?? ""));
  const [percentAdded, setPercentAdded] = useState(String(entry.percentAdded ?? 0));
  const [taskCompleted, setTaskCompleted] = useState(!!entry.taskCompleted);
  const [connectionsCredited, setConnectionsCredited] = useState(String(entry.connectionsCredited ?? 0));
  const [status, setStatus] = useState(entry.status || "Verified");
  const [startTime, setStartTime] = useState(isoToDatetimeLocal(entry.startedAt));
  const [endTime, setEndTime] = useState(isoToDatetimeLocal(entry.endedAt));
  const [reworkReason, setReworkReason] = useState(entry.reworkReason || "");
  const [reworkRootCause, setReworkRootCause] = useState(entry.reworkRootCause || "");
  const [reworkAttributedTo, setReworkAttributedTo] = useState(
    entry.reworkAttributedToId ?? (entry.stage === REWORK_STAGE_LABEL ? UNKNOWN_ATTRIBUTION : "")
  );
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Rework's three fields only show/apply when the entry's (possibly just-
  // edited) stage is Rework — matches ActiveSession.jsx's Stop Session gate,
  // so an entry corrected INTO Rework here starts asking for them too, and
  // one corrected OUT of Rework stops carrying stale rework details forward.
  const isRework = stage === REWORK_STAGE_LABEL;

  // The stage dropdown is built from the current list of production stages —
  // but if this entry's stage is an older/renamed one that's no longer in
  // that list, keep it as a selectable option so opening the modal doesn't
  // silently change it out from under the admin.
  const stageOptions = useMemo(() => {
    const labels = productionStages.map((s) => s.label);
    return entry.stage && !labels.includes(entry.stage) ? [entry.stage, ...labels] : labels;
  }, [entry.stage]);

  // How much of this (panel, stage, build) task every OTHER logged session
  // already accounts for — recomputed against whichever stage is currently
  // selected, since changing the stage here changes which task this entry's
  // percentAdded counts against. AppContext.updateWorkHistoryEntry enforces
  // this same cap on save regardless, but showing it here means the admin
  // sees the real ceiling instead of being silently capped after the fact.
  const othersProgress = useMemo(
    () => taskProgress(workHistory.filter((h) => h.id !== entry.id), entry.panel, stage, entry.buildId),
    [workHistory, entry.id, entry.panel, entry.buildId, stage]
  );
  const maxPercentAdded = Math.max(0, 100 - othersProgress);

  // Live preview of what this entry's connections/hour rate would be with
  // the values currently typed in — same math AppContext.stopSession uses
  // to auto-flag a session, shown here so an admin correcting an entry can
  // see if they're about to enter something that would itself look like an
  // outlier, even though admin corrections aren't auto-flagged (they're
  // already a deliberate, reviewed action).
  const previewRate =
    stage === CONNECT_STAGE_LABEL ? connectionsPerHour(Number(connectionsCredited), Number(hours)) : null;

  function handleSave() {
    const hoursNum = Number(hours);
    const pctNum = Number(percentAdded);
    const connNum = Number(connectionsCredited);
    updateWorkHistoryEntry(entry.id, {
      date: date.trim() || entry.date,
      stage: stage || entry.stage,
      hours: Number.isFinite(hoursNum) && hoursNum >= 0 ? hoursNum : entry.hours,
      percentAdded: Number.isFinite(pctNum) ? Math.max(0, Math.min(100, pctNum)) : entry.percentAdded,
      taskCompleted,
      connectionsCredited: Number.isFinite(connNum) && connNum >= 0 ? connNum : entry.connectionsCredited,
      status,
      startedAt: datetimeLocalToIso(startTime),
      endedAt: datetimeLocalToIso(endTime),
      reworkReason: isRework ? reworkReason.trim() || null : null,
      reworkRootCause: isRework ? reworkRootCause.trim() || null : null,
      reworkAttributedToId: isRework && reworkAttributedTo && reworkAttributedTo !== UNKNOWN_ATTRIBUTION ? reworkAttributedTo : null,
    });
    onClose();
  }

  function handleDelete() {
    deleteWorkHistoryEntry(entry.id);
    onClose();
  }

  if (confirmingDelete) {
    return (
      <Modal onClose={() => setConfirmingDelete(false)} widthClass="max-w-sm">
        <h3 className="text-base font-bold text-ink-900 mb-2">Delete this session?</h3>
        <p className="text-sm text-ink-600 mb-1">
          {employeeName}'s {(entry.stage || "session").toLowerCase()} entry on {entry.panel} ({entry.date}) will be
          removed from the record entirely.
        </p>
        <p className="text-[12px] text-ink-500 mb-5">
          This can't be undone. If most of the entry is right and only a detail is wrong, Cancel and correct it
          instead of deleting it.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmingDelete(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDelete}>
            Delete Entry
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} widthClass="max-w-sm">
      <h3 className="text-base font-bold text-ink-900 mb-1">Edit Logged Session</h3>
      <p className="text-[11px] text-ink-500 mb-4">
        {employeeName} · {entry.panel}
      </p>

      <label className="text-xs font-semibold text-ink-500">Date</label>
      <input
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="mt-1 mb-3 w-full rounded-lg border border-paper-200 px-3 py-2 text-sm"
      />

      <div className="grid grid-cols-2 gap-3 mb-1">
        <div>
          <label className="text-xs font-semibold text-ink-500">Start Time</label>
          <input
            type="datetime-local"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="mt-1 w-full rounded-lg border border-paper-200 px-2 py-2 text-[13px]"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-ink-500">End Time</label>
          <input
            type="datetime-local"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="mt-1 w-full rounded-lg border border-paper-200 px-2 py-2 text-[13px]"
          />
        </div>
      </div>
      <p className="text-[11px] text-ink-500 mb-3">
        {startTime && endTime
          ? `Currently reads as ${formatTimeRange(datetimeLocalToIso(startTime), datetimeLocalToIso(endTime))}. Clear either field if the real clock time isn't known.`
          : "Not recorded on this entry — fill both in if the real clock-in/clock-out time is known."}
      </p>

      <label className="text-xs font-semibold text-ink-500">Stage / Session Type</label>
      <select
        value={stage}
        onChange={(e) => setStage(e.target.value)}
        className="mt-1 mb-3 w-full rounded-lg border border-paper-200 px-3 py-2 text-sm bg-white"
      >
        {stageOptions.map((label) => (
          <option key={label} value={label}>
            {label}
          </option>
        ))}
      </select>

      {isRework && (
        <div className="rounded-lg bg-paper-50 border border-paper-200 px-3 py-3 mb-3">
          <p className="text-[11px] font-semibold text-ink-700 mb-2">Rework details</p>

          <label className="text-xs font-semibold text-ink-500">What needed to be reworked, and why</label>
          <textarea
            value={reworkReason}
            onChange={(e) => setReworkReason(e.target.value)}
            rows={2}
            placeholder="Not recorded"
            className="mt-1 mb-2 w-full rounded-lg border border-paper-200 px-3 py-2 text-sm resize-none bg-white"
          />

          <label className="text-xs font-semibold text-ink-500">Root cause</label>
          <textarea
            value={reworkRootCause}
            onChange={(e) => setReworkRootCause(e.target.value)}
            rows={2}
            placeholder="Not recorded"
            className="mt-1 mb-2 w-full rounded-lg border border-paper-200 px-3 py-2 text-sm resize-none bg-white"
          />

          <label className="text-xs font-semibold text-ink-500">Attributed to</label>
          <select
            value={reworkAttributedTo}
            onChange={(e) => setReworkAttributedTo(e.target.value)}
            className="mt-1 w-full rounded-lg border border-paper-200 px-3 py-2 text-sm bg-white"
          >
            <option value="">Not recorded</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
            <option value={UNKNOWN_ATTRIBUTION}>Unknown / not one person's error</option>
          </select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="text-xs font-semibold text-ink-500">Hours</label>
          <input
            type="number"
            step="0.1"
            min="0"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            className="mt-1 w-full rounded-lg border border-paper-200 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-ink-500">Progress Added (%)</label>
          <input
            type="number"
            step="10"
            min="0"
            max={maxPercentAdded}
            value={percentAdded}
            onChange={(e) => setPercentAdded(e.target.value)}
            className="mt-1 w-full rounded-lg border border-paper-200 px-3 py-2 text-sm"
          />
        </div>
      </div>
      <p className="text-[11px] text-ink-500 -mt-2 mb-3">
        Up to {maxPercentAdded}% available for this entry
        {othersProgress > 0 ? ` — every other logged session on this task already totals ${othersProgress}%` : ""}.
        Saving a higher value gets capped to this automatically.
      </p>

      {stage === CONNECT_STAGE_LABEL && (
        <>
          <label className="text-xs font-semibold text-ink-500">Connections Credited</label>
          <input
            type="number"
            step="1"
            min="0"
            value={connectionsCredited}
            onChange={(e) => setConnectionsCredited(e.target.value)}
            className="mt-1 mb-1 w-full rounded-lg border border-paper-200 px-3 py-2 text-sm"
          />
          <p className="text-[11px] text-ink-500 mb-3">
            {previewRate !== null ? (
              <span className={previewRate > CONNECTIONS_PER_HOUR_REVIEW_THRESHOLD ? "text-warn-600 font-semibold" : ""}>
                {previewRate} connections/hr at these values
                {previewRate > CONNECTIONS_PER_HOUR_REVIEW_THRESHOLD
                  ? ` — above the ${CONNECTIONS_PER_HOUR_REVIEW_THRESHOLD}/hr review threshold`
                  : ""}
              </span>
            ) : (
              "Enter hours and connections to see the rate this implies"
            )}
          </p>
        </>
      )}

      <label className="flex items-center gap-2 mb-3 cursor-pointer">
        <input type="checkbox" checked={taskCompleted} onChange={(e) => setTaskCompleted(e.target.checked)} />
        <span className="text-xs font-semibold text-ink-700">Task marked complete</span>
      </label>

      <label className="text-xs font-semibold text-ink-500">Status</label>
      <div className="mt-1 mb-5 flex gap-2">
        <button
          onClick={() => setStatus("Verified")}
          className={`flex-1 rounded-lg border px-3 py-2 text-[12px] font-semibold ${
            status === "Verified"
              ? "border-good-500 bg-good-50 text-good-600"
              : "border-paper-200 text-ink-600 hover:border-good-300"
          }`}
        >
          Verified
        </button>
        <button
          onClick={() => setStatus("Flagged")}
          className={`flex-1 rounded-lg border px-3 py-2 text-[12px] font-semibold ${
            status === "Flagged"
              ? "border-bad-500 bg-bad-50 text-bad-600"
              : "border-paper-200 text-ink-600 hover:border-bad-300"
          }`}
        >
          Flagged
        </button>
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-paper-100">
        <button
          onClick={() => setConfirmingDelete(true)}
          className="text-[12px] font-semibold text-bad-600 hover:text-bad-700"
        >
          Delete this entry
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
