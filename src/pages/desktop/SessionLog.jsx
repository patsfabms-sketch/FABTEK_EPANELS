import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { Card, SectionTitle, StatCard, Button } from "../../components/ui";
import EditWorkHistoryModal from "../../components/EditWorkHistoryModal";

// A single logged session over this many hours gets a visual flag as
// "unusually long" — most task sessions are well under a shift, so this is
// the quickest way to spot a session that ran over before it got stopped
// (the exact "session time overran by accident" case this page exists for),
// even on an entry nobody happened to mark Flagged.
const LONG_SESSION_HOURS = 6;

// Same range buckets as Reports.jsx's Analytics page, for the same reason —
// these four cover what a shop actually checks day to day. Kept as a
// separate constant (not imported) since Reports.jsx's version isn't
// exported and duplicating four objects is simpler than threading an export
// through a page that has nothing else to do with Analytics.
const RANGE_OPTIONS = [
  { label: "Last 7 Days", days: 7 },
  { label: "Last 30 Days", days: 30 },
  { label: "Last 90 Days", days: 90 },
  { label: "All Time", days: null },
];
const STATUS_OPTIONS = ["All Statuses", "Verified", "Flagged"];
const SORT_OPTIONS = [
  { label: "Most Recent", value: "recent" },
  { label: "Longest Sessions", value: "longest" },
  { label: "Oldest First", value: "oldest" },
];

