import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { productionStages } from "../../data/mockData";
import { Card, SectionTitle, StatCard, RoleBadge, formatNumber } from "../../components/ui";

const KIND_ICON = {
  connect: "🔌",
  scan: "📡",
  verify: "✅",
  flag: "🚩",
  sort: "📦",
};

export default function Dashboard() {
  const { employees, activityFeed, activeSessions, workHistory } = useApp();

  const employeeById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  const stats = useMemo(() => {
    const totalHours = employees.reduce((sum, e) => sum + e.currentWeekAvg, 0);
    const todayLabel = new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    return {
      panelsInProgress: new Set(activeSessions.map((s) => s.panel)).size,
      completedToday: workHistory.filter((h) => h.date === todayLabel && h.taskCompleted).length,
      totalHoursWeekly: Math.round(totalHours * 7),
      activeEmployees: employees.length,
    };
  }, [employees, activeSessions, workHistory]);

  const pipelineCounts = useMemo(
    () =>
      productionStages.map((stage) => ({
        key: stage.key,
        label: stage.label,
        count: activeSessions.filter((s) => s.stage === stage.label).length,
      })),
    [activeSessions]
  );
  const maxStageCount = Math.max(...pipelineCounts.map((s) => s.count), 1);

  const activeOperators = useMemo(
    () =>
      activeSessions
        .map((s) => ({ ...s, employee: employeeById.get(s.employeeId) }))
        .filter((s) => s.employee),
    [activeSessions, employeeById]
  );

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-ink-900">Control Panel Assembly Tracker</h1>
          <p className="text-sm text-ink-500 mt-1">Floor 3 — Electronics Assembly Subsection</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-good-50 text-good-600 text-xs font-semibold px-3 py-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-good-500 animate-pulse" /> Live Monitor
        </span>
      </div>

      <div className="flex flex-wrap gap-4 mb-6">
        <StatCard label="Panels In Progress" value={stats.panelsInProgress} sub="Panels with someone scanned in" />
        <StatCard label="Completed Today" value={stats.completedToday} sub="Tasks finished today" />
        <StatCard
          label="Total Hours (Weekly)"
          value={formatNumber(stats.totalHoursWeekly)}
          sub="Across all active stations"
          accent="text-brand-600"
        />
        <StatCard label="Active Employees" value={stats.activeEmployees} sub="On the roster" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2">
          <SectionTitle title="Assembly Pipeline Progress" subtitle="Technicians currently active at each stage" />
          {activeSessions.length === 0 ? (
            <p className="text-xs text-ink-400 text-center py-6">No one is currently scanned into a panel.</p>
          ) : (
            <div className="space-y-3.5">
              {pipelineCounts.map((stage) => (
                <div key={stage.key} className="flex items-center gap-3">
                  <span className="w-32 text-xs font-semibold text-ink-600 shrink-0 truncate">{stage.label}</span>
                  <div className="flex-1 h-2.5 rounded-full bg-paper-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-brand-500"
                      style={{ width: `${(stage.count / maxStageCount) * 100}%` }}
                    />
                  </div>
                  <span className="w-16 text-right text-xs font-semibold text-ink-900">{stage.count} active</span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 pt-5 border-t border-paper-100">
            <SectionTitle title="Active Station Operators" />
            {activeOperators.length === 0 ? (
              <p className="text-xs text-ink-400 text-center py-6">No technicians are currently scanned in.</p>
            ) : (
              <div className="space-y-2">
                {activeOperators.slice(0, 6).map((op) => (
                  <div
                    key={op.id}
                    className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-paper-50"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center text-[11px] font-bold shrink-0">
                        {op.employee.name.split(" ").map((n) => n[0]).join("")}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-ink-900 truncate">{op.employee.name}</p>
                        <p className="text-[11px] text-ink-500">
                          <RoleBadge role={op.employee.role} /> · Panel {op.panel}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-semibold text-ink-900">{op.stage}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Link to="/panels" className="mt-3 inline-block text-xs font-semibold text-brand-600 hover:text-brand-700">
              View All Active Crew ({activeOperators.length}) →
            </Link>
          </div>
        </Card>

        <Card>
          <SectionTitle title="Real-Time Activity Feed" />
          {activityFeed.length === 0 ? (
            <p className="text-xs text-ink-400 text-center py-6">
              No activity yet — logged sessions and manager actions will show up here.
            </p>
          ) : (
            <ul className="space-y-3">
              {activityFeed.map((a) => (
                <li key={a.id} className="flex items-start gap-2.5">
                  <span className="text-base leading-none mt-0.5">{KIND_ICON[a.kind] ?? "•"}</span>
                  <div className="min-w-0">
                    <p className="text-[13px] text-ink-900 leading-snug">
                      <span className="font-semibold">{a.who}</span> {a.action}
                      {a.ref && <span className="text-ink-500"> — {a.ref}</span>}
                    </p>
                    <p className="text-[10px] text-ink-400">{a.time}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
