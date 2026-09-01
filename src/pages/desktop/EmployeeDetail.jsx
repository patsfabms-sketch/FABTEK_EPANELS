import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import {
  computeStageStats,
  attainmentTone,
  computeNonProductiveTime,
  ROLES,
} from "../../data/mockData";
import { Card, SectionTitle, StatCard, RoleBadge, formatTimeRange } from "../../components/ui";
import EditWorkHistoryModal from "../../components/EditWorkHistoryModal";

const TONE_ACCENT = {
  good: "text-good-600",
  warn: "text-warn-600",
  bad: "text-bad-600",
};

export default function EmployeeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { employees, roleDefaults, workHistory, panels, clockLog } = useApp();

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

  // Clock in/out history from the shared weekly clock QR (see the "Print
  // This Week's Clock QR" button on the Team page) — most recent first.
  const clockEvents = useMemo(
    () =>
      clockLog
        .filter((c) => c.employeeId === id)
        .slice()
        .sort((a, b) => b.clockedInAt - a.clockedInAt),
    [clockLog, id]
  );
  const openClockEntry = clockEvents.find((c) => !c.clockedOutAt);

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
            {openClockEntry && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-good-600">
                <span className="w-1.5 h-1.5 rounded-full bg-good-500 animate-pulse" />
                Clocked in since{" "}
                {new Date(openClockEntry.clockedInAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </span>
            )}
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

      <SectionTitle
        title="Clock In / Out History"
        subtitle="From the shared weekly clock QR — last 10 events, most recent first"
      />
      <Card padded={false} className="overflow-x-auto mb-8">
        {clockEvents.length === 0 ? (
          <p className="text-xs text-ink-400 text-center py-8">No clock events yet.</p>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-ink-500 border-b border-paper-200">
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Clocked In</th>
                <th className="px-4 py-3 font-semibold">Clocked Out</th>
                <th className="px-4 py-3 font-semibold">Hours</th>
              </tr>
            </thead>
            <tbody>
              {clockEvents.slice(0, 10).map((c, i) => (
                <tr key={c.id} className={`border-b border-paper-100 last:border-0 ${i % 2 === 1 ? "bg-paper-50/60" : ""}`}>
                  <td className="px-4 py-2.5 text-ink-900 font-medium">
                    {new Date(c.clockedInAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  </td>
                  <td className="px-4 py-2.5 text-ink-700">
                    {new Date(c.clockedInAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  </td>
                  <td className="px-4 py-2.5 text-ink-700">
                    {c.clockedOutAt ? (
                      new Date(c.clockedOutAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
                    ) : (
                      <span className="text-good-600 font-semibold">Still clocked in</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-ink-700">{c.hours != null ? c.hours : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

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
                  <td className="px-4 py-2.5 text-ink-900 font-medium">
                    {h.date}
                    <div className="text-[10px] text-ink-400 font-normal">{formatTimeRange(h.startedAt, h.endedAt)}</div>
                  </td>
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
