import { useState } from "react";
import { useApp } from "../context/AppContext";
import { LONG_CLOCK_ENTRY_HOURS, clockEntryDurationHours, clockEntryFlagReasons } from "../data/mockData";
import { Modal, Button } from "./ui";

// clockLog timestamps are epoch ms (see fromDbClockLog in AppContext.jsx),
// not ISO strings like workHistory's startedAt/endedAt — same datetime-local
// round-trip idea EditWorkHistoryModal already uses, just working in ms.
function msToDatetimeLocal(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function datetimeLocalToMs(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

// Admin correction tool for one Clock In/Out QR event — for mishaps (a
// technician forgot to scan in or out, or scanned at the wrong time) and for
// resolving a flagged entry: an entry clocked in more than
// LONG_CLOCK_ENTRY_HOURS is flagged purely from its stored times (see
// isClockEntryFlagged in mockData.js), so correcting the times here to
// something under that threshold clears the flag on its own, with no
// separate step needed. Verified is there for the other case — the long
// duration (or the location flag) was real and just needs an admin's
// sign-off rather than a change to the times.
//
// Shared between EmployeeDetail.jsx's Clock In/Out History table and its
// Flagged tab — same modal, same fields, regardless of where an admin opened
// it from. Unlike EditWorkHistoryModal, there's no delete here — editing the
// clock-in/out time is what was asked for; removing an attendance record
// entirely wasn't, so that's left out rather than guessed at.
export default function EditClockEntryModal({ entry, employeeName, onClose }) {
  const { updateClockLogEntry } = useApp();
  const [clockedInTime, setClockedInTime] = useState(msToDatetimeLocal(entry.clockedInAt));
  const [clockedOutTime, setClockedOutTime] = useState(msToDatetimeLocal(entry.clockedOutAt));
  const [verified, setVerified] = useState(!!entry.verified);

  const clockedInMs = datetimeLocalToMs(clockedInTime);
  const clockedOutMs = datetimeLocalToMs(clockedOutTime);
  const previewEntry = { clockedInAt: clockedInMs, clockedOutAt: clockedOutMs, verified: false };
  const previewDurationHours = clockedInMs ? Number(clockEntryDurationHours(previewEntry).toFixed(1)) : null;
  const previewReasons = clockedInMs ? clockEntryFlagReasons(previewEntry) : [];
  const stillOpenNote = clockedInMs && !clockedOutMs;

  function handleSave() {
    if (!clockedInMs) return; // clock-in time is required — nothing to save without it
    updateClockLogEntry(entry.id, {
      clockedInAt: clockedInMs,
      clockedOutAt: clockedOutMs,
      verified,
    });
    onClose();
  }

  return (
    <Modal onClose={onClose} widthClass="max-w-sm">
      <h3 className="text-base font-bold text-ink-900 mb-1">Edit Clock In / Out</h3>
      <p className="text-[11px] text-ink-500 mb-4">{employeeName}</p>

      <div className="grid grid-cols-2 gap-3 mb-1">
        <div>
          <label className="text-xs font-semibold text-ink-500">Clocked In</label>
          <input
            type="datetime-local"
            value={clockedInTime}
            onChange={(e) => setClockedInTime(e.target.value)}
            className="mt-1 w-full rounded-lg border border-paper-200 px-2 py-2 text-[13px]"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-ink-500">Clocked Out</label>
          <input
            type="datetime-local"
            value={clockedOutTime}
            onChange={(e) => setClockedOutTime(e.target.value)}
            className="mt-1 w-full rounded-lg border border-paper-200 px-2 py-2 text-[13px]"
          />
        </div>
      </div>
      <p className="text-[11px] text-ink-500 mb-3">
        {clockedInMs
          ? stillOpenNote
            ? `Reads as still clocked in (${previewDurationHours} hrs so far). Clear Clocked Out if that's correct, or fill it in to close the entry out.`
            : `Reads as ${previewDurationHours} hrs clocked in. Clear Clocked Out to reopen this as still clocked in.`
          : "A clock-in time is required."}
      </p>

      {previewReasons.length > 0 && (
        <div
          className={`rounded-lg border px-3 py-2.5 mb-3 ${
            verified ? "bg-brand-50 border-brand-200" : "bg-warn-50 border-warn-200"
          }`}
        >
          <p className={`text-[11px] font-semibold mb-1 ${verified ? "text-brand-700" : "text-warn-700"}`}>
            {verified ? "Verified — will still count as this much" : "Needs review"}
          </p>
          <ul className={`text-[11px] space-y-0.5 list-disc list-inside ${verified ? "text-brand-700" : "text-warn-700"}`}>
            {previewReasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          {!stillOpenNote && previewDurationHours > 24 && (
            <p className={`text-[11px] font-semibold mt-1.5 ${verified ? "text-brand-700" : "text-warn-700"}`}>
              That's over 24 hours straight — double-check Clocked Out has the right DATE, not just the right time
              (easy to leave it on today when the clock-in was actually yesterday or earlier).
            </p>
          )}
        </div>
      )}

      <label className="flex items-start gap-2 mb-5 cursor-pointer">
        <input
          type="checkbox"
          checked={verified}
          onChange={(e) => setVerified(e.target.checked)}
          className="mt-0.5"
        />
        <span className="text-xs">
          <span className="font-semibold text-ink-700">Verified</span>
          <span className="block text-ink-500">
            Confirms a long duration or location flag on this entry is legitimate, without changing the times above
            — the times are still what feeds Payroll and Non-Productive Time, so if the duration shown is actually
            wrong, fix Clocked In/Out instead of (or in addition to) checking this. An entry over{" "}
            {LONG_CLOCK_ENTRY_HOURS} hrs or with a location flag stays on the Flagged tab until this is checked.
          </span>
        </span>
      </label>

      <div className="flex items-center justify-end gap-2 pt-3 border-t border-paper-100">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={!clockedInMs}>
          Save
        </Button>
      </div>
    </Modal>
  );
}
