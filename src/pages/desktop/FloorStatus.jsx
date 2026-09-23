import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { ROLES, isClockedIn, effectiveElapsedMs, unitLabel } from "../../data/mockData";
import { Card, SectionTitle, StatCard, RoleBadge, Avatar } from "../../components/ui";

// Pat's request (verbatim): "i need to make this its own tab on the left
// side to where we can see an over view of everyone and what session they
// are logged into if any at all" — asked right after seeing Dashboard's
// "Active Station Operators" list (which only shows the first 6 technicians
// who happen to be mid-session, with a "View All Active Crew" link that just
// goes to the Panels page). This is the dedicated page that was missing:
// every employee on the roster, one row each, always — not just the ones
// currently active — so "who's doing what right now" has one place to check
// without hunting through Panels or Team.
//
// Three states, derived live from data this app already collects (no new
// table, no new fields):
//   - Active   — has an open row in activeSessions (they scanned a panel and
//                picked a stage; same source Dashboard's operator list and
//                the mobile ActiveSession screen both already read).
//   - Idle     — clocked in on the shop's Clock QR (assemblyos_clock_log,
//                Update 6) but not currently scanned into a panel session.
//   - Off      — not clocked in at all right now.
// "Idle" only exists because the Clock QR gives this app a real presence
// signal independent of task sessions (Update 13's Non-Productive Time
// rework leans on the same distinction) — before that existed, there was no
// way to tell "clocked in, between panels" apart from "not here today."

