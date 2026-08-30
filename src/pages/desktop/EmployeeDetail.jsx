import { useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { computeStageStats, attainmentTone } from "../../data/mockData";
import { Card, SectionTitle, StatCard, RoleBadge } from "../../components/ui";

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
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
