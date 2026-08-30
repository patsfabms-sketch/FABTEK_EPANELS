import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { connectionsForPanel, taskProgress } from "../../data/mockData";
import { Card, SectionTitle, RoleBadge, formatNumber } from "../../components/ui";
import PanelDetailModal from "../../components/PanelDetailModal";

function formatElapsed(startedAt, now) {
  const mins = Math.max(0, Math.round((now - startedAt) / 60000));
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function Panels() {
  const { panels, pricePerConnection, activeSessions, employees, workHistory } = useApp();
  const navigate = useNavigate();
  const [now, setNow] = useState(Date.now());
  const [selectedGroup, setSelectedGroup] = useState(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const employeeById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  const panelGroups = useMemo(() => {
    return panels.map((p) => {
      const tag = `#${p.id}`;
      const active = activeSessions
        .filter((s) => s.panel === tag)
        .map((s) => ({
          ...s,
          employee: employeeById.get(s.employeeId),
          stageProgress: taskProgress(workHistory, tag, s.stage),
        }));
      const completed = workHistory
        .filter((h) => h.panel === tag)
        .map((h) => ({ ...h, employee: employeeById.get(h.employeeId) }));
      return {
        panel: p,
        target: connectionsForPanel(p, pricePerConnection),
        active,
        completed,
      };
    });
  }, [panels, activeSessions, workHistory, employeeById, pricePerConnection]);

  const inProgress = panelGroups.filter((g) => g.active.length > 0);
  const idle = panelGroups.filter((g) => g.active.length === 0);
  const totalTechs = inProgress.reduce((s, g) => s + g.active.length, 0);

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-ink-900">Panels In Progress</h1>
          <p className="text-sm text-ink-500 mt-1">
            Live view of every panel currently being worked, who's on it, and what they're doing
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-good-50 text-good-600 text-xs font-semibold px-3 py-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-good-500 animate-pulse" /> {inProgress.length} panel
          {inProgress.length === 1 ? "" : "s"} · {totalTechs} technician{totalTechs === 1 ? "" : "s"} active
        </span>
      </div>

      <div className="space-y-4 mb-8">
        {inProgress.length === 0 && (
          <Card>
            <p className="text-sm text-ink-500 text-center py-6">No panels currently in progress.</p>
          </Card>
        )}
        {inProgress.map(({ panel, target, active, completed }) => (
          <Card
            key={panel.id}
            onClick={() => setSelectedGroup({ panel, target, active, completed })}
          >
            <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
              <div>
                <h3 className="text-[15px] font-semibold text-ink-900">Panel #{panel.id}</h3>
                <p className="text-xs text-ink-500 mt-0.5">
                  {panel.customer} · {panel.order}
                </p>
              </div>
              <span className="text-xs font-semibold text-ink-500 shrink-0">
                {formatNumber(target)} conn target
              </span>
            </div>

            <p className="text-[11px] font-semibold text-ink-500 uppercase tracking-wide mb-2">
              Currently scanned in ({active.length})
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 mb-4">
              {active.map((s) => (
                <div key={s.id} className="rounded-lg border border-paper-200 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        s.employee && navigate(`/team/${s.employee.id}`);
                      }}
                      className="text-[13px] font-medium text-ink-900 hover:text-brand-600 text-left truncate"
                    >
                      {s.employee?.name ?? "Unknown Technician"}
                    </button>
                    <span className="w-1.5 h-1.5 rounded-full bg-good-500 animate-pulse shrink-0" />
                  </div>
                  {s.employee && <RoleBadge role={s.employee.role} />}
                  <p className="text-[11px] font-semibold text-brand-700 mt-1.5">{s.stage}</p>
                  <p className="text-[11px] text-ink-500 mt-0.5">
                    {formatElapsed(s.startedAt, now)} elapsed
                    {s.stageProgress > 0 ? ` · task was ${s.stageProgress}% done at start` : ""}
                  </p>
                </div>
              ))}
            </div>

            {completed.length > 0 && (
              <>
                <p className="text-[11px] font-semibold text-ink-500 uppercase tracking-wide mb-2 pt-3 border-t border-paper-100">
                  Completed on this panel
                </p>
                <div className="space-y-1.5">
                  {completed.slice(0, 4).map((h) => (
                    <div key={h.id} className="flex items-center justify-between text-[12px]">
                      <span className="text-ink-700">
                        <span className="font-medium text-ink-900">{h.employee?.name ?? "Unknown"}</span> added{" "}
                        <span className="font-semibold">+{h.percentAdded}%</span> to {h.stage ?? "a task"}
                        {h.taskCompleted && <span className="text-good-600 font-semibold"> (completed)</span>}
                      </span>
                      <span className="text-ink-400 shrink-0 ml-2">{h.date}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        ))}
      </div>

      <SectionTitle title="Idle Panels" subtitle="Panels in the estimate registry with no one currently scanned in" />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {idle.length === 0 && panels.length === 0 && (
          <p className="text-xs text-ink-400">
            No panels yet — import a QuickBooks estimate on the Estimates page to add some.
          </p>
        )}
        {idle.length === 0 && panels.length > 0 && (
          <p className="text-xs text-ink-400">All registered panels are currently in progress.</p>
        )}
        {idle.map(({ panel, target, completed }) => (
          <Card
            key={panel.id}
            onClick={() => setSelectedGroup({ panel, target, active: [], completed })}
          >
            <p className="text-sm font-semibold text-ink-900">#{panel.id}</p>
            <p className="text-[11px] text-ink-500 mt-0.5">{panel.customer}</p>
            <p className="text-[11px] text-ink-400 mt-1">{formatNumber(target)} conn target</p>
            {completed.length > 0 && (
              <p className="text-[11px] text-ink-500 mt-2">{completed.length} task{completed.length === 1 ? "" : "s"} logged historically</p>
            )}
          </Card>
        ))}
      </div>

      {selectedGroup && (
        <PanelDetailModal group={selectedGroup} onClose={() => setSelectedGroup(null)} />
      )}
    </div>
  );
}
