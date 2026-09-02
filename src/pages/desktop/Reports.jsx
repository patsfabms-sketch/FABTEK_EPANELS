import { useEffect, useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { useApp } from "../../context/AppContext";
import {
  ROLES,
  computeDailyHoursTrend,
  computeDailyConnectionsTrend,
  computeTeamStageStats,
  computeEmployeeLeaderboard,
  computeRepeatBuildTrends,
  computeCostSummary,
  computeNonProductiveSummary,
  computeAvgBuildTime,
  estimateBuildHours,
  isShippedSessionRow,
  productionStages,
  CONNECT_STAGE_KEY,
  SHIP_STAGE_LABEL,
} from "../../data/mockData";
import { Card, SectionTitle, StatCard, RoleBadge, Button, Modal, formatNumber, formatCurrency, formatTimeRange } from "../../components/ui";

// Days back from today each range covers — null means no cutoff at all.
// "Custom" date-range picking isn't implemented; these four cover the
// ranges a shop actually checks day to day.
const RANGE_OPTIONS = [
  { label: "Last 7 Days", days: 7 },
  { label: "Last 30 Days", days: 30 },
  { label: "Last 90 Days", days: 90 },
  { label: "All Time", days: null },
];
const ROLE_FILTERS = ["All Roles", ...Object.values(ROLES)];

export default function Reports() {
  const { employees, roleDefaults, workHistory, panels, clockLog } = useApp();
  const [range, setRange] = useState(RANGE_OPTIONS[1]);
  const [roleFilter, setRoleFilter] = useState("All Roles");
  const [employeeFilter, setEmployeeFilter] = useState("All Employees");
  const [sortBy, setSortBy] = useState("hours");
  const [openStageKey, setOpenStageKey] = useState(null);

  // "Now" as component state (rather than calling Date.now() directly in
  // the render body) — same pattern used in AdminHome.jsx/PanelDetailModal.jsx.
  // Refreshed every minute so the range cutoff doesn't quietly go stale on a
  // console left open all shift.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  // Every KPI on this page (besides Cost & Margin, which is deliberately
  // all-time — see computeCostSummary) is derived from this one filtered
  // slice, so the range picker and the two roster filters below all apply
  // consistently everywhere at once.
  const rangeCutoff = useMemo(() => (range.days ? now - range.days * 86400000 : null), [range.days, now]);
  const rangeFilteredHistory = useMemo(
    () => (rangeCutoff ? workHistory.filter((h) => h.createdAt && new Date(h.createdAt).getTime() >= rangeCutoff) : workHistory),
    [workHistory, rangeCutoff]
  );

  const filteredEmployees = useMemo(
    () =>
      employees.filter((e) => {
        if (roleFilter !== "All Roles" && e.role !== roleFilter) return false;
        if (employeeFilter !== "All Employees" && e.name !== employeeFilter) return false;
        return true;
      }),
    [employees, roleFilter, employeeFilter]
  );
  const filteredEmployeeIds = useMemo(() => new Set(filteredEmployees.map((e) => e.id)), [filteredEmployees]);
  const filteredHistory = useMemo(
    () => rangeFilteredHistory.filter((h) => filteredEmployeeIds.has(h.employeeId)),
    [rangeFilteredHistory, filteredEmployeeIds]
  );

  const chartDays = range.days ?? 90;
  const dailyTarget = useMemo(
    () => employees.reduce((sum, e) => sum + (e.override ?? roleDefaults[e.role].daily), 0),
    [employees, roleDefaults]
  );
  const hoursTrend = useMemo(
    () => computeDailyHoursTrend(filteredHistory, chartDays, dailyTarget),
    [filteredHistory, chartDays, dailyTarget]
  );
  const connectionsTrend = useMemo(
    () => computeDailyConnectionsTrend(filteredHistory, chartDays),
    [filteredHistory, chartDays]
  );

  const totalHours = useMemo(() => Number(filteredHistory.reduce((s, h) => s + (h.hours || 0), 0).toFixed(1)), [filteredHistory]);
  const totalConnections = useMemo(
    () => filteredHistory.reduce((s, h) => s + (h.connectionsCredited || 0), 0),
    [filteredHistory]
  );
  const panelsShipped = useMemo(() => filteredHistory.filter(isShippedSessionRow).length, [filteredHistory]);

  const avgAttainment = useMemo(() => {
    if (!filteredEmployees.length) return 0;
    return Math.round(filteredEmployees.reduce((s, e) => s + e.attainmentPct, 0) / filteredEmployees.length);
  }, [filteredEmployees]);

  // The "how long does each part of the process take" breakdown — team
  // hours summed per production stage, sorted so the biggest time sink
  // (the actual bottleneck) is on top.
  const stageStats = useMemo(
    () => [...computeTeamStageStats(filteredHistory)].sort((a, b) => b.hours - a.hours),
    [filteredHistory]
  );
  // Which stage card is currently expanded into its session-level detail —
  // see StageDetailModal below. Derived from filteredHistory (not a
  // separately-computed find), so if the range/role/employee filters change
  // while a stage is open, the modal's rows stay in sync automatically.
  const openStage = stageStats.find((s) => s.key === openStageKey) ?? null;

  // The "how does everyone stack up" comparison table.
  const leaderboard = useMemo(
    () => computeEmployeeLeaderboard(filteredHistory, filteredEmployees),
    [filteredHistory, filteredEmployees]
  );
  const sortedLeaderboard = useMemo(() => {
    const withAttainment = leaderboard.map((r) => ({
      ...r,
      attainmentPct: filteredEmployees.find((e) => e.id === r.employeeId)?.attainmentPct ?? 0,
    }));
    return [...withAttainment].sort((a, b) => (b[sortBy] ?? 0) - (a[sortBy] ?? 0));
  }, [leaderboard, filteredEmployees, sortBy]);

  // Non-productive time — Panel Technicians only (see the note on
  // computeNonProductiveTime in mockData.js). Clock entries get the same
  // range + employee filtering as filteredHistory above, so this
  // automatically respects the range, role, and employee filters just like
  // every other KPI on this page.
  const rangeFilteredClockLog = useMemo(
    () => (rangeCutoff ? clockLog.filter((c) => c.clockedInAt && c.clockedInAt >= rangeCutoff) : clockLog),
    [clockLog, rangeCutoff]
  );
  const filteredClockLog = useMemo(
    () => rangeFilteredClockLog.filter((c) => filteredEmployeeIds.has(c.employeeId)),
    [rangeFilteredClockLog, filteredEmployeeIds]
  );
  const nonProductive = useMemo(
    () => computeNonProductiveSummary(filteredHistory, filteredClockLog, filteredEmployees),
    [filteredHistory, filteredClockLog, filteredEmployees]
  );
  const maxNonProductiveHours = Math.max(...nonProductive.perEmployee.map((r) => r.totalNonProductiveHours), 1);

  // Repeat-build learning-curve view and the cost/margin summary are both
  // deliberately all-time (not range-filtered) — a build-to-build trend or
  // a job's total labor cost doesn't mean much sliced to "the last 7 days."
  const repeatBuilds = useMemo(() => computeRepeatBuildTrends(panels, workHistory), [panels, workHistory]);
  const costSummary = useMemo(() => computeCostSummary(panels, workHistory, employees), [panels, workHistory, employees]);

  // Start-to-finish build-time projections and the build-time calculator
  // below both deliberately use ALL logged history, not filteredHistory —
  // same reasoning as repeatBuilds/costSummary just above: a staffing/
  // scheduling projection should be a stable, all-time average, not
  // something that jumps around depending on whatever date range happens
  // to be selected on the page right now.
  const avgBuildTime = useMemo(() => computeAvgBuildTime(panels, workHistory), [panels, workHistory]);
  const allTimeStageStats = useMemo(() => computeTeamStageStats(workHistory), [workHistory]);
  const [showBuildTimeDetail, setShowBuildTimeDetail] = useState(false);
  // Which stages a hypothetical panel's routing includes, for the "Estimate
  // a New Panel" calculator — defaults to the stages every normal panel
  // goes through; the situational/exception ones (Rework, the two Aux
  // stages, Agastat sub-assembly, Training) start unchecked since they only
  // apply to some jobs, and the admin knows better than any default whether
  // this particular hypothetical panel needs them.
  const CORE_ROUTING_KEYS = ["prep", "verify", "sort", "build", "connect", "test", "qc", "wrap"];
  const [routingKeys, setRoutingKeys] = useState(() => new Set(CORE_ROUTING_KEYS));
  const [estimateConnections, setEstimateConnections] = useState("");
  const buildEstimate = useMemo(
    () =>
      estimateBuildHours(
        allTimeStageStats,
        productionStages.filter((s) => routingKeys.has(s.key)).map((s) => s.key),
        estimateConnections,
        avgBuildTime.hoursPerConnection
      ),
    [allTimeStageStats, routingKeys, estimateConnections, avgBuildTime.hoursPerConnection]
  );
  function toggleRoutingStage(key) {
    setRoutingKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function exportCsv() {
    const rows = [
      ["Employee", "Role", "Sessions", "Hours", "Tasks Completed", "Connections", "Connections/Hr", "Attainment %"],
      ...sortedLeaderboard.map((r) => [r.name, r.role, r.sessions, r.hours, r.completedTasks, r.totalConnections, r.connectionsPerHour, r.attainmentPct]),
    ];
    const content = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([content], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `assemblyos-kpis-${range.label.toLowerCase().replace(/\s+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3 print:hidden">
        <div>
          <h1 className="text-xl font-bold text-ink-900">Analytics &amp; KPIs</h1>
          <p className="text-sm text-ink-500 mt-1">
            Connections, time per build stage, and individual performance — computed live from logged work
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={exportCsv}>Export CSV</Button>
          <Button onClick={() => window.print()}>Print / Save as PDF</Button>
        </div>
      </div>

      <div className="hidden print:block mb-4">
        <h1 className="text-lg font-bold text-ink-900">AssemblyOS — Analytics &amp; KPIs</h1>
        <p className="text-xs text-ink-500">{range.label} · Generated {new Date().toLocaleString()}</p>
      </div>

      <div className="flex flex-wrap gap-3 mb-6 print:hidden">
        <select
          value={range.label}
          onChange={(e) => setRange(RANGE_OPTIONS.find((r) => r.label === e.target.value))}
          className="rounded-lg border border-paper-200 bg-white px-3 py-2 text-[13px] font-medium text-ink-700"
        >
          {RANGE_OPTIONS.map((o) => (
            <option key={o.label}>{o.label}</option>
          ))}
        </select>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="rounded-lg border border-paper-200 bg-white px-3 py-2 text-[13px] font-medium text-ink-700"
        >
          {ROLE_FILTERS.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
        <select
          value={employeeFilter}
          onChange={(e) => setEmployeeFilter(e.target.value)}
          className="rounded-lg border border-paper-200 bg-white px-3 py-2 text-[13px] font-medium text-ink-700"
        >
          <option>All Employees</option>
          {employees.map((e) => (
            <option key={e.id}>{e.name}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-4 mb-6">
        <StatCard label="Total Hours" value={formatNumber(totalHours)} sub={range.label} accent="text-brand-600" />
        <StatCard label="Total Connections" value={formatNumber(totalConnections)} sub="Route/Terminate stage" accent="text-good-600" />
        <StatCard label="AVG Goal Attainment" value={`${avgAttainment}%`} sub="Target: 100% Sustained" />
        <StatCard label="Panels Shipped" value={panelsShipped} sub={`${SHIP_STAGE_LABEL} completed`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        <Card>
          <SectionTitle title="Daily Hours Logged" subtitle={`${formatNumber(totalHours)} hrs total · ${range.label}`} />
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={hoursTrend} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="fillHours" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b6fe0" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#3b6fe0" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="#eef2f6" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#6b7a88" }} axisLine={false} tickLine={false} interval={Math.ceil(chartDays / 8)} />
              <YAxis tick={{ fontSize: 10, fill: "#6b7a88" }} axisLine={false} tickLine={false} tickFormatter={(v) => formatNumber(v)} />
              <Tooltip formatter={(v) => [`${formatNumber(v)} hours`, "Logged"]} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8ee" }} />
              <Area type="monotone" dataKey="value" stroke="#3b6fe0" strokeWidth={2} fill="url(#fillHours)" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <SectionTitle title="Daily Connections" subtitle={`${formatNumber(totalConnections)} total · ${range.label}`} />
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={connectionsTrend} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="fillConnections" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1fa971" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#1fa971" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="#eef2f6" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#6b7a88" }} axisLine={false} tickLine={false} interval={Math.ceil(chartDays / 8)} />
              <YAxis tick={{ fontSize: 10, fill: "#6b7a88" }} axisLine={false} tickLine={false} tickFormatter={(v) => formatNumber(v)} />
              <Tooltip formatter={(v) => [`${formatNumber(v)} connections`, "Made"]} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8ee" }} />
              <Area type="monotone" dataKey="value" stroke="#1fa971" strokeWidth={2} fill="url(#fillConnections)" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <SectionTitle
        title="Average Time per Step"
        subtitle={`Every logged session for each stage, averaged together · ${range.label} — click a step to see exactly which sessions make up that number`}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
        {stageStats.length === 0 ? (
          <p className="text-xs text-ink-400 text-center py-6 col-span-full">No work logged yet in this range.</p>
        ) : (
          stageStats.map((s) => (
            <button
              key={s.key}
              onClick={() => setOpenStageKey(s.key)}
              className="text-left rounded-xl2 bg-white border border-paper-200 shadow-card p-4 hover:border-brand-300 transition-colors"
            >
              <p className="text-[13px] font-semibold text-ink-900">{s.label}</p>
              <p className="mt-1">
                <span className="text-2xl font-bold text-brand-600">{s.avgHours}</span>{" "}
                <span className="text-xs font-medium text-ink-500">hrs avg / session</span>
              </p>
              <p className="text-[11px] text-ink-500 mt-1.5">
                {s.sessions} session{s.sessions === 1 ? "" : "s"} · {formatNumber(s.hours)} hrs total ·{" "}
                {s.technicians} tech{s.technicians === 1 ? "" : "s"}
                {s.key === "connect" && s.totalConnections > 0 ? ` · ${s.connectionsPerHour} conn/hr avg` : ""}
              </p>
              <p className="text-[11px] font-semibold text-brand-600 mt-2.5">See sessions →</p>
            </button>
          ))
        )}
      </div>

      {openStage && (
        <StageDetailModal
          stage={openStage}
          rows={filteredHistory.filter((h) => h.stage === openStage.label)}
          employees={employees}
          panels={panels}
          rangeLabel={range.label}
          onClose={() => setOpenStageKey(null)}
        />
      )}

      <SectionTitle
        title="Panel Build Time & Projections"
        subtitle="Start-to-finish totals across every shipped panel — all-time, not affected by the filters above — for staffing and scheduling projections"
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">
        <Card>
          <div className="flex flex-wrap gap-4 mb-1">
            <button
              onClick={() => avgBuildTime.completedBuilds > 0 && setShowBuildTimeDetail(true)}
              disabled={avgBuildTime.completedBuilds === 0}
              className="text-left disabled:cursor-default"
            >
              <p className="text-[11px] font-semibold text-ink-500">Shipped Panels</p>
              <p className={`text-xl font-bold mt-0.5 ${avgBuildTime.completedBuilds > 0 ? "text-brand-600 hover:text-brand-700" : "text-ink-900"}`}>
                {avgBuildTime.completedBuilds}
              </p>
              {avgBuildTime.completedBuilds > 0 && (
                <p className="text-[10px] font-semibold text-brand-600">See panels →</p>
              )}
            </button>
            <div>
              <p className="text-[11px] font-semibold text-ink-500">Avg Hours / Panel</p>
              <p className="text-xl font-bold text-ink-900 mt-0.5">{avgBuildTime.avgHoursPerBuild}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-ink-500">Median Hours / Panel</p>
              <p className="text-xl font-bold text-ink-900 mt-0.5">{avgBuildTime.medianHoursPerBuild}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-ink-500">Hrs / Connection</p>
              <p className="text-xl font-bold text-ink-900 mt-0.5">{avgBuildTime.hoursPerConnection ?? "—"}</p>
            </div>
          </div>
          <p className="text-[11px] text-ink-400 mt-3 pt-3 border-t border-paper-100">
            {avgBuildTime.completedBuilds === 0
              ? `No panel has a completed ${SHIP_STAGE_LABEL} entry on file yet — projections need at least one fully shipped panel to compute from.`
              : `"Avg Hours / Panel" sums every hour logged against a shipped panel across every stage it went through, then averages across all ${avgBuildTime.completedBuilds} shipped panel${avgBuildTime.completedBuilds === 1 ? "" : "s"} on file. Median is included alongside it since one unusually long or short build can pull the average around. "Hrs / Connection" is Route/Terminate hours only, divided by connections — the rate the calculator below uses.`}
          </p>
        </Card>

        <Card>
          <p className="text-[13px] font-bold text-ink-900 mb-0.5">Estimate a New Panel</p>
          <p className="text-[11px] text-ink-500 mb-3">
            Check the stages this panel's routing will actually go through, enter its estimated connection count, and
            get a projected total build time.
          </p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mb-3">
            {productionStages.map((s) => (
              <label key={s.key} className="flex items-center gap-1.5 text-[12px] text-ink-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={routingKeys.has(s.key)}
                  onChange={() => toggleRoutingStage(s.key)}
                />
                {s.label}
                {s.key === CONNECT_STAGE_KEY && <span className="text-[10px] text-brand-600 font-semibold">(rate-based)</span>}
              </label>
            ))}
          </div>
          <label className="text-xs font-semibold text-ink-500">Estimated Connections</label>
          <input
            type="number"
            min="0"
            step="1"
            value={estimateConnections}
            onChange={(e) => setEstimateConnections(e.target.value)}
            placeholder="e.g. 240"
            className="mt-1 mb-3 w-full rounded-lg border border-paper-200 px-3 py-2 text-sm"
          />

          <div className="rounded-lg bg-brand-50 border border-brand-100 px-3 py-3 mb-2">
            <p className="text-[11px] font-semibold text-brand-700">Estimated Build Time</p>
            <p className="text-2xl font-bold text-brand-700">{buildEstimate.totalHours} hrs</p>
          </div>
          {buildEstimate.breakdown.length === 0 ? (
            <p className="text-[11px] text-ink-400">Check at least one stage above to see an estimate.</p>
          ) : (
            <div className="space-y-1">
              {buildEstimate.breakdown.map((b) => {
                const stage = productionStages.find((s) => s.key === b.key);
                return (
                  <div key={b.key} className="flex items-center justify-between text-[11px] text-ink-600">
                    <span>{stage?.label ?? b.key}</span>
                    <span className="text-ink-500">
                      <span className="font-semibold text-ink-900">{b.hours}</span> hrs · {b.basis}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          {avgBuildTime.hoursPerConnection === null && routingKeys.has(CONNECT_STAGE_KEY) && (
            <p className="text-[11px] text-warn-600 mt-2">
              No shipped Route/Terminate history yet to compute a connections rate from — Route/Terminate above is
              falling back to its shop-wide average session length instead of a connection-based estimate.
            </p>
          )}
        </Card>
      </div>

      {showBuildTimeDetail && (
        <BuildTimeDetailModal
          builds={avgBuildTime.builds}
          onClose={() => setShowBuildTimeDetail(false)}
        />
      )}

      <SectionTitle
        title="Employee Performance"
        subtitle={`${filteredEmployees.length} technician(s) matching filters · sorted by ${sortBy === "hours" ? "hours" : sortBy === "totalConnections" ? "connections" : sortBy === "connectionsPerHour" ? "connections/hr" : "attainment"}`}
      />
      <Card padded={false} className="overflow-x-auto mb-8">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-ink-500 border-b border-paper-200">
              <th className="px-4 py-3 font-semibold">Employee</th>
              <th className="px-4 py-3 font-semibold">Role</th>
              <SortableHeader label="Sessions" field="sessions" sortBy={sortBy} onSort={setSortBy} />
              <SortableHeader label="Hours" field="hours" sortBy={sortBy} onSort={setSortBy} />
              <SortableHeader label="Tasks Completed" field="completedTasks" sortBy={sortBy} onSort={setSortBy} />
              <SortableHeader label="Connections" field="totalConnections" sortBy={sortBy} onSort={setSortBy} />
              <SortableHeader label="Conn/Hr" field="connectionsPerHour" sortBy={sortBy} onSort={setSortBy} />
              <SortableHeader label="Attainment" field="attainmentPct" sortBy={sortBy} onSort={setSortBy} />
            </tr>
          </thead>
          <tbody>
            {sortedLeaderboard.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-xs text-ink-400">
                  No technicians match these filters.
                </td>
              </tr>
            )}
            {sortedLeaderboard.map((r, i) => (
              <tr key={r.employeeId} className={`border-b border-paper-100 last:border-0 ${i % 2 === 1 ? "bg-paper-50/60" : ""}`}>
                <td className="px-4 py-2.5 font-medium text-ink-900">{r.name}</td>
                <td className="px-4 py-2.5"><RoleBadge role={r.role} /></td>
                <td className="px-4 py-2.5 text-ink-700">{r.sessions}</td>
                <td className="px-4 py-2.5 text-ink-700">{r.hours}</td>
                <td className="px-4 py-2.5 text-ink-700">{r.completedTasks}</td>
                <td className="px-4 py-2.5 text-ink-700">{formatNumber(r.totalConnections)}</td>
                <td className="px-4 py-2.5 text-ink-700">{r.connectionsPerHour || "—"}</td>
                <td className="px-4 py-2.5 font-semibold text-ink-900">{r.attainmentPct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <SectionTitle
        title="Non-Productive Time"
        subtitle="Panel Technicians only — clocked-in time (via the Clock In/Out QR) not covered by a logged session (paid breaks already excluded), sorted highest first"
      />
      <div className="flex flex-wrap gap-4 mb-4">
        <StatCard
          label="Total Non-Productive"
          value={`${formatNumber(nonProductive.totalNonProductiveHours)} hrs`}
          sub={`${nonProductive.nonProductivePct}% of tracked clocked-in time · ${range.label}`}
          accent={nonProductive.nonProductivePct > 25 ? "text-bad-600" : nonProductive.nonProductivePct > 10 ? "text-warn-600" : "text-good-600"}
        />
        <StatCard label="Clocked-In Time Tracked" value={`${formatNumber(nonProductive.totalCapacityHours)} hrs`} sub="Sum across all technicians' tracked workdays" />
      </div>
      <Card padded={false} className="overflow-x-auto mb-8">
        {nonProductive.perEmployee.length === 0 ? (
          <p className="text-xs text-ink-400 text-center py-8">
            No tracked workdays for Panel Technicians in this range — shows up once at least one clock-in is
            recorded on a given day.
          </p>
        ) : (
          <>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-ink-500 border-b border-paper-200">
                  <th className="px-4 py-3 font-semibold">Technician</th>
                  <th className="px-4 py-3 font-semibold">Workdays Tracked</th>
                  <th className="px-4 py-3 font-semibold">Logged Hours</th>
                  <th className="px-4 py-3 font-semibold">Non-Productive Hours</th>
                  <th className="px-4 py-3 font-semibold">% of Clocked-In Time</th>
                </tr>
              </thead>
              <tbody>
                {nonProductive.perEmployee.map((r, i) => (
                  <tr key={r.employeeId} className={`border-b border-paper-100 last:border-0 ${i % 2 === 1 ? "bg-paper-50/60" : ""}`}>
                    <td className="px-4 py-2.5 font-medium text-ink-900">{r.name}</td>
                    <td className="px-4 py-2.5 text-ink-700">{r.daysTracked}</td>
                    <td className="px-4 py-2.5 text-ink-700">{r.totalLoggedHours}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-ink-900 font-semibold w-12 shrink-0">{r.totalNonProductiveHours}</span>
                        <div className="h-2 rounded-full bg-paper-100 overflow-hidden flex-1 max-w-[140px]">
                          <div
                            className="h-full rounded-full bg-warn-500"
                            style={{ width: `${(r.totalNonProductiveHours / maxNonProductiveHours) * 100}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-ink-700">{r.nonProductivePct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-ink-400 px-4 py-3 border-t border-paper-100">
              Only workdays with at least one logged session count toward these totals — a day with none isn't
              assumed to be idle, since this app has no separate clock-in signal to confirm someone was even at
              work that day (a day off would otherwise look identical to sitting idle all shift).
            </p>
          </>
        )}
      </Card>

      {repeatBuilds.length > 0 && (
        <>
          <SectionTitle
            title="Repeat Build Trends"
            subtitle="Panels built more than once — hours per build, oldest to newest, so you can see if the crew is getting faster on a repeat job"
          />
          <Card className="mb-8 space-y-5">
            {repeatBuilds.map(({ id, builds }) => {
              const maxHours = Math.max(...builds.map((b) => b.stats.hours), 1);
              return (
                <div key={id}>
                  <p className="text-[13px] font-semibold text-ink-900 mb-2">Panel #{id} · {builds.length} builds on file</p>
                  <div className="flex items-end gap-2 h-20">
                    {builds.map((b, i) => (
                      <div key={b.panel.buildId} className="flex-1 flex flex-col items-center justify-end gap-1">
                        <span className="text-[10px] text-ink-500">{b.stats.hours || "—"}</span>
                        <div
                          className={`w-full rounded-t ${i === builds.length - 1 ? "bg-brand-500" : "bg-paper-200"}`}
                          style={{ height: `${Math.max(4, (b.stats.hours / maxHours) * 100)}%` }}
                          title={`Job #${b.panel.jobNumber || "—"} · ${b.stats.hours} hrs`}
                        />
                        <span className="text-[9px] text-ink-400 truncate w-full text-center">
                          {b.panel.jobNumber || "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </Card>
        </>
      )}

      <SectionTitle title="Cost &amp; Margin" subtitle="All time · labor cost is hours logged × each technician's current pay rate" />
      <div className="flex flex-wrap gap-4 mb-4">
        <StatCard label="Quoted Revenue" value={formatCurrency(costSummary.totalRevenue)} sub="All panels on file" />
        <StatCard label="Labor Cost" value={formatCurrency(costSummary.totalLaborCost)} sub="Hours logged × pay rate" accent="text-warn-600" />
        <StatCard
          label="Margin"
          value={formatCurrency(costSummary.totalMargin)}
          sub={costSummary.totalRevenue > 0 ? `${Math.round((costSummary.totalMargin / costSummary.totalRevenue) * 100)}% of revenue` : ""}
          accent={costSummary.totalMargin >= 0 ? "text-good-600" : "text-bad-600"}
        />
      </div>
      <Card padded={false} className="overflow-x-auto mb-8">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-ink-500 border-b border-paper-200">
              <th className="px-4 py-3 font-semibold">Panel</th>
              <th className="px-4 py-3 font-semibold">Customer</th>
              <th className="px-4 py-3 font-semibold">Hours</th>
              <th className="px-4 py-3 font-semibold">Revenue</th>
              <th className="px-4 py-3 font-semibold">Labor Cost</th>
              <th className="px-4 py-3 font-semibold">Margin</th>
            </tr>
          </thead>
          <tbody>
            {costSummary.perPanel.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-xs text-ink-400">
                  No panels with logged work yet.
                </td>
              </tr>
            )}
            {costSummary.perPanel.slice(0, 25).map((p, i) => (
              <tr key={p.buildId} className={`border-b border-paper-100 last:border-0 ${i % 2 === 1 ? "bg-paper-50/60" : ""}`}>
                <td className="px-4 py-2.5 font-medium text-ink-900">#{p.id}{p.jobNumber ? ` · Job ${p.jobNumber}` : ""}</td>
                <td className="px-4 py-2.5 text-ink-600">{p.customer}</td>
                <td className="px-4 py-2.5 text-ink-700">{p.hours}</td>
                <td className="px-4 py-2.5 text-ink-700">{formatCurrency(p.revenue)}</td>
                <td className="px-4 py-2.5 text-ink-700">{formatCurrency(p.laborCost)}</td>
                <td className={`px-4 py-2.5 font-semibold ${p.margin >= 0 ? "text-good-600" : "text-bad-600"}`}>
                  {formatCurrency(p.margin)}{p.marginPct !== null ? ` (${p.marginPct}%)` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// Drill-down behind an "Average Time per Step" card — every individual
// logged session that feeds into that stage's average, most recent first,
// so "where is this number actually coming from" always has a real answer
// one click away instead of just trusting the summary number. Scoped to
// whatever range/role/employee filters are active on the page (rows is
// already filteredHistory sliced to this one stage), so it stays exactly
// consistent with the card it was opened from.
function StageDetailModal({ stage, rows, employees, panels, rangeLabel, onClose }) {
  const employeeById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const jobNumberByBuildId = useMemo(() => new Map(panels.map((p) => [p.buildId, p.jobNumber])), [panels]);
  const sorted = useMemo(
    () => [...rows].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()),
    [rows]
  );
  const totalHours = Number(rows.reduce((s, h) => s + (h.hours || 0), 0).toFixed(1));
  const avgHours = rows.length ? Number((totalHours / rows.length).toFixed(2)) : 0;
  const isConnectStage = stage.key === "connect";

  return (
    <Modal onClose={onClose} widthClass="max-w-2xl">
      <div className="flex items-start justify-between mb-1">
        <div>
          <h3 className="text-base font-bold text-ink-900">{stage.label} — Session Detail</h3>
          <p className="text-[11px] text-ink-500 mt-0.5">
            {avgHours} hrs avg across {rows.length} session{rows.length === 1 ? "" : "s"} · {rangeLabel}
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
      <p className="text-[11px] text-ink-400 mb-4">
        This is exactly what the average on the card is computed from — every individual logged session for this
        stage in the current range, one row each.
      </p>
      <div className="rounded-lg border border-paper-200 overflow-x-auto max-h-[60vh] overflow-y-auto">
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 bg-white">
            <tr className="text-left text-[11px] uppercase tracking-wide text-ink-500 border-b border-paper-200">
              <th className="px-3 py-2.5 font-semibold">Date</th>
              <th className="px-3 py-2.5 font-semibold">Technician</th>
              <th className="px-3 py-2.5 font-semibold">Panel</th>
              <th className="px-3 py-2.5 font-semibold text-right">Hours</th>
              {isConnectStage && <th className="px-3 py-2.5 font-semibold text-right">Connections</th>}
              <th className="px-3 py-2.5 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={isConnectStage ? 6 : 5} className="px-3 py-8 text-center text-xs text-ink-400">
                  No sessions in this range.
                </td>
              </tr>
            ) : (
              sorted.map((h, i) => (
                <tr key={h.id} className={`border-b border-paper-50 last:border-0 ${i % 2 === 1 ? "bg-paper-50/60" : ""}`}>
                  <td className="px-3 py-2 text-ink-700">
                    {h.date}
                    <div className="text-[10px] text-ink-400">{formatTimeRange(h.startedAt, h.endedAt)}</div>
                  </td>
                  <td className="px-3 py-2 text-ink-900 font-medium">
                    {employeeById.get(h.employeeId)?.name ?? "Unknown"}
                  </td>
                  <td className="px-3 py-2 text-ink-600">
                    {h.panel}
                    {jobNumberByBuildId.get(h.buildId) && (
                      <span className="text-ink-400"> · Job #{jobNumberByBuildId.get(h.buildId)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-ink-700">{h.hours}</td>
                  {isConnectStage && (
                    <td className="px-3 py-2 text-right text-ink-700">{h.connectionsCredited || "—"}</td>
                  )}
                  <td className="px-3 py-2">
                    <span
                      className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${
                        h.status === "Verified" ? "bg-good-50 text-good-600" : "bg-bad-50 text-bad-600"
                      }`}
                    >
                      {h.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

// Drill-down behind the "Shipped Panels" stat in the build-time projection
// card — every panel that has a completed Wrap entry on file, with its
// real total hours and connections, so "how did we get an average of X
// hours per panel" always has a real answer one click away, same
// philosophy as StageDetailModal above.
function BuildTimeDetailModal({ builds, onClose }) {
  return (
    <Modal onClose={onClose} widthClass="max-w-2xl">
      <div className="flex items-start justify-between mb-1">
        <div>
          <h3 className="text-base font-bold text-ink-900">Shipped Panels — Build Time Detail</h3>
          <p className="text-[11px] text-ink-500 mt-0.5">
            Every panel with a completed {SHIP_STAGE_LABEL} entry on file, all-time · sorted by total hours
          </p>
        </div>
        <button onClick={onClose} aria-label="Close" className="text-ink-400 hover:text-ink-700 text-xl leading-none px-1">
          ×
        </button>
      </div>
      <p className="text-[11px] text-ink-400 mb-4">
        This is exactly what "Avg Hours / Panel" and "Hrs / Connection" on the card are computed from — every hour
        logged against each panel, across every stage it went through.
      </p>
      <div className="rounded-lg border border-paper-200 overflow-x-auto max-h-[60vh] overflow-y-auto">
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 bg-white">
            <tr className="text-left text-[11px] uppercase tracking-wide text-ink-500 border-b border-paper-200">
              <th className="px-3 py-2.5 font-semibold">Panel</th>
              <th className="px-3 py-2.5 font-semibold">Customer</th>
              <th className="px-3 py-2.5 font-semibold text-right">Hours</th>
              <th className="px-3 py-2.5 font-semibold text-right">Connections</th>
              <th className="px-3 py-2.5 font-semibold text-right">Sessions</th>
            </tr>
          </thead>
          <tbody>
            {builds.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-xs text-ink-400">
                  No shipped panels yet.
                </td>
              </tr>
            ) : (
              builds.map((b, i) => (
                <tr key={b.buildId} className={`border-b border-paper-50 last:border-0 ${i % 2 === 1 ? "bg-paper-50/60" : ""}`}>
                  <td className="px-3 py-2 text-ink-900 font-medium">
                    #{b.id}
                    {b.jobNumber && <span className="text-ink-400"> · Job #{b.jobNumber}</span>}
                  </td>
                  <td className="px-3 py-2 text-ink-600">{b.customer || "—"}</td>
                  <td className="px-3 py-2 text-right text-ink-700">{b.hours}</td>
                  <td className="px-3 py-2 text-right text-ink-700">{b.connections || "—"}</td>
                  <td className="px-3 py-2 text-right text-ink-700">{b.sessions}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

function SortableHeader({ label, field, sortBy, onSort }) {
  const active = sortBy === field;
  return (
    <th className="px-4 py-3 font-semibold">
      <button
        onClick={() => onSort(field)}
        className={`flex items-center gap-1 uppercase tracking-wide text-[11px] ${active ? "text-brand-600" : "text-ink-500 hover:text-ink-700"}`}
      >
        {label} {active && <span aria-hidden="true">↓</span>}
      </button>
    </th>
  );
}
