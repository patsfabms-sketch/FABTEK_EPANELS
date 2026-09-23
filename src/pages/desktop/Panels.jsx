import { useMemo, useState } from "react";
import { useApp } from "../../context/AppContext";
import { connectionsForPanel, taskProgress, currentBuilds, unitLabel, sentInfoForBuild } from "../../data/mockData";
import { StatCard, Tabs, formatNumber, formatDate, formatDateTime } from "../../components/ui";
import PanelDetailModal from "../../components/PanelDetailModal";

// Pat's request (Sept 23, sent with screenshots of the Dashboard's missing-
// Wrap list): the "Scheduled Panels" section used to just mean "nobody's
// currently scanned into this one" — which meant a panel that finished and
// shipped months ago never left the list, it just sat there indistinguishable
// from something actually still queued. That's why the list kept growing
// ("that list is getting mighty long"). This page now splits into three tabs
// — Active, Not Started, and a new Sent tab — driven by the same "has a
// completed Wrap session been logged" signal used everywhere else in the app
// (Analytics build-time projections, the Dashboard throughput tile, weekly
// P&L). A panel only moves to Sent once a real Wrap scan is on file for it —
// if a panel was physically sent out but never got scanned into Wrap (the
// exact gap the Dashboard's "Avg Panels Shipped / Day" tile now finds), it
// stays visible here until that scan is logged, which is the intended
// behavior: this list and the shipped-count number should never disagree
// about what's actually been marked done.
export default function Panels() {
  const { panels, pricePerConnection, activeSessions, employees, workHistory } = useApp();
  const [selectedBuildId, setSelectedBuildId] = useState(null);
  const [activeTab, setActiveTab] = useState("active");
  const [query, setQuery] = useState("");

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
    const { isSent, sentAt } = sentInfoForBuild(workHistory, p);
    return { panel: p, target: connectionsForPanel(p, pricePerConnection), active, completed, isSent, sentAt };
  }

  // Only the current (most recent) build of each panel id is actionable —
  // older repeat builds of the same panel are read-only history, reachable
  // from a build's own detail view rather than cluttering this list.
  const panelGroups = useMemo(
    () => currentBuilds(panels).map(makeGroup),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [panels, activeSessions, workHistory, employeeById, pricePerConnection]
  );

  // "Active" keeps its original meaning — anyone currently scanned in,
  // regardless of whether the build has also shipped before (e.g. rework
  // reopened after Wrap) — so a technician genuinely on a panel right now
  // never silently disappears from this tab just because it's technically
  // already been marked Sent once.
  const activeGroups = panelGroups.filter((g) => g.active.length > 0);
  const sentGroups = useMemo(
    () => panelGroups.filter((g) => g.isSent).sort((a, b) => (b.sentAt ?? 0) - (a.sentAt ?? 0)),
    [panelGroups]
  );
  // "Currently scheduled" (Pat's own term) = everything that hasn't shipped
  // yet, whether or not it's actively being worked — this is the pipeline
  // total the new stat tiles below are about.
  const unsentGroups = panelGroups.filter((g) => !g.isSent);
  const notStartedGroups = unsentGroups.filter((g) => g.active.length === 0);
  const inProgressUnsentGroups = unsentGroups.filter((g) => g.active.length > 0);
  const totalTechs = activeGroups.reduce((s, g) => s + g.active.length, 0);
  const totalScheduledConnections = unsentGroups.reduce((s, g) => s + g.target, 0);

  function filterGroups(list) {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      ({ panel }) =>
        String(panel.jobNumber || panel.id).toLowerCase().includes(q) ||
        String(panel.id).toLowerCase().includes(q) ||
        (panel.customer || "").toLowerCase().includes(q) ||
        (panel.poNumber || "").toLowerCase().includes(q)
    );
  }

  const visibleGroups = useMemo(() => {
    const base = activeTab === "active" ? activeGroups : activeTab === "sent" ? sentGroups : notStartedGroups;
    return filterGroups(base);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, activeGroups, sentGroups, notStartedGroups, query]);

  const tabs = [
    { key: "active", label: "Active", badge: activeGroups.length },
    { key: "not-started", label: "Not Started", badge: notStartedGroups.length },
    { key: "sent", label: "Sent", badge: sentGroups.length },
  ];

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
          <span className="w-1.5 h-1.5 rounded-full bg-good-500 animate-pulse" /> {activeGroups.length} panel
          {activeGroups.length === 1 ? "" : "s"} · {totalTechs} technician{totalTechs === 1 ? "" : "s"} active
        </span>
      </div>

      <div className="flex flex-wrap gap-4 mb-6">
        <StatCard
          label="Scheduled (Not Sent)"
          value={formatNumber(unsentGroups.length)}
          sub="In progress + not started"
        />
        <StatCard
          label="Connections Scheduled"
          value={formatNumber(totalScheduledConnections)}
          sub="Across every unsent panel"
        />
        <StatCard
          label="In Progress"
          value={formatNumber(inProgressUnsentGroups.length)}
          sub="Someone currently scanned in"
          accent="text-good-600"
        />
        <StatCard
          label="Not Started"
          value={formatNumber(notStartedGroups.length)}
          sub="Queued, no session yet"
        />
      </div>

      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      <div className="flex flex-wrap gap-3 mb-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search job #, panel, customer, or PO…"
          className="min-w-[240px] flex-1 rounded-lg border border-paper-200 bg-white px-3 py-2 text-[13px] text-ink-700"
        />
      </div>

      {activeTab === "active" && (
        <PanelTable
          groups={visibleGroups}
          emptyText={query ? "No active panels match this search." : "No panels currently in progress."}
          onSelect={setSelectedBuildId}
        />
      )}

      {activeTab === "not-started" && (
        <PanelTable
          groups={visibleGroups}
          emptyText={
            query
              ? "No not-started panels match this search."
              : panels.length === 0
              ? "No panels yet — import a QuickBooks estimate on the Estimates page to add some."
              : "Every registered panel is either in progress or already sent."
          }
          onSelect={setSelectedBuildId}
        />
      )}

      {activeTab === "sent" && (
        <PanelTable
          groups={visibleGroups}
          mode="sent"
          emptyText={
            query
              ? "No sent panels match this search."
              : "Nothing's been marked Sent yet — a panel lands here once a completed Wrap session is logged for it."
          }
          onSelect={setSelectedBuildId}
        />
      )}

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

function todayDateInputValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function PanelTable({ groups, emptyText, onSelect, mode = "pipeline" }) {
  const { adminMarkPanelSent } = useApp();
  const [confirmingBuildId, setConfirmingBuildId] = useState(null);
  const [sentDate, setSentDate] = useState(todayDateInputValue());

  function handleMarkSent(e, panel) {
    e.stopPropagation();
    // A blank/invalid date falls back to right now inside adminMarkPanelSent
    // itself — never blocks the action.
    adminMarkPanelSent(panel, { sentAt: sentDate ? `${sentDate}T12:00:00` : undefined });
    setConfirmingBuildId(null);
  }

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
            <th className="px-4 py-3 font-semibold">{mode === "sent" ? "Sent" : "Date Added"}</th>
            <th className="px-4 py-3 font-semibold text-right">Connections</th>
            <th className="px-4 py-3 font-semibold">PO #</th>
            {mode !== "sent" && <th className="px-4 py-3 font-semibold">Status</th>}
            {mode !== "sent" && <th className="px-4 py-3 font-semibold text-right"></th>}
          </tr>
        </thead>
        <tbody>
          {groups.map(({ panel, target, active, completed, sentAt }) => (
            <tr
              key={panel.buildId}
              onClick={() => onSelect(panel.buildId)}
              className="border-b border-paper-100 last:border-0 cursor-pointer hover:bg-brand-50/60 transition-colors"
            >
              <td className="px-4 py-3 font-semibold text-ink-900 whitespace-nowrap">
                #{panel.jobNumber || panel.id}
                {unitLabel(panel) && (
                  <span className="ml-1.5 inline-block rounded-full bg-brand-50 text-brand-700 text-[10px] font-semibold px-1.5 py-0.5 align-middle">
                    {unitLabel(panel)}
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-ink-700">
                <span className="font-medium text-ink-900">{panel.customer}</span>
                {panel.order ? <span className="text-ink-500"> · {panel.order}</span> : null}
              </td>
              <td className="px-4 py-3 text-ink-600 whitespace-nowrap">
                {mode === "sent" ? formatDateTime(sentAt) : formatDate(panel.dateAdded)}
              </td>
              <td className="px-4 py-3 text-right font-semibold text-ink-900 whitespace-nowrap">
                {formatNumber(target)}
              </td>
              <td className="px-4 py-3 text-ink-600 whitespace-nowrap">{panel.poNumber || "—"}</td>
              {mode !== "sent" && (
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
              )}
              {mode !== "sent" && (
                <td
                  onClick={(e) => e.stopPropagation()}
                  className="px-4 py-3 whitespace-nowrap text-right"
                >
                  {confirmingBuildId === panel.buildId ? (
                    <span className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="date"
                        value={sentDate}
                        onChange={(e) => setSentDate(e.target.value)}
                        title="Date this panel actually shipped"
                        className="rounded border border-paper-200 px-1.5 py-0.5 text-[11px] text-ink-700"
                      />
                      <button
                        onClick={(e) => handleMarkSent(e, panel)}
                        className="text-[11px] font-semibold text-good-600 hover:text-good-700"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmingBuildId(null);
                        }}
                        className="text-[11px] font-semibold text-ink-400 hover:text-ink-600"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmingBuildId(panel.buildId);
                      }}
                      title="Log a completed Wrap for this panel without a real technician session — for a panel that's already physically shipped but was never scanned"
                      className="text-[11px] font-semibold text-ink-400 hover:text-good-600"
                    >
                      Mark Sent
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
