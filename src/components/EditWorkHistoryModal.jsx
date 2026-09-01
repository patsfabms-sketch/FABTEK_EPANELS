import { useMemo, useState } from "react";
import { useApp } from "../context/AppContext";
import { productionStages, CONNECT_STAGE_LABEL } from "../data/mockData";
import { Modal, Button } from "./ui";

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
  const { updateWorkHistoryEntry, deleteWorkHistoryEntry } = useApp();
  const [date, setDate] = useState(entry.date || "");
  const [stage, setStage] = useState(entry.stage || "");
  const [hours, setHours] = useState(String(entry.hours ?? ""));
  const [percentAdded, setPercentAdded] = useState(String(entry.percentAdded ?? 0));
  const [taskCompleted, setTaskCompleted] = useState(!!entry.taskCompleted);
  const [connectionsCredited, setConnectionsCredited] = useState(String(entry.connectionsCredited ?? 0));
  const [status, setStatus] = useState(entry.status || "Verified");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // The stage dropdown is built from the current list of production stages —
  // but if this entry's stage is an older/renamed one that's no longer in
  // that list, keep it as a selectable option so opening the modal doesn't
  // silently change it out from under the admin.
  const stageOptions = useMemo(() => {
    const labels = productionStages.map((s) => s.label);
    return entry.stage && !labels.includes(entry.stage) ? [entry.stage, ...labels] : labels;
  }, [entry.stage]);

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
            max="100"
            value={percentAdded}
            onChange={(e) => setPercentAdded(e.target.value)}
            className="mt-1 w-full rounded-lg border border-paper-200 px-3 py-2 text-sm"
          />
        </div>
      </div>

      {stage === CONNECT_STAGE_LABEL && (
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
