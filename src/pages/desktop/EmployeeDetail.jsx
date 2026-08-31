import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import {
  computeStageStats,
  attainmentTone,
  productionStages,
  CONNECT_STAGE_LABEL,
  computeNonProductiveTime,
  ROLES,
} from "../../data/mockData";
import { Card, SectionTitle, StatCard, RoleBadge, Modal, Button } from "../../components/ui";

const TONE_ACCENT = {
  good: "text-good-600",
  warn: "text-warn-600",
  bad: "text-bad-600",
};

export default function EmployeeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { employees, roleDefaults, workHistory, panels } = useApp();

  const employee = employees.find((e) => e.id === id);
  const [editingEntry, setEditingEntry] = useState(null);
  // A panel id can have more than one build on file (see the "repeat panel
  // builds" note in mockData.js) — this resolves each history row's buildId
  // back to a job number so entries against the same panel don't look
  // identical when they were actually different jobs.
  const jobNumberByBuildId = useMemo(() => new Map(panels.map((p) => [p.buildId, p.jobNumber])), [panels]);

  // Real output stats computed from this technician's actual logged
  // sessions — stages they haven't worked simply don't appear.
  const breakdown = useMemo(
    () => (employee ? computeStageStats(workHistory, employee.id) : []),
    [employee, workHistory]
  );
  const recentActivity = useMemo(
    () => workHistory.filter((h) => h.employeeId === id),
    [workHistory, id]
  );
  const maxSessions = Math.max(...breakdown.map((b) => b.sessions), 1);
  const totalSessions = breakdown.reduce((s, b) => s + b.sessions, 0);
  const totalHours = Number(breakdown.reduce((s, b) => s + b.hours, 0).toFixed(1));

  // Non-productive time — how much of this Panel Technician's fixed
  // 7:00am–4:30pm shift wasn't covered by a logged session, day by day. See
  // computeNonProductiveTime's own comment in mockData.js for why days with
  // zero logged sessions (a day off, before they were hired, etc.) are left
  // out rather than counted as a full idle shift. Leads aren't on this fixed
  // shift window, so the section is skipped for them entirely.
  const nonProductiveDays = useMemo(
    () => (employee?.role === ROLES.TECH ? computeNonProductiveTime(workHistory, employee.id) : []),
    [employee, workHistory]
  );
  const recentNonProductiveDays = nonProductiveDays.slice(0, 7);
  const recentNonProductiveTotal = Number(recentNonProductiveDays.reduce((s, d) => s + d.nonProductiveHours, 0).toFixed(1));
  const recentCapacityTotal = Number(recentNonProductiveDays.reduce((s, d) => s + d.capacityHours, 0).toFixed(1));
  const recentNonProductivePct =
    recentCapacityTotal > 0 ? Math.round((recentNonProductiveTotal / recentCapacityTotal) * 100) : 0;
  const maxNonProductiveHours = Math.max(...recentNonProductiveDays.map((d) => d.nonProductiveHours), 1);

  if (!employee) {
    return (
      <div className="p-6 max-w-[1100px] mx-auto">
        <p className="text-sm text-ink-500">Technician not found.</p>
        <button onClick={() => navigate("/team")} className="text-sm font-semibold text-brand-600 hover:text-brand-700 mt-2">
          ← Back to Team
        </button>
      </div>
    );
  }

  const target = employee.override ?? roleDefaults[employee.role].daily;

  return (
    <div className="p-6 max-w-[1100px] mx-auto">
      <button onClick={() => navigate("/team")} className="text-[13px] font-semibold text-brand-600 hover:text-brand-700 mb-4">
        ← Back to Team
      </button>

      <div className="flex items-center gap-4 mb-6">
        <div className="w-14 h-14 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center text-lg font-bold shrink-0">
          {employee.name.split(" ").map((n) => n[0]).join("")}
        </div>
        <div>
          <h1 className="text-xl font-bold text-ink-900">{employee.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <RoleBadge role={employee.role} />
            <span className="text-xs text-ink-500">
              {employee.station} · Panel {employee.panel ?? "unassigned"}
            </span>
          </div>
          <p className="text-[11px] text-ink-500 mt-1">
            @{employee.username}
            {employee.payRate != null ? ` · $${employee.payRate.toFixed(2)}/hr` : ""}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 mb-6">
        <StatCard label="Current Week Avg" value={`${employee.currentWeekAvg} hrs`} />
        <StatCard label="Daily Target" value={`${target} hrs`} sub={employee.override != null ? "Custom override" : "Team default"} />
        <StatCard
          label="Attainment"
          value={`${employee.attainmentPct}%`}
          accent={TONE_ACCENT[attainmentTone(employee.attainmentPct)]}
        />
        <StatCard label="Logged Sessions" value={totalSessions} sub={`${totalHours} hrs across all tasks`} />
      </div>

      <SectionTitle
        title="Output by Task"
        subtitle="Sessions and time logged on each production stage — building, aux panels, routing, rework, and more"
      />
      <Card className="mb-8">
        {breakdown.length === 0 && (
          <p className="text-xs text-ink-400 text-center py-6">
            No task history yet — this technician hasn't logged any sessions.
          </p>
        )}
        <div className="space-y-3.5">
          {breakdown.map((b) => (
            <div key={b.key}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[13px] font-medium text-ink-900">{b.label}</span>
                <span className="text-[11px] text-ink-500">
                  {b.sessions} session{b.sessions === 1 ? "" : "s"} · {b.hours} hrs (avg {b.avgHours} hrs/task) ·{" "}
                  {b.completedTasks} completed
                  {b.key === "connect" && b.totalConnections > 0
                    ? ` · ${b.connectionsPerHour} conn/hr avg`
                    : ""}
                </span>
              </div>
              <div className="h-2 rounded-full bg-paper-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-brand-500"
                  style={{ width: `${(b.sessions / maxSessions) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {employee.role === ROLES.TECH && (
        <>
          <SectionTitle
            title="Non-Productive Time"
            subtitle="Time inside the 7:00am–4:30pm shift not covered by a logged session (paid breaks already excluded) — last 7 tracked workdays"
          />
          <Card className="mb-8">
            {recentNonProductiveDays.length === 0 ? (
              <p className="text-xs text-ink-400 text-center py-6">
                No tracked workdays yet — this shows up once at least one session has been logged on a given day.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-4 mb-5">
                  <StatCard
                    label="Non-Productive"
                    value={`${recentNonProductiveTotal} hrs`}
                    sub={`${recentNonProductivePct}% of shift time`}
                    accent={recentNonProductivePct > 25 ? "text-bad-600" : recentNonProductivePct > 10 ? "text-warn-600" : "text-good-600"}
                  />
                  <StatCard label="Shift Capacity" value={`${recentCapacityTotal} hrs`} sub={`${recentNonProductiveDays.length} workday(s) tracked`} />
                </div>
                <div className="space-y-3.5">
                  {recentNonProductiveDays.map((d) => (
                    <div key={d.dayKey}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[13px] font-medium text-ink-900">{d.label}</span>
                        <span className="text-[11px] text-ink-500">
                          {d.nonProductiveHours} hrs non-productive · {d.loggedHours} hrs logged of {d.capacityHours} hrs shift
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-paper-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-warn-500"
                          style={{ width: `${(d.nonProductiveHours / maxNonProductiveHours) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-ink-400 mt-4 pt-3 border-t border-paper-100">
                  Only days with at least one logged session are shown — a day with no sessions could mean they
                  weren't scheduled to work rather than idle all day, so it's left out instead of guessed at.
                </p>
              </>
            )}
          </Card>
        </>
      )}

      <SectionTitle title="Recent Activity" subtitle="Logged sessions from the technician app" />
      <Card padded={false} className="overflow-x-auto">
        {recentActivity.length === 0 ? (
          <p className="text-xs text-ink-400 text-center py-8">No sessions logged yet for this technician.</p>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-ink-500 border-b border-paper-200">
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Panel</th>
                <th className="px-4 py-3 font-semibold">Task</th>
                <th className="px-4 py-3 font-semibold">Progress Added</th>
                <th className="px-4 py-3 font-semibold">Hours</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {recentActivity.map((h, i) => (
                <tr key={h.id} className={`border-b border-paper-100 last:border-0 ${i % 2 === 1 ? "bg-paper-50/60" : ""}`}>
                  <td className="px-4 py-2.5 text-ink-900 font-medium">{h.date}</td>
                  <td className="px-4 py-2.5 text-ink-600">
                    {h.panel}
                    {jobNumberByBuildId.get(h.buildId) && (
                      <span className="text-ink-400"> · Job #{jobNumberByBuildId.get(h.buildId)}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-ink-600">{h.stage ?? "—"}</td>
                  <td className="px-4 py-2.5 text-ink-700 font-medium">
                    +{h.percentAdded}% {h.taskCompleted && <span className="text-good-600">(completed)</span>}
                  </td>
                  <td className="px-4 py-2.5 text-ink-700">{h.hours}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${
                        h.status === "Verified" ? "bg-good-50 text-good-600" : "bg-bad-50 text-bad-600"
                      }`}
                    >
                      {h.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => setEditingEntry(h)}
                      className="text-[11px] font-semibold text-brand-600 hover:text-brand-700"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {editingEntry && (
        <EditWorkHistoryModal
          entry={editingEntry}
          employeeName={employee.name}
          onClose={() => setEditingEntry(null)}
        />
      )}
    </div>
  );
}

// Admin-only correction tool for a single logged session — for the
// "mishap" cases: wrong stage scanned, hours mistyped, wrong panel,
// progress reported wrong, or an entry that shouldn't exist at all.
// Mirrors EditPanelModal's edit/confirm-delete pattern in PanelDetailModal.jsx.
function EditWorkHistoryModal({ entry, employeeName, onClose }) {
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
