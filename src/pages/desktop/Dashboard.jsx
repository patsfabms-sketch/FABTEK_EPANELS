import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { productionStages, isClockedIn } from "../../data/mockData";
import { Card, SectionTitle, StatCard, RoleBadge, Modal, formatNumber } from "../../components/ui";

const KIND_ICON = {
  connect: "🔌",
  scan: "📡",
  verify: "✅",
  flag: "🚩",
  sort: "📦",
};

export default function Dashboard() {
  const { employees, activityFeed, activeSessions, workHistory, clockLog } = useApp();
  const [showClockModal, setShowClockModal] = useState(false);

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

  // Same signal Team.jsx's per-row "Clock Status" badge already reads
  // (assemblyos_clock_log via AppContext.clockLog, an open row = still
  // clocked in) — this just rolls the whole roster up into one quick
  // "how many are actually here right now" number for the dashboard,
  // with the same live update-as-people-scan behavior.
  const clockedInEmployees = useMemo(
    () => employees.filter((e) => isClockedIn(clockLog, e.id)),
    [employees, clockLog]
  );
  const notClockedInEmployees = useMemo(
    () => employees.filter((e) => !isClockedIn(clockLog, e.id)),
    [employees, clockLog]
  );

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
        <Card onClick={() => setShowClockModal(true)} className="flex-1 min-w-[160px]">
          <p className="text-xs font-medium text-ink-500">Clocked In</p>
          <p className="text-2xl font-bold mt-1 text-good-600">
            {clockedInEmployees.length}
            <span className="text-ink-400 text-base font-semibold"> / {employees.length}</span>
          </p>
          <p className="text-[11px] text-brand-600 font-semibold mt-1">On the shop's Clock QR — see who →</p>
        </Card>
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

      {showClockModal && (
        <ClockedInModal
          clockLog={clockLog}
          clockedInEmployees={clockedInEmployees}
          notClockedInEmployees={notClockedInEmployees}
          onClose={() => setShowClockModal(false)}
        />
      )}
    </div>
  );
}

// Quick-reference drill-down behind the "Clocked In" stat — who's actually
// scanned in on the shop's shared Clock QR right now vs. who isn't, in one
// glance, rather than an admin having to scan down every row of the full
// Team roster to piece it together. Same live `clockLog` data Team.jsx's
// per-row Clock Status badge already reads, so this always agrees with
// that page.
function ClockedInModal({ clockLog, clockedInEmployees, notClockedInEmployees, onClose }) {
  // Earliest arrival first — the quick-reference case this is for is "who's
  // been here since when," so the person who's been on the clock longest
  // naturally sits at the top.
  const clockedInSorted = useMemo(() => {
    return [...clockedInEmployees].sort((a, b) => {
      const aOpen = clockLog.find((c) => c.employeeId === a.id && !c.clockedOutAt);
      const bOpen = clockLog.find((c) => c.employeeId === b.id && !c.clockedOutAt);
      return (aOpen?.clockedInAt ?? 0) - (bOpen?.clockedInAt ?? 0);
    });
  }, [clockedInEmployees, clockLog]);
  const notClockedInSorted = useMemo(
    () => [...notClockedInEmployees].sort((a, b) => a.name.localeCompare(b.name)),
    [notClockedInEmployees]
  );

  return (
    <Modal onClose={onClose} widthClass="max-w-lg">
      <div className="flex items-start justify-between mb-1">
        <h3 className="text-base font-bold text-ink-900">Clock QR Status</h3>
        <button
          onClick={onClose}
          aria-label="Close"
          className="text-ink-400 hover:text-ink-700 text-xl leading-none px-1"
        >
          ×
        </button>
      </div>
      <p className="text-[11px] text-ink-500 mb-4">
        Who's scanned in on the shop's shared Clock QR right now — live, same as the Clock Status column on the Team
        page.
      </p>

      <p className="text-[11px] font-semibold text-good-600 uppercase tracking-wide mb-2">
        Clocked In ({clockedInSorted.length})
      </p>
      {clockedInSorted.length === 0 ? (
        <p className="text-xs text-ink-400 mb-4">No one is currently clocked in.</p>
      ) : (
        <div className="space-y-1.5 mb-4 max-h-52 overflow-y-auto scrollbar-thin pr-1">
          {clockedInSorted.map((e) => {
            const open = clockLog.find((c) => c.employeeId === e.id && !c.clockedOutAt);
            return (
              <div key={e.id} className="flex items-center justify-between rounded-lg px-2.5 py-2 bg-good-50/50">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-good-500 animate-pulse shrink-0" />
                  <span className="text-[13px] font-medium text-ink-900 truncate">{e.name}</span>
                  <RoleBadge role={e.role} />
                </div>
                <span className="text-[11px] font-semibold text-good-600 shrink-0 ml-2">
                  {open ? `Since ${new Date(open.clockedInAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[11px] font-semibold text-ink-500 uppercase tracking-wide mb-2 pt-3 border-t border-paper-100">
        Not Clocked In ({notClockedInSorted.length})
      </p>
      {notClockedInSorted.length === 0 ? (
        <p className="text-xs text-ink-400">Everyone on the roster is clocked in.</p>
      ) : (
        <div className="space-y-1.5 max-h-52 overflow-y-auto scrollbar-thin pr-1">
          {notClockedInSorted.map((e) => (
            <div key={e.id} className="flex items-center justify-between rounded-lg px-2.5 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-1.5 h-1.5 rounded-full bg-paper-300 shrink-0" />
                <span className="text-[13px] font-medium text-ink-700 truncate">{e.name}</span>
                <RoleBadge role={e.role} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
