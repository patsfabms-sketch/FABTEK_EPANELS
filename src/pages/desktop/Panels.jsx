import { useMemo, useState } from "react";
import { useApp } from "../../context/AppContext";
import { connectionsForPanel, taskProgress, currentBuilds } from "../../data/mockData";
import { SectionTitle, formatNumber, formatDate } from "../../components/ui";
import PanelDetailModal from "../../components/PanelDetailModal";

export default function Panels() {
  const { panels, pricePerConnection, activeSessions, employees, workHistory } = useApp();
  const [selectedBuildId, setSelectedBuildId] = useState(null);

  const employeeById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  // Builds a detail group for any one build of a panel — not just the
  // current ones this page lists, so a click from the Build History table
  // inside the detail modal (an older, non-current build) can still open
  // its own full detail view.
  function makeGroup(p) {
    const tag = `#${p.id}`;
    const active = activeSessions
      .filter((s) => s.panel === tag && s.buildId === p.buildId)
      .map((s) => ({
        ...s,
        employee: employeeById.get(s.employeeId),
        stageProgress: taskProgress(workHistory, tag, s.stage, p.buildId),
      }));
    const completed = workHistory
      .filter((h) => h.panel === tag && h.buildId === p.buildId)
      .map((h) => ({ ...h, employee: employeeById.get(h.employeeId) }));
    return { panel: p, target: connectionsForPanel(p, pricePerConnection), active, completed };
  }

  // Only the current (most recent) build of each panel id is actionable —
  // older repeat builds of the same panel are read-only history, reachable
  // from a build's own detail view rather than cluttering this list.
  const panelGroups = useMemo(
    () => currentBuilds(panels).map(makeGroup),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [panels, activeSessions, workHistory, employeeById, pricePerConnection]
  );

  const inProgress = panelGroups.filter((g) => g.active.length > 0);
  const scheduled = panelGroups.filter((g) => g.active.length === 0);
  const totalTechs = inProgress.reduce((s, g) => s + g.active.length, 0);

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-ink-900">Panels</h1>
          <p className="text-sm text-ink-500 mt-1">
            Every panel in the registry — click a panel for full details, its QR code, and its estimate
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-good-50 text-good-600 text-xs font-semibold px-3 py-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-good-500 animate-pulse" /> {inProgress.length} panel
          {inProgress.length === 1 ? "" : "s"} · {totalTechs} technician{totalTechs === 1 ? "" : "s"} active
        </span>
      </div>

      <SectionTitle title="Active Panels" subtitle="Panels with someone currently scanned in" />
      <PanelTable groups={inProgress} emptyText="No panels currently in progress." onSelect={setSelectedBuildId} />

      <div className="mt-8">
        <SectionTitle title="Scheduled Panels" subtitle="Panels queued for work — not yet scanned in" />
        <PanelTable
          groups={scheduled}
          emptyText={
            panels.length === 0
              ? "No panels yet — import a QuickBooks estimate on the Estimates page to add some."
              : "All registered panels are currently in progress."
          }
          onSelect={setSelectedBuildId}
        />
      </div>

      {selectedBuildId && (
        <PanelDetailModal
          buildId={selectedBuildId}
          onClose={() => setSelectedBuildId(null)}
          onSelectBuild={(buildId) => setSelectedBuildId(buildId)}
        />
      )}
    </div>
  );
}

function PanelTable({ groups, emptyText, onSelect }) {
  if (groups.length === 0) {
    return (
      <div className="rounded-xl2 bg-white border border-paper-200 shadow-card">
        <p className="text-sm text-ink-500 text-center py-6">{emptyText}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl2 bg-white border border-paper-200 shadow-card overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-ink-500 border-b border-paper-200">
            <th className="px-4 py-3 font-semibold">Job #</th>
            <th className="px-4 py-3 font-semibold">Description</th>
            <th className="px-4 py-3 font-semibold">Date Added</th>
            <th className="px-4 py-3 font-semibold text-right">Connections</th>
            <th className="px-4 py-3 font-semibold">PO #</th>
            <th className="px-4 py-3 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {groups.map(({ panel, target, active, completed }) => (
            <tr
              key={panel.buildId}
              onClick={() => onSelect(panel.buildId)}
              className="border-b border-paper-100 last:border-0 cursor-pointer hover:bg-brand-50/60 transition-colors"
            >
              <td className="px-4 py-3 font-semibold text-ink-900 whitespace-nowrap">
                #{panel.jobNumber || panel.id}
              </td>
              <td className="px-4 py-3 text-ink-700">
                <span className="font-medium text-ink-900">{panel.customer}</span>
                {panel.order ? <span className="text-ink-500"> · {panel.order}</span> : null}
              </td>
              <td className="px-4 py-3 text-ink-600 whitespace-nowrap">{formatDate(panel.dateAdded)}</td>
              <td className="px-4 py-3 text-right font-semibold text-ink-900 whitespace-nowrap">
                {formatNumber(target)}
              </td>
              <td className="px-4 py-3 text-ink-600 whitespace-nowrap">{panel.poNumber || "—"}</td>
              <td className="px-4 py-3 whitespace-nowrap">
                {active.length > 0 ? (
                  <span className="inline-flex items-center gap-1.5 text-good-600 font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-good-500 animate-pulse" /> {active.length} on it
                  </span>
                ) : completed.length > 0 ? (
                  <span className="text-ink-500">{completed.length} logged</span>
                ) : (
                  <span className="text-ink-400">Scheduled</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
