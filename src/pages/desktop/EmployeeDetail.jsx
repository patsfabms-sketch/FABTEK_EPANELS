import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import {
  computeStageStats,
  attainmentTone,
  computeNonProductiveTime,
  computeWeeklyPerformance,
  computeEmployeeInsights,
  ROLES,
} from "../../data/mockData";
import { Card, SectionTitle, StatCard, RoleBadge, Avatar, Button, Tabs, formatTimeRange } from "../../components/ui";
import EditWorkHistoryModal from "../../components/EditWorkHistoryModal";
import EditTeamMemberModal from "../../components/EditTeamMemberModal";

const TONE_ACCENT = {
  good: "text-good-600",
  warn: "text-warn-600",
  bad: "text-bad-600",
};

export default function EmployeeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { employees, roleDefaults, workHistory, panels, clockLog, updateEmployee } = useApp();

  const employee = employees.find((e) => e.id === id);
  const [editingEntry, setEditingEntry] = useState(null);
  const [editingProfile, setEditingProfile] = useState(false);
  // Tabbed layout so this page isn't one long scroll — each tab is a
  // self-contained "folder" of sections that used to just be stacked
  // one after another. Local UI state only, resets to Overview whenever a
  // different employee's page is opened. Adjusted during render (the
  // React-recommended way to reset state when a prop changes) rather than
  // in a useEffect, so navigating employee-to-employee doesn't trigger an
  // extra cascading render/paint just to reset the tab.
  const [activeTab, setActiveTab] = useState("overview");
  const [tabResetId, setTabResetId] = useState(id);
  if (id !== tabResetId) {
    setTabResetId(id);
    setActiveTab("overview");
  }
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

  // Non-productive time — how much of this Panel Technician's actual
  // clocked-in time (from the shared Clock In/Out QR, below) wasn't covered
  // by a logged session, day by day. See computeNonProductiveTime's own
  // comment in mockData.js for how days are now driven by real clock-in
  // data instead of a fixed shift window. Leads don't punch this same
  // Clock In/Out QR flow today, so the section is skipped for them entirely.
  const nonProductiveDays = useMemo(
    () => (employee?.role === ROLES.TECH ? computeNonProductiveTime(workHistory, clockLog, employee.id) : []),
    [employee, workHistory, clockLog]
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

  // Week-to-week performance — hours/sessions/connections logged per
  // payroll week (Wednesday–Tuesday, same week the Payroll page uses), most
  // recent first. See computeWeeklyPerformance's own comment for why this
  // reuses the payroll week rather than a separate week concept.
  const weeklyPerformance = useMemo(
    () => (employee ? computeWeeklyPerformance(workHistory, employee.id) : []),
    [employee, workHistory]
  );
  const maxWeeklyHours = Math.max(...weeklyPerformance.map((w) => w.hours), 1);

  // "What they're good at, what they need to work on" — entirely derived
  // from this technician's own logged sessions vs. the shop-wide average
  // per stage. See computeEmployeeInsights's own comment for the gating
  // rules (minimum session counts, minimum % difference) that keep this
  // from reading noise as a real pattern.
  const insights = useMemo(
    () => (employee ? computeEmployeeInsights(workHistory, employee.id) : null),
    [employee, workHistory]
  );

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

  const TABS = [
    { key: "overview", label: "Overview" },
    { key: "performance", label: "Performance" },
    { key: "attendance", label: "Attendance" },
    { key: "sessions", label: "Sessions", badge: recentActivity.length },
  ];

  return (
    <div className="p-6 max-w-[1100px] mx-auto">
      <button onClick={() => navigate("/team")} className="text-[13px] font-semibold text-brand-600 hover:text-brand-700 mb-4">
        ← Back to Team
      </button>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <Avatar employee={employee} sizeClass="w-14 h-14 text-lg" />
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
              {employee.phone ? ` · ${employee.phone}` : ""}
              {employee.email ? ` · ${employee.email}` : ""}
            </p>
          </div>
        </div>
        <Button variant="ghost" onClick={() => setEditingProfile(true)}>
          Edit Profile
        </Button>
      </div>

      <Tabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

      {activeTab === "overview" && (
        <>
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
        </>
      )}

      {activeTab === "performance" && (
        <>
      <SectionTitle
        title="Week-to-Week Performance"
        subtitle="Hours and sessions logged per payroll week (Wed–Tue) — last 8 weeks, most recent first"
      />
      <Card padded={false} className="overflow-x-auto mb-8">
        {weeklyPerformance.length === 0 ? (
          <p className="text-xs text-ink-400 text-center py-8">No logged sessions yet.</p>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-ink-500 border-b border-paper-200">
                <th className="px-4 py-3 font-semibold">Payroll Week</th>
                <th className="px-4 py-3 font-semibold">Hours</th>
                <th className="px-4 py-3 font-semibold">Sessions</th>
                <th className="px-4 py-3 font-semibold">Connections</th>
                <th className="px-4 py-3 font-semibold">Flagged</th>
                <th className="px-4 py-3 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {weeklyPerformance.map((w, i) => (
                <tr key={w.weekKey} className={`border-b border-paper-100 last:border-0 ${i % 2 === 1 ? "bg-paper-50/60" : ""}`}>
                  <td className="px-4 py-2.5 text-ink-900 font-medium">
                    Week of {new Date(w.weekStart).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </td>
                  <td className="px-4 py-2.5 text-ink-700 font-medium">{w.hours}</td>
                  <td className="px-4 py-2.5 text-ink-700">{w.sessions}</td>
                  <td className="px-4 py-2.5 text-ink-700">{w.connections > 0 ? w.connections : "—"}</td>
                  <td className="px-4 py-2.5 text-ink-700">
                    {w.flagged > 0 ? <span className="text-bad-600 font-semibold">{w.flagged}</span> : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="h-2 w-24 rounded-full bg-paper-100 overflow-hidden">
                      <div className="h-full rounded-full bg-brand-500" style={{ width: `${(w.hours / maxWeeklyHours) * 100}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <SectionTitle
        title="Strengths & Areas to Improve"
        subtitle="Their own average time per stage vs. the shop-wide average, from real logged sessions — not a manual review"
      />
      <Card className="mb-8">
        {!insights || (insights.strengths.length === 0 && insights.improvements.length === 0) ? (
          <p className="text-xs text-ink-400 text-center py-6">
            Not enough logged history yet at any one stage to say — this fills in once they've logged a handful of
            sessions at stages the rest of the shop has also logged enough of to compare against.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <p className="text-[11px] font-semibold text-good-600 uppercase tracking-wide mb-2">Strengths</p>
              {insights.strengths.length === 0 ? (
                <p className="text-xs text-ink-400">Nothing stands out yet either way.</p>
              ) : (
                <ul className="space-y-1.5">
                  {insights.strengths.map((s) => (
                    <li key={s.key} className="text-[13px] text-ink-900">
                      <span className="font-medium">{s.label}</span>{" "}
                      <span className="text-[11px] text-good-600 font-semibold">
                        {Math.round(s.pctDiff * 100)}% faster than shop avg
                      </span>
                      <div className="text-[11px] text-ink-500">{s.mineAvgHours} hrs/task vs {s.teamAvgHours} hrs/task shop avg</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="text-[11px] font-semibold text-warn-600 uppercase tracking-wide mb-2">Areas to Improve</p>
              {insights.improvements.length === 0 ? (
                <p className="text-xs text-ink-400">Nothing stands out yet either way.</p>
              ) : (
                <ul className="space-y-1.5">
                  {insights.improvements.map((s) => (
                    <li key={s.key} className="text-[13px] text-ink-900">
                      <span className="font-medium">{s.label}</span>{" "}
                      <span className="text-[11px] text-warn-600 font-semibold">
                        {Math.round(Math.abs(s.pctDiff) * 100)}% slower than shop avg
                      </span>
                      <div className="text-[11px] text-ink-500">{s.mineAvgHours} hrs/task vs {s.teamAvgHours} hrs/task shop avg</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
        {insights && insights.totalSessions > 0 && (
          <p className="text-[11px] text-ink-400 mt-4 pt-3 border-t border-paper-100">
            {insights.flaggedCount} of {insights.totalSessions} logged session{insights.totalSessions === 1 ? "" : "s"} flagged
            for review ({insights.flaggedRate}%){insights.reworkAttributedCount > 0
              ? ` · Rework attributed to them ${insights.reworkAttributedCount} time${insights.reworkAttributedCount === 1 ? "" : "s"}`
              : ""}
            . Only stages with enough sessions logged — by them and by the shop — show up above, so a slow start at a
            new stage doesn't read as a weakness.
          </p>
        )}
      </Card>
        </>
      )}

      {activeTab === "attendance" && (
        <>
      {employee.role === ROLES.TECH && (
        <>
          <SectionTitle
            title="Non-Productive Time"
            subtitle="Clocked-in time not covered by a logged session (paid breaks already excluded) — last 7 tracked workdays"
          />
          <Card className="mb-8">
            {recentNonProductiveDays.length === 0 ? (
              <p className="text-xs text-ink-400 text-center py-6">
                No tracked workdays yet — this shows up once they've clocked in at least once via the Clock In/Out QR.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-4 mb-5">
                  <StatCard
                    label="Non-Productive"
                    value={`${recentNonProductiveTotal} hrs`}
                    sub={`${recentNonProductivePct}% of clocked-in time`}
                    accent={recentNonProductivePct > 25 ? "text-bad-600" : recentNonProductivePct > 10 ? "text-warn-600" : "text-good-600"}
                  />
                  <StatCard label="Clocked-In Time" value={`${recentCapacityTotal} hrs`} sub={`${recentNonProductiveDays.length} workday(s) tracked`} />
                </div>
                <div className="space-y-3.5">
                  {recentNonProductiveDays.map((d) => (
                    <div key={d.dayKey}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[13px] font-medium text-ink-900">{d.label}</span>
                        <span className="text-[11px] text-ink-500">
                          {d.nonProductiveHours} hrs non-productive · {d.loggedHours} hrs logged of {d.capacityHours} hrs clocked in
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
                  Only days with a recorded clock-in are shown — a day is only counted once they've actually scanned
                  in, so a day they weren't scheduled to work never shows up as idle time.
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
                <th className="px-4 py-3 font-semibold">Location</th>
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
                  <td className="px-4 py-2.5">
                    <ClockLocationBadge entry={c} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
        </>
      )}

      {activeTab === "sessions" && (
        <>
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
        </>
      )}

      {editingEntry && (
        <EditWorkHistoryModal
          entry={editingEntry}
          employeeName={employee.name}
          onClose={() => setEditingEntry(null)}
        />
      )}

      {editingProfile && (
        <EditTeamMemberModal
          employee={employee}
          onClose={() => setEditingProfile(false)}
          onSave={(fields) => {
            updateEmployee(employee.id, fields);
            setEditingProfile(false);
          }}
        />
      )}
    </div>
  );
}

// Summarizes a clock log row's geofence check (see evaluateClockLocation in
// mockData.js) into one badge — checked against both the clock-in AND the
// clock-out scan, since either one being off-site or missing a GPS fix is
// worth a manager's attention. "Flagged" never means the scan was rejected —
// clockScan always allows it — just that this one is worth a look. Rows
// logged before this feature existed have no location fields at all, so
// those show a plain dash rather than a fabricated flag either way.
function ClockLocationBadge({ entry }) {
  const hasAnyData = entry.inLocationFlagged !== null && entry.inLocationFlagged !== undefined;
  if (!hasAnyData) {
    return <span className="text-ink-300">—</span>;
  }
  const outApplies = entry.clockedOutAt && entry.outLocationFlagged !== null && entry.outLocationFlagged !== undefined;
  const flagged = entry.inLocationFlagged || (outApplies && entry.outLocationFlagged);

  const describe = (label, dist, wasFlagged) => {
    if (!wasFlagged) return `${label}: on-site (${dist} ft from shop)`;
    return dist === null ? `${label}: no location on file` : `${label}: ${dist} ft from shop`;
  };
  const title = [
    describe("Clock-in", entry.inDistanceFt, entry.inLocationFlagged),
    outApplies ? describe("Clock-out", entry.outDistanceFt, entry.outLocationFlagged) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <span
      title={title}
      className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${
        flagged ? "bg-bad-50 text-bad-600" : "bg-good-50 text-good-600"
      }`}
    >
      {flagged ? "Flagged" : "On-site"}
    </span>
  );
}