function formatElapsed(ms) {
  if (ms == null || ms < 0) return "—";
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

const STATUS_META = {
  active: { label: "Active", order: 0, dot: "bg-good-500 animate-pulse", text: "text-good-600", bg: "bg-good-50" },
  idle: { label: "Clocked In — Idle", order: 1, dot: "bg-warn-500", text: "text-warn-600", bg: "bg-warn-50" },
  off: { label: "Not Clocked In", order: 2, dot: "bg-paper-300", text: "text-ink-400", bg: "bg-paper-50" },
};

export default function FloorStatus() {
  const { employees, activeSessions, clockLog, panels } = useApp();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  // Elapsed times (in an active session, or since clock-in) tick forward on
  // their own — refreshed every 30s, frequent enough that this page reads as
  // "live" without re-rendering the whole roster every second the way a
  // single technician's own stopwatch does.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const sessionByEmployeeId = useMemo(() => {
    const map = new Map();
    activeSessions.forEach((s) => map.set(s.employeeId, s));
    return map;
  }, [activeSessions]);

  const openClockByEmployeeId = useMemo(() => {
    const map = new Map();
    clockLog.forEach((c) => {
      if (!c.clockedOutAt) map.set(c.employeeId, c);
    });
    return map;
  }, [clockLog]);

  const rows = useMemo(() => {
    return employees.map((e) => {
      const session = sessionByEmployeeId.get(e.id) ?? null;
      const openClock = openClockByEmployeeId.get(e.id) ?? null;
      const status = session ? "active" : isClockedIn(clockLog, e.id) ? "idle" : "off";
      const panel = session ? panels.find((p) => `#${p.id}` === session.panel && p.buildId === session.buildId) : null;
      const elapsedMs = session
        ? effectiveElapsedMs(session.startedAt, now)
        : openClock
        ? now - openClock.clockedInAt
        : null;
      return { employee: e, session, panel, openClock, status, elapsedMs };
    });
  }, [employees, sessionByEmployeeId, openClockByEmployeeId, clockLog, panels, now]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => roleFilter === "all" || r.employee.role === roleFilter)
      .filter(
        (r) =>
          !q ||
          r.employee.name.toLowerCase().includes(q) ||
          (r.session?.stage ?? "").toLowerCase().includes(q) ||
          (r.session?.panel ?? "").toLowerCase().includes(q)
      )
      .sort((a, b) => {
        const orderDiff = STATUS_META[a.status].order - STATUS_META[b.status].order;
        if (orderDiff !== 0) return orderDiff;
        return a.employee.name.localeCompare(b.employee.name);
      });
  }, [rows, query, roleFilter]);

  const counts = useMemo(
    () => ({
      active: rows.filter((r) => r.status === "active").length,
      idle: rows.filter((r) => r.status === "idle").length,
      off: rows.filter((r) => r.status === "off").length,
    }),
    [rows]
  );

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-bold text-ink-900">Floor Status</h1>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-good-50 text-good-600 text-xs font-semibold px-3 py-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-good-500 animate-pulse" /> Live
        </span>
      </div>
      <p className="text-sm text-ink-500 mb-6">
        Every technician on the roster and what they're doing right now — no scrolling through Panels or Team to
        piece it together.
      </p>

      <div className="flex flex-wrap gap-4 mb-6">
        <StatCard label="On Roster" value={employees.length} sub="Total employees" />
        <StatCard label="Active" value={counts.active} sub="Currently scanned into a panel" accent="text-good-600" />
        <StatCard label="Clocked In — Idle" value={counts.idle} sub="On the clock, between sessions" accent="text-warn-600" />
        <StatCard label="Not Clocked In" value={counts.off} sub="Not currently on the shop's Clock QR" />
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, panel, or task…"
          className="min-w-[220px] flex-1 rounded-lg border border-paper-200 bg-white px-3 py-2 text-[13px] text-ink-700"
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="rounded-lg border border-paper-200 bg-white px-3 py-2 text-[13px] font-medium text-ink-700"
        >
          <option value="all">All Roles</option>
          <option value={ROLES.LEAD}>{ROLES.LEAD}</option>
          <option value={ROLES.TECH}>{ROLES.TECH}</option>
        </select>
      </div>

      <Card>
        <SectionTitle title="Everyone, Right Now" subtitle="Sorted active first, then clocked-in idle, then off the clock" />

        {filteredRows.length === 0 ? (
          <p className="text-xs text-ink-400 text-center py-8">No one matches this search.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[11px] font-semibold text-ink-400 uppercase tracking-wide border-b border-paper-100">
                  <th className="py-2 pr-3">Employee</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Working On</th>
                  <th className="py-2 pr-3 text-right">Elapsed</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(({ employee, session, panel, openClock, status, elapsedMs }) => {
                  const meta = STATUS_META[status];
                  return (
                    <tr
                      key={employee.id}
                      onClick={() => navigate(`/team/${employee.id}`)}
                      className="cursor-pointer hover:bg-brand-50/40 border-b border-paper-100 last:border-0"
                    >
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Avatar employee={employee} />
                          <div className="min-w-0">
                            <p className="text-[13px] font-medium text-ink-900 truncate">{employee.name}</p>
                            <RoleBadge role={employee.role} />
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 pr-3">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full ${meta.bg} ${meta.text} text-[11px] font-semibold px-2.5 py-1`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                          {meta.label}
                        </span>
                        {status === "idle" && openClock?.inLocationFlagged && (
                          <span className="ml-1.5 inline-block rounded-full bg-bad-50 text-bad-600 text-[10px] font-semibold px-1.5 py-0.5 align-middle">
                            Flagged
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3">
                        {session ? (
                          <div>
                            <p className="text-[13px] font-medium text-ink-900">
                              {session.stage}
                              {panel && unitLabel(panel) && (
                                <span className="ml-1.5 inline-block rounded-full bg-brand-50 text-brand-700 text-[10px] font-semibold px-1.5 py-0.5 align-middle">
                                  {unitLabel(panel)}
                                </span>
                              )}
                            </p>
                            <p className="text-[11px] text-ink-500">Panel {session.panel}</p>
                          </div>
                        ) : status === "idle" ? (
                          <span className="text-[13px] text-ink-400">Not in a session</span>
                        ) : (
                          <span className="text-[13px] text-ink-300">—</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-right">
                        <span className="text-[13px] font-semibold text-ink-900 tabular-nums">
                          {formatElapsed(elapsedMs)}
                        </span>
                        {status === "idle" && (
                          <p className="text-[10px] text-ink-400">since clock-in</p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