// Admin-wide session log: every logged work-history entry from every
// technician in one searchable, sortable place, with the same full-entry
// edit/delete tool EmployeeDetail.jsx uses per technician. Exists because
// the per-technician view only helps once you already know who to check —
// this page is for "something's off, but I don't know whose entry it is
// yet," which is exactly the situation a miskeyed field or a runaway
// session produces.
export default function SessionLog() {
  const { employees, workHistory, panels } = useApp();
  const [search, setSearch] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("All Employees");
  const [statusFilter, setStatusFilter] = useState("All Statuses");
  const [range, setRange] = useState(RANGE_OPTIONS[1]);
  const [sort, setSort] = useState("recent");
  const [editingEntry, setEditingEntry] = useState(null);

  // "Now" as component state (rather than calling Date.now() directly in
  // the render body) — same pattern used in Reports.jsx/AdminHome.jsx.
  // Refreshed every minute so the range cutoff doesn't quietly go stale on
  // a console left open all shift.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  const employeeById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  // A panel id can have more than one build on file (see the "repeat panel
  // builds" note in mockData.js) — resolve each entry's buildId back to a
  // job number the same way EmployeeDetail.jsx does, so entries against the
  // same panel don't look identical when they were actually different jobs.
  const jobNumberByBuildId = useMemo(() => new Map(panels.map((p) => [p.buildId, p.jobNumber])), [panels]);

  const rangeCutoff = useMemo(() => {
    if (!range.days) return null;
    return now - range.days * 86400000;
  }, [range.days, now]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workHistory.filter((h) => {
      if (rangeCutoff && (!h.createdAt || new Date(h.createdAt).getTime() < rangeCutoff)) return false;
      if (employeeFilter !== "All Employees" && h.employeeId !== employeeFilter) return false;
      if (statusFilter !== "All Statuses" && h.status !== statusFilter) return false;
      if (q) {
        const employee = employeeById.get(h.employeeId);
        const jobNumber = jobNumberByBuildId.get(h.buildId);
        const haystack = [employee?.name, h.panel, jobNumber, h.stage, h.date]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [workHistory, rangeCutoff, employeeFilter, statusFilter, search, employeeById, jobNumberByBuildId]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    if (sort === "longest") {
      rows.sort((a, b) => (b.hours || 0) - (a.hours || 0));
    } else if (sort === "oldest") {
      rows.sort((a, b) => (new Date(a.createdAt || 0).getTime()) - (new Date(b.createdAt || 0).getTime()));
    } else {
      rows.sort((a, b) => (new Date(b.createdAt || 0).getTime()) - (new Date(a.createdAt || 0).getTime()));
    }
    return rows;
  }, [filtered, sort]);

  const flaggedCount = useMemo(() => filtered.filter((h) => h.status === "Flagged").length, [filtered]);
  const longCount = useMemo(() => filtered.filter((h) => (h.hours || 0) >= LONG_SESSION_HOURS).length, [filtered]);
  const totalHours = useMemo(() => Number(filtered.reduce((s, h) => s + (h.hours || 0), 0).toFixed(1)), [filtered]);

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ink-900">Session Log</h1>
        <p className="text-sm text-ink-500 mt-1">
          Every logged session across the whole team, in one place — search, sort, and correct any entry
        </p>
      </div>

      <div className="flex flex-wrap gap-4 mb-6">
        <StatCard label="Sessions Shown" value={sorted.length} sub={range.label} />
        <StatCard label="Total Hours" value={totalHours} sub={range.label} accent="text-brand-600" />
        <StatCard
          label="Flagged"
          value={flaggedCount}
          sub="Needs review"
          accent={flaggedCount > 0 ? "text-bad-600" : "text-ink-900"}
        />
        <StatCard
          label={`${LONG_SESSION_HOURS}+ Hour Sessions`}
          value={longCount}
          sub="Possible overrun"
          accent={longCount > 0 ? "text-warn-600" : "text-ink-900"}
        />
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search employee, panel, job #, or stage…"
          className="min-w-[220px] flex-1 rounded-lg border border-paper-200 bg-white px-3 py-2 text-[13px] text-ink-700"
        />
        <select
          value={employeeFilter}
          onChange={(e) => setEmployeeFilter(e.target.value)}
          className="rounded-lg border border-paper-200 bg-white px-3 py-2 text-[13px] font-medium text-ink-700"
        >
          <option value="All Employees">All Employees</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-paper-200 bg-white px-3 py-2 text-[13px] font-medium text-ink-700"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
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
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="rounded-lg border border-paper-200 bg-white px-3 py-2 text-[13px] font-medium text-ink-700"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {(search || employeeFilter !== "All Employees" || statusFilter !== "All Statuses" || range !== RANGE_OPTIONS[1] || sort !== "recent") && (
          <Button
            variant="ghost"
            onClick={() => {
              setSearch("");
              setEmployeeFilter("All Employees");
              setStatusFilter("All Statuses");
              setRange(RANGE_OPTIONS[1]);
              setSort("recent");
            }}
          >
            Clear Filters
          </Button>
        )}
      </div>

      <SectionTitle
        title="Logged Sessions"
        subtitle={`${sorted.length} session${sorted.length === 1 ? "" : "s"} · sessions of ${LONG_SESSION_HOURS}+ hours are highlighted as a possible overrun`}
      />
      <Card padded={false} className="overflow-x-auto">
        {sorted.length === 0 ? (
          <p className="text-xs text-ink-400 text-center py-8">No sessions match these filters.</p>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-ink-500 border-b border-paper-200">
                <th className="px-4 py-3 font-semibold">Employee</th>
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
              {sorted.map((h, i) => {
                const employee = employeeById.get(h.employeeId);
                const isLong = (h.hours || 0) >= LONG_SESSION_HOURS;
                return (
                  <tr
                    key={h.id}
                    className={`border-b border-paper-100 last:border-0 ${
                      isLong ? "bg-warn-50/50" : i % 2 === 1 ? "bg-paper-50/60" : ""
                    }`}
                  >
                    <td className="px-4 py-2.5 text-ink-900 font-medium">
                      {employee ? (
                        <Link to={`/team/${employee.id}`} className="hover:text-brand-600">
                          {employee.name}
                        </Link>
                      ) : (
                        <span className="text-ink-400">Unknown employee</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-ink-600">{h.date}</td>
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
                    <td className={`px-4 py-2.5 font-medium ${isLong ? "text-warn-600" : "text-ink-700"}`}>
                      {h.hours}
                      {isLong && <span className="ml-1 text-[10px] font-semibold text-warn-600">long</span>}
                    </td>
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
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {editingEntry && (
        <EditWorkHistoryModal
          entry={editingEntry}
          employeeName={employeeById.get(editingEntry.employeeId)?.name ?? "Unknown employee"}
          onClose={() => setEditingEntry(null)}
        />
      )}
    </div>
  );
}
