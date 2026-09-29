// ---------------------------------------------------------------------------
// AssemblyOS mock data + generators.
// This stands in for a real backend: every number that appears in the UI is
// derived from this data (or computed live from it), not hard-coded per page.
// ---------------------------------------------------------------------------

// Admins are the people who can log into the manager desktop console — a
// separate group from the technician roster (no role/pay rate/attainment).
// password is null until the admin sets it themselves on first login.
export const initialAdmins = [{ id: "admin1", name: "Pat Warren", username: "Pwarren", password: null }];

export const ROLES = {
  LEAD: "Lead Panel Technician",
  TECH: "Panel Technician",
};

export const ROLE_META = {
  [ROLES.LEAD]: {
    unit: "hours",
    unitShort: "hrs",
    color: "text-[#5c3fc9]",
    bg: "bg-[#f1edfd]",
    dot: "bg-[#7c5cf0]",
  },
  [ROLES.TECH]: {
    unit: "hours",
    unitShort: "hrs",
    color: "text-good-600",
    bg: "bg-good-50",
    dot: "bg-good-500",
  },
};

// Team-wide defaults, editable on the Goal Management page. Hours worked per
// day/week — the unit every technician's time is actually logged in, since
// wiring work isn't done in countable discrete units (see taskProgress below).
export const initialRoleDefaults = {
  [ROLES.LEAD]: { daily: 7, weekly: 35 },
  [ROLES.TECH]: { daily: 8, weekly: 40 },
};

// currentWeekAvg is the technician's measured average hours/day this week —
// this is the "actual" side of the attainment calculation. Starts empty —
// add real technicians from the Team page.
export const initialEmployees = [];

export function attainment(employee, roleDefaults) {
  const target = employee.override ?? roleDefaults[employee.role].daily;
  if (!target) return 0;
  return Math.round((employee.currentWeekAvg / target) * 100);
}

export function attainmentTone(pct) {
  if (pct >= 100) return "good";
  if (pct >= 90) return "warn";
  return "bad";
}

// first initial + last name, lowercased, deduped against existing usernames
// by appending a number (mvance, mvance2, mvance3, ...).
export function generateUsername(name, existingUsernames = []) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = (parts[0]?.[0] ?? "u").toLowerCase();
  const last = (parts[parts.length - 1] ?? "ser").toLowerCase().replace(/[^a-z]/g, "");
  const base = `${first}${last}` || "user";
  let username = base;
  let n = 2;
  while (existingUsernames.includes(username)) {
    username = `${base}${n}`;
    n += 1;
  }
  return username;
}

// Sums how much of a (panel, stage) task has been completed across every
// technician who has logged work on it — see AppContext.startSession /
// stopSession for how a session's contribution gets attributed and capped.
//
// buildId scopes this to one specific build of the panel (see the "repeat
// panel builds" comment block below) — pass it whenever it's known. Without
// it, progress would wrongly carry over from a previous build of the same
// panel id (e.g. a brand-new repeat order would look "already 100% done"
// because the last time this panel was built, it was finished).
export function taskProgress(workHistory, panelTag, stage, buildId) {
  const total = workHistory
    .filter(
      (h) => h.panel === panelTag && h.stage === stage && (buildId === undefined || h.buildId === buildId)
    )
    .reduce((sum, h) => sum + (h.percentAdded ?? 0), 0);
  return Math.max(0, Math.min(100, total));
}

// Threshold for auto-flagging a single session's reported connections/hour
// rate for supervisor review — see AppContext.stopSession. Set from Pat's
// own top performer ("a little over 60 connections per hour, on paper") as
// the practical ceiling for one session; anything reported above it is
// unusual enough to be worth a second look rather than trusted at face
// value. Exported (not inlined) so Session Log / EmployeeDetail can show
// the same number the flag was judged against, and so it's a single place
// to retune if shop performance genuinely changes.
export const CONNECTIONS_PER_HOUR_REVIEW_THRESHOLD = 60;

// Per-entry connections/hour, or null when there's nothing meaningful to
// divide (no hours logged, or no connections credited — e.g. a non-connect
// stage) — used wherever a single session's rate needs to be shown or
// checked against the review threshold above. Deliberately per-entry, not
// an average across many sessions like computeEmployeeLeaderboard's
// connectionsPerHour — a single unusually fast session is exactly what
// this is meant to catch, even if that technician's overall average looks
// normal.
export function connectionsPerHour(connectionsCredited, hours) {
  if (!connectionsCredited || !hours || hours <= 0) return null;
  return Number((connectionsCredited / hours).toFixed(1));
}

// ---------------------------------------------------------------------------
// Repeat panel builds
//
// A panel "id" identifies a reusable panel model/part number (the tag
// embedded in the QuickBooks estimate's Description cell), not a single job
// — the same design can get built again for a new order down the road, each
// time under its own job number and PO. AppContext.importEstimates appends a
// new entry (its own buildId) to `panels` whenever it sees a *new* job
// number for an id it's already seen, rather than overwriting the old one —
// so `panels` naturally accumulates every build a given panel id has ever
// had. `id` repeats across those entries; `buildId` is what's actually
// unique per entry, and what workHistory/activeSessions rows are stamped
// with so each build's own hours/progress stay separate from any other
// build of the same panel.
// ---------------------------------------------------------------------------

// The build a technician should be scanning into right now for a given
// panel id — always the most recently imported one (later entries in the
// array win). Older entries sharing the same id are read-only history.
export function currentBuilds(panels) {
  const latestById = new Map();
  panels.forEach((p) => latestById.set(p.id, p));
  return Array.from(latestById.values());
}

// Every build (past and current) that shares a panel id, in the order they
// were imported — the comparison list for "how has this job's time trended."
export function siblingBuilds(panels, id) {
  return panels.filter((p) => p.id === id);
}

// Hours/connections/sessions actually logged against one specific build —
// not the panel id's whole lifetime.
export function computeBuildStats(workHistory, panel) {
  const tag = `#${panel.id}`;
  const rows = workHistory.filter((h) => h.panel === tag && h.buildId === panel.buildId);
  const totalHours = rows.reduce((s, h) => s + (h.hours || 0), 0);
  const totalConnections = rows.reduce((s, h) => s + (h.connectionsCredited || 0), 0);
  return {
    sessions: rows.length,
    hours: Number(totalHours.toFixed(1)),
    connections: totalConnections,
    completedTasks: rows.filter((h) => h.taskCompleted).length,
  };
}

// Everything below starts empty — this app ships with no fake people, panels,
// or history. The manager adds real technicians (Team page), imports a real
// QuickBooks estimate (Estimates page), and real work history/active sessions
// accumulate from there as technicians actually log in and work.
export const initialActivityFeed = [];

// employeeId ties an entry back to whoever logged it — mobile pages (Home,
// History, Profile) filter this down to just the signed-in technician's own
// entries; the manager Panels page reads the full, unfiltered list.
//
// percentAdded is how much of the (panel, stage) task this session's
// contribution represents, in the technician's own estimate (10% increments).
// A task isn't "done" until contributions across everyone who worked it sum
// to 100 — see taskProgress() above — so credit for a task finished across
// multiple people/days splits by what each person actually reported adding.
export const initialWorkHistory = [];

// Technicians currently scanned into a panel right now, live — multiple
// people can be on the same panel doing different stages simultaneously.
export const initialActiveSessions = [];

// Default $/connection applied to a panel at the moment it's imported — see
// the note on `pricePerConnection` below for why this is a snapshot rather
// than a live shared setting. Managers can adjust the default (used for
// future imports) on the Estimates page.
export const initialPricePerConnection = 0.75;

// Panel registry — populated by importing a QuickBooks estimate on the
// manager Estimates page. `price` is the estimate line amount for the panel.
// Each panel carries its own `pricePerConnection`, locked in at the moment
// it was imported — NOT the shop's current default rate — so raising the
// rate going forward never silently reprices work that was already quoted
// or built. Its connection count is derived from price / that panel's own
// rate, not stored.
export const initialPanels = [];

// fallbackRate covers panels persisted before this field existed, which
// have no pricePerConnection of their own — for those (and only those) this
// falls back to the shop's current default rate.
export function connectionsForPanel(panel, fallbackRate) {
  const rate = panel?.pricePerConnection ?? fallbackRate;
  if (!panel || !rate) return 0;
  return Math.round(panel.price / rate);
}

// When an estimate line item has Qty > 1 (e.g. "2" identical panels on one
// order), the importer splits it into that many separate, independently
// trackable panel records — see estimateImport.js — each carrying its own
// unitIndex (1-based) and unitCount (the original qty) so the UI can label
// them "Unit 1 of 2" / "Unit 2 of 2" and a person can tell which physical
// panel is which. Returns "" for an ordinary single-unit panel (unitCount
// unset or 1) so callers can just do `{unitLabel(panel) && ...}`.
export function unitLabel(panel) {
  if (!panel?.unitCount || panel.unitCount <= 1) return "";
  return `Unit ${panel.unitIndex} of ${panel.unitCount}`;
}

// Paid break windows — every day, regardless of when any individual work
// session happens to start or stop, no time inside these windows is ever
// credited as logged work. Expressed as [startMinute, endMinute] since
// midnight, in the clock's local time (the same clock session.startedAt
// already uses), so this reads directly against wall-clock time rather than
// depending on anything about the session itself.
export const BREAK_WINDOWS = [
  { label: "Morning break", startMinute: 9 * 60 + 15, endMinute: 9 * 60 + 30 }, // 9:15–9:30 am
  { label: "Lunch", startMinute: 11 * 60, endMinute: 11 * 60 + 30 }, // 11:00–11:30 am
  { label: "Afternoon break", startMinute: 15 * 60 + 15, endMinute: 15 * 60 + 30 }, // 3:15–3:30 pm
];

// How much of [startedAt, endedAt) (both epoch ms) falls inside a break
// window on any day the session touches. Walks day-by-day from the
// session's start date through its end date so a session that happens to
// run past midnight (rare, but not impossible for an overnight shift) still
// gets every day's break windows checked, not just the first.
function breakOverlapMs(startedAt, endedAt) {
  if (!(endedAt > startedAt)) return 0;
  let overlap = 0;
  const dayCursor = new Date(startedAt);
  dayCursor.setHours(0, 0, 0, 0);
  for (let dayStart = dayCursor.getTime(); dayStart <= endedAt; dayStart += 86400000) {
    BREAK_WINDOWS.forEach((w) => {
      const breakStart = dayStart + w.startMinute * 60000;
      const breakEnd = dayStart + w.endMinute * 60000;
      const lo = Math.max(startedAt, breakStart);
      const hi = Math.min(endedAt, breakEnd);
      if (hi > lo) overlap += hi - lo;
    });
  }
  return overlap;
}

// The actual "hours worked" clock for a session — raw elapsed time minus
// whatever portion of it fell inside a break window. Used both for the
// live-ticking stopwatch a technician sees on the Active Session screen and
// for the hours actually recorded when they stop, so what's displayed while
// working always matches what gets logged (never floors to negative).
export function effectiveElapsedMs(startedAt, endedAt) {
  if (!startedAt) return 0;
  const raw = Math.max(0, endedAt - startedAt);
  return Math.max(0, raw - breakOverlapMs(startedAt, endedAt));
}

// ---------------------------------------------------------------------------
// Non-productive time — every minute a Panel Technician was clocked in (via
// the shared Clock In/Out QR they scan on arrival and departure — see
// assemblyos_clock_log / the `clockLog` state) that ISN'T covered by a
// logged production session (and isn't already a paid break — see
// BREAK_WINDOWS above). Capacity used to mean a fixed 7:00am–4:30pm shift
// window for everyone; now that every technician scans in and out for real,
// capacity is each technician's OWN actual clocked-in time that day instead
// of an assumed schedule. Because this is now driven by a real attendance
// signal, a day where someone clocked in but never logged a session now
// correctly shows up as a fully non-productive day, instead of being
// silently skipped — which doubles as an attendance record (see the
// Clock In/Out History table).
//
// Scoped to Panel Technicians only (ROLES.TECH), same as before — Leads
// don't punch this same Clock In/Out QR flow today, so there's no clock
// signal to derive their capacity from either.

// Local calendar-day key ("2026-08-31") for a timestamp (epoch ms or an ISO
// string both work — `new Date()` accepts either), or null if the timestamp
// is missing/unparseable. workHistory rows are bucketed to a day by
// `createdAt` (the real DB-assigned timestamp), not the `date` display
// string, since `date` has no year in it — same reasoning as the trend
// charts (see fromDbWorkHistory's comment on createdAt).
export function dayKeyFor(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Per-day non-productive breakdown for one technician, most recent day
// first: [{ dayKey, label, loggedHours, capacityHours, nonProductiveHours }].
//
// Which days show up here is driven by `clockLog`, not by which days have
// logged sessions — a day only appears if the technician actually clocked
// in, and once it does, ALL of their clocked-in time that day counts as
// capacity, even on days with nothing logged against it.
//
// A clock entry that's still open (no clockedOutAt) is capped at "now" if
// it's today's entry, or at the end of that calendar day if it's a forgotten
// clock-out from a past day — the same caution the app already applies to a
// still-running panel session (see finalizeActiveSession in AppContext.jsx)
// — so one missed clock-out doesn't balloon into days of phantom
// non-productive time.
export function computeNonProductiveTime(workHistory, clockLog, employeeId, { now = Date.now() } = {}) {
  const todayKey = dayKeyFor(now);

  // Group this technician's clock entries by the calendar day they clocked
  // IN on (an entry that happens to run past midnight is still counted
  // against its start day, same as a workHistory session would be).
  const clockByDay = new Map();
  clockLog.forEach((c) => {
    if (c.employeeId !== employeeId) return;
    const key = dayKeyFor(c.clockedInAt);
    if (!key) return;
    if (!clockByDay.has(key)) clockByDay.set(key, { sampleDate: new Date(c.clockedInAt), entries: [] });
    clockByDay.get(key).entries.push(c);
  });

  // Logged production hours for this technician, summed per calendar day —
  // same source/calc as before, just pre-grouped for a quick lookup below.
  const loggedMsByDay = new Map();
  workHistory.forEach((h) => {
    if (h.employeeId !== employeeId) return;
    const key = dayKeyFor(h.createdAt);
    if (!key) return; // no reliable timestamp — can't bucket this row to a day
    loggedMsByDay.set(key, (loggedMsByDay.get(key) || 0) + (h.hours || 0) * 3600000);
  });

  const results = [...clockByDay.entries()].map(([key, { sampleDate, entries }]) => {
    const dayStart = new Date(sampleDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = dayStart.getTime() + 86400000;

    const capacityMs = entries.reduce((sum, c) => {
      const start = c.clockedInAt;
      const end = c.clockedOutAt ?? (key === todayKey ? now : dayEnd);
      return sum + effectiveElapsedMs(start, end);
    }, 0);
    const loggedMs = loggedMsByDay.get(key) || 0;
    const nonProductiveMs = Math.max(0, capacityMs - loggedMs);

    return {
      dayKey: key,
      label: dayStart.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
      loggedHours: Number((loggedMs / 3600000).toFixed(1)),
      capacityHours: Number((capacityMs / 3600000).toFixed(1)),
      nonProductiveHours: Number((nonProductiveMs / 3600000).toFixed(1)),
    };
  });

  return results.sort((a, b) => (a.dayKey < b.dayKey ? 1 : -1));
}

// Shop-wide roll-up across every Panel Technician in `employees`, for the
// Reports page. `workHistory` and `clockLog` are expected to already be
// whatever range/role/employee filter the page has applied — same pattern as
// every other Reports.jsx computation, so this automatically respects the
// page's date-range picker.
// Sorted by most non-productive hours first, so the technicians it's most
// worth asking about float to the top.
export function computeNonProductiveSummary(workHistory, clockLog, employees) {
  const perEmployee = employees
    .filter((e) => e.role === ROLES.TECH)
    .map((emp) => {
      const days = computeNonProductiveTime(workHistory, clockLog, emp.id);
      const totalLoggedHours = Number(days.reduce((s, d) => s + d.loggedHours, 0).toFixed(1));
      const totalCapacityHours = Number(days.reduce((s, d) => s + d.capacityHours, 0).toFixed(1));
      const totalNonProductiveHours = Number(days.reduce((s, d) => s + d.nonProductiveHours, 0).toFixed(1));
      return {
        employeeId: emp.id,
        name: emp.name,
        daysTracked: days.length,
        totalLoggedHours,
        totalCapacityHours,
        totalNonProductiveHours,
        nonProductivePct: totalCapacityHours > 0 ? Math.round((totalNonProductiveHours / totalCapacityHours) * 100) : 0,
      };
    })
    .sort((a, b) => b.totalNonProductiveHours - a.totalNonProductiveHours);

  const totalNonProductiveHours = Number(perEmployee.reduce((s, e) => s + e.totalNonProductiveHours, 0).toFixed(1));
  const totalCapacityHours = Number(perEmployee.reduce((s, e) => s + e.totalCapacityHours, 0).toFixed(1));
  return {
    perEmployee,
    totalNonProductiveHours,
    totalCapacityHours,
    nonProductivePct: totalCapacityHours > 0 ? Math.round((totalNonProductiveHours / totalCapacityHours) * 100) : 0,
  };
}

// The current payroll-week view of Non-Productive Time on an employee's own
// profile (EmployeeDetail.jsx) — Pat's correction to computeNonProductiveTime
// above: that function returns "the last N days this person actually clocked
// in," which is a rolling window that can reach back into the PRIOR payroll
// week (e.g. on the very first day of a new week, the last-7-tracked-days
// list was mostly last week's days). This instead always returns exactly the
// 7 calendar days of ONE payroll week (Wednesday through the following
// Tuesday — the same week payrollWeekRange/payrollWeekKey define), in
// chronological order, so Wednesday is always first and the rest of the week
// fills in below it day by day as the week actually happens — a day that
// hasn't occurred yet (or has occurred but nothing was clocked in) is
// `hasData: false` rather than being silently backfilled with an older day
// from a different week.
export function computeNonProductiveWeek(workHistory, clockLog, employeeId, { weekStart, now = Date.now() } = {}) {
  const start = weekStart ?? payrollWeekStart(new Date(now)).getTime();
  const byDayKey = new Map(computeNonProductiveTime(workHistory, clockLog, employeeId, { now }).map((d) => [d.dayKey, d]));

  const days = [];
  for (let i = 0; i < 7; i++) {
    const dayDate = new Date(start + i * 86400000);
    const key = dayKeyFor(dayDate.getTime());
    const existing = byDayKey.get(key);
    days.push({
      dayKey: key,
      label: dayDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
      hasOccurred: dayDate.getTime() <= now,
      hasData: !!existing,
      loggedHours: existing?.loggedHours ?? 0,
      capacityHours: existing?.capacityHours ?? 0,
      nonProductiveHours: existing?.nonProductiveHours ?? 0,
    });
  }
  return days;
}

// Weekly non-productive totals for one technician, bucketed into the same
// Wednesday-anchored payroll weeks as computeWeeklyPerformance/Payroll, most
// recent week first, plus the average non-productive hours/week across
// however many of those weeks have actually happened (capped at `weeks`) —
// the trend Pat asked for once the day-by-day view got scoped down to just
// the current, mostly-blank week: a single week in progress won't say much
// on its own, so this is what shows whether non-productive time is
// trending up, down, or holding steady week over week. A week with zero
// tracked days simply doesn't appear, same "don't fabricate a week that
// didn't happen" rule the rest of this feature already follows.
export function computeNonProductiveWeeklyTrend(workHistory, clockLog, employeeId, { weeks = 8, now = Date.now() } = {}) {
  const days = computeNonProductiveTime(workHistory, clockLog, employeeId, { now });
  const buckets = new Map();
  days.forEach((d) => {
    const dayDate = new Date(`${d.dayKey}T00:00:00`);
    if (Number.isNaN(dayDate.getTime())) return;
    const weekKey = payrollWeekKey(dayDate);
    if (!buckets.has(weekKey)) {
      buckets.set(weekKey, {
        weekKey,
        weekStart: payrollWeekStart(dayDate).getTime(),
        nonProductiveHours: 0,
        capacityHours: 0,
        loggedHours: 0,
        daysTracked: 0,
      });
    }
    const b = buckets.get(weekKey);
    b.nonProductiveHours += d.nonProductiveHours;
    b.capacityHours += d.capacityHours;
    b.loggedHours += d.loggedHours;
    b.daysTracked += 1;
  });

  const list = Array.from(buckets.values())
    .filter((b) => b.weekStart <= now)
    .map((b) => ({
      ...b,
      nonProductiveHours: Number(b.nonProductiveHours.toFixed(1)),
      capacityHours: Number(b.capacityHours.toFixed(1)),
      loggedHours: Number(b.loggedHours.toFixed(1)),
    }))
    .sort((a, b) => b.weekStart - a.weekStart)
    .slice(0, weeks);

  const avgNonProductiveHoursPerWeek = list.length
    ? Number((list.reduce((s, w) => s + w.nonProductiveHours, 0) / list.length).toFixed(1))
    : 0;

  return { weeks: list, avgNonProductiveHoursPerWeek };
}

// ---------------------------------------------------------------------------
// Clock entry review flags — a clock-in/out event worth a manager's second
// look. Two independent reasons feed this: the geofencing check on the scan
// itself (evaluateClockLocation, above) and simply being clocked in an
// implausibly long time — Pat's rule: "if someone is clocked in for more
// than 12 hrs it needs to be flagged and verified." Both reasons resolve the
// same way an admin already resolves any other flagged thing in this app
// (see workHistory.status "Flagged"/"Verified"): a human looks at it and
// marks it Verified (see updateClockLogEntry in AppContext.jsx) — editing
// the clock-in/out time to something that's no longer 12+ hours also
// resolves the long-duration reason on its own, since that reason is
// computed fresh from the (corrected) timestamps, not stored.
export const LONG_CLOCK_ENTRY_HOURS = 12;

// Raw gross duration for one clock entry, in hours — a still-open entry is
// measured against `now` rather than left unbounded, same caution
// computeNonProductiveTime already applies to an open clock entry.
export function clockEntryDurationHours(entry, now = Date.now()) {
  if (!entry?.clockedInAt) return 0;
  const end = entry.clockedOutAt ?? now;
  return Math.max(0, (end - entry.clockedInAt) / 3600000);
}

export function isLongClockEntry(entry, now = Date.now()) {
  return clockEntryDurationHours(entry, now) > LONG_CLOCK_ENTRY_HOURS;
}

// Whether the geofencing check flagged either side of this entry's scan —
// the same condition ClockLocationBadge already renders, pulled out here so
// the flagging logic lives in one place instead of being re-derived in the
// UI layer too.
function hasLocationFlag(entry) {
  const outApplies = entry.clockedOutAt && entry.outLocationFlagged !== null && entry.outLocationFlagged !== undefined;
  return !!entry.inLocationFlagged || !!(outApplies && entry.outLocationFlagged);
}

// The single source of truth for "does this clock entry need a manager's
// review right now" — true whenever it's a long entry or a location-flagged
// one, AND nobody has verified it yet. Once `verified` is set, this always
// returns false regardless of duration/location, exactly mirroring how a
// workHistory entry's own Flagged status can be cleared by an admin without
// having to change anything else about the entry.
export function isClockEntryFlagged(entry, now = Date.now()) {
  if (entry?.verified) return false;
  return isLongClockEntry(entry, now) || hasLocationFlag(entry);
}

// Human-readable reason(s) a flagged clock entry is flagged, for display on
// the Flagged tab / edit modal — a flagged entry can have more than one
// reason at once (e.g. clocked in 14 hrs AND the clock-out scan was off-site).
export function clockEntryFlagReasons(entry, now = Date.now()) {
  const reasons = [];
  if (isLongClockEntry(entry, now)) {
    reasons.push(`Clocked in ${clockEntryDurationHours(entry, now).toFixed(1)} hrs — over the ${LONG_CLOCK_ENTRY_HOURS} hr review threshold`);
  }
  if (entry.inLocationFlagged) reasons.push("Clock-in location flagged");
  const outApplies = entry.clockedOutAt && entry.outLocationFlagged !== null && entry.outLocationFlagged !== undefined;
  if (outApplies && entry.outLocationFlagged) reasons.push("Clock-out location flagged");
  return reasons;
}

// Every one of this employee's clock entries that currently needs review,
// most recently clocked-in first — feeds the Flagged tab on their profile.
export function computeFlaggedClockEntries(clockLog, employeeId, now = Date.now()) {
  return clockLog
    .filter((c) => c.employeeId === employeeId && isClockEntryFlagged(c, now))
    .map((c) => ({ ...c, flagReasons: clockEntryFlagReasons(c, now) }))
    .sort((a, b) => b.clockedInAt - a.clockedInAt);
}

// The string encoded into a panel's printed QR code. Kept as a single,
// namespaced convention (rather than the bare panel id) so a future real
// camera-scan implementation on the mobile app can reliably recognize an
// AssemblyOS panel sticker versus any other QR code someone might point the
// camera at. The job number rides along in the encoded value too — since the
// same panel id can recur across repeat builds (see the "repeat panel
// builds" note below), a future scan handler can use it the same way a
// human reading the sticker does, to tell which build a given physical
// sticker was printed for.
export function panelQrValue(panel) {
  return `ASSEMBLYOS:PANEL:${panel.id}:JOB:${panel.jobNumber || ""}`;
}

// Inverse of panelQrValue — parses a decoded camera scan back into
// {id, jobNumber}, or null if the code isn't a recognized AssemblyOS panel
// label (a stray QR code someone points the camera at, a barcode from
// something else on the shop floor, etc).
export function parsePanelQrValue(raw) {
  if (typeof raw !== "string") return null;
  const match = raw.match(/^ASSEMBLYOS:PANEL:(.+):JOB:([^:]*)$/);
  if (!match) return null;
  return { id: match[1], jobNumber: match[2] || "" };
}

// ---------------------------------------------------------------------------
// Time clock — the shared "master" QR code every employee scans with their
// own already-signed-in phone: once to clock in on arrival, again to clock
// out at the end of the day (see AppContext.clockScan). It isn't tied to any
// one employee — a single sheet is printed and posted at the shop's
// clock-in point; who it's for is whoever is signed into the phone doing
// the scanning. It encodes the ISO week it was printed for, so a stale
// printout — or a photo of one somebody tries to use from off-site after
// it's taken down — naturally stops working once the week rolls over; see
// isValidClockWeek for the exact grace window that keeps a late Monday
// reprint from locking the whole floor out of clocking in.
export function isoWeekKey(date = new Date()) {
  // Standard ISO 8601 week numbering: the Thursday of a given week decides
  // which year that week belongs to, and week 1 is the week containing that
  // year's first Thursday.
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // Sunday is 0 in JS — treat it as day 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // shift to this week's Thursday
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

export function clockQrValue(weekKey = isoWeekKey()) {
  return `ASSEMBLYOS:CLOCK:${weekKey}`;
}

// Inverse of clockQrValue — {weekKey} or null if the scanned code isn't a
// recognized AssemblyOS clock code at all (a panel sticker, a stray QR code
// someone points the camera at, etc). Whether that week is still valid to
// use is a separate check — see isValidClockWeek.
export function parseClockQrValue(raw) {
  if (typeof raw !== "string") return null;
  const match = raw.match(/^ASSEMBLYOS:CLOCK:(\d{4}-W\d{2})$/);
  if (!match) return null;
  return { weekKey: match[1] };
}

// Accepts this week's printout AND last week's — never anything older. The
// one-week grace window is deliberate: without it, a manager who's a day
// late reprinting on Monday morning would lock every technician out of
// clocking in until the new sheet goes up.
export function isValidClockWeek(weekKey, now = new Date()) {
  return weekKey === isoWeekKey(now) || weekKey === isoWeekKey(new Date(now.getTime() - 7 * 86400000));
}

// Whether an employee currently has an open clock-in (a clockLog row with no
// matching clock-out yet). This is the toggle AppContext.clockScan uses to
// decide whether the next master-QR scan for that employee means "clock in"
// or "clock out".
export function isClockedIn(clockLog, employeeId) {
  return clockLog.some((c) => c.employeeId === employeeId && !c.clockedOutAt);
}

// ---------------------------------------------------------------------------
// Clock QR geofencing — checks a clock-in/out scan against "were they
// actually at the shop." Deliberately "allow it, but flag for review" rather
// than a hard block (the design Pat picked when this was scoped out): a bad
// GPS fix, a phone with location services off, or someone legitimately
// stepping just outside the radius to get signal shouldn't stop a technician
// from clocking in for their shift — but a scan from well outside the shop,
// or one with no location at all, is worth a manager's eyes. See
// evaluateClockLocation below and AppContext.clockScan, which calls it.
//
// FabTek Industries — 19171 Hwy 51, Hazlehurst, MS 39083 (geocoded via the
// US Census Bureau's public geocoder, which matched this address exactly).
// If the shop ever moves, or the radius needs to change, these three
// constants are the only thing to touch.
export const SHOP_LOCATION = { lat: 31.921913609283, lng: -90.396000564484 };
export const CLOCK_GEOFENCE_RADIUS_FT = 500;

// Great-circle (haversine) distance between two lat/lng points, in feet.
export function distanceFeet(lat1, lng1, lat2, lng2) {
  const EARTH_RADIUS_FT = 20925721; // Earth's mean radius, in feet
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_FT * c;
}

// Turns whatever the phone reported for a clock scan (a {lat, lng} fix, or
// null if location was unavailable, denied, or timed out) into the fields
// AppContext.clockScan stores on that clock log row: the coordinates seen
// (if any), the distance from the shop in feet (null with no fix), and
// whether this scan should be flagged for a manager to review. A missing fix
// is flagged too — no location on file means there's nothing to confirm they
// were on-site, which is exactly the situation review exists to catch.
// Flagging never blocks the scan itself; see the comment above.
export function evaluateClockLocation(coords) {
  if (!coords || typeof coords.lat !== "number" || typeof coords.lng !== "number") {
    return { lat: null, lng: null, distanceFt: null, flagged: true };
  }
  const distanceFt = Math.round(distanceFeet(coords.lat, coords.lng, SHOP_LOCATION.lat, SHOP_LOCATION.lng));
  return {
    lat: coords.lat,
    lng: coords.lng,
    distanceFt,
    flagged: distanceFt > CLOCK_GEOFENCE_RADIUS_FT,
  };
}

// Stages a technician can pick after scanning a panel's QR code.
export const productionStages = [
  { key: "prep", label: "Panel Prep" },
  { key: "verify", label: "Verifying Packout" },
  { key: "sort", label: "Sorting" },
  { key: "build", label: "Control Panel Build" },
  { key: "connect", label: "Route/Terminate" },
  { key: "test", label: "Continuity Test" },
  { key: "qc", label: "QC" },
  { key: "wrap", label: "Wrap" },
  { key: "label", label: "Labeling" },
  { key: "rework", label: "Rework" },
  { key: "subbuild", label: "Agastat Sub. Assm." },
  { key: "auxpanel", label: "Aux Panel Build" },
  { key: "auxswitch", label: "Aux Switch Assm." },
  { key: "relay", label: "Relay Panel Build" },
  // Not a real panel-build step like the others, but uses the exact same
  // scan-a-panel-and-log-a-session flow (see AppContext.startSession) — a
  // technician being trained scans in against whatever panel the training
  // is happening on, so the hours are captured for real rather than going
  // untracked. taskProgress is scoped per (panel, stage, buildId), so a
  // Training session's own progress bucket never mixes with any other
  // stage's — it shows up in hours/analytics like any other logged
  // session, it just isn't "build progress" in the way Route/Terminate or
  // Control Panel Build are, so Progress Added on a Training session is
  // typically left at 0%.
  { key: "training", label: "Training" },
];

// Key of the "Route/Terminate" stage — the one stage where progress logged
// translates directly into a connection count (see connectionsForPanel and
// AppContext.stopSession, which computes each session's connectionsCredited
// as (percentAdded / 100) * the panel's target connection count).
export const CONNECT_STAGE_KEY = "connect";
export const CONNECT_STAGE_LABEL = productionStages.find((s) => s.key === CONNECT_STAGE_KEY)?.label;

// Key of the "Wrap" stage — the last step in a normal routing (QC/Wrap used
// to be one combined step; see the split note below), so a build having a
// *completed* workHistory row here is this app's definition of "this panel
// actually shipped" (same signal Reports.jsx's "Panels Shipped" stat and
// computeAvgBuildTime below both key off of).
export const SHIP_STAGE_KEY = "wrap";
export const SHIP_STAGE_LABEL = productionStages.find((s) => s.key === SHIP_STAGE_KEY)?.label;

// "QC/Wrap" used to be a single combined session type; it's now two separate
// ones ("QC" and "Wrap") so a technician can scan/log each step on its own.
// A handful of sessions logged before this split still carry the old
// combined label verbatim — they still display and edit fine everywhere
// (Session Log, EmployeeDetail, EditWorkHistoryModal's stageOptions already
// keeps an entry's own stage selectable even once it's no longer in
// `productionStages`, same as any other retired stage), they just can no
// longer be logged fresh. The one place the old label still needs special
// handling is "did this panel ship" — without it, a panel that was already
// completed under the old combined step would wrongly stop counting as
// shipped the moment this split goes live.
const LEGACY_SHIP_STAGE_LABEL = "QC/Wrap";
export function isShippedSessionRow(h) {
  return !!h.taskCompleted && (h.stage === SHIP_STAGE_LABEL || h.stage === LEGACY_SHIP_STAGE_LABEL);
}

// Pat's request (Sept 23, Panels page): the "Scheduled Panels" list has no
// concept of a panel ever leaving it once it's done — a build with no
// active session sits there forever whether it's actually queued or it
// shipped months ago, which is why that list kept growing ("mighty long").
// This is the one place that decides "has this exact build actually gone
// out the door," reusing the same isShippedSessionRow signal as everywhere
// else in the app (Analytics build-time projections, the Dashboard
// throughput tile, weekly P&L revenue recognition) — a Sent list built on a
// second, different definition of "done" would just be a new way for the
// numbers to disagree with each other. Returns the real clock time Wrap
// finished (endedAt, Update 11) when available, falling back to the row's
// createdAt for anything logged before that field existed. If more than one
// completed Wrap row somehow exists on the same build (e.g. a corrected
// re-log), the earliest is used — that's when the panel actually left, not
// whenever it was most recently touched again afterward.
export function sentInfoForBuild(workHistory, panel) {
  const tag = `#${panel.id}`;
  const wrapRows = workHistory.filter(
    (h) => h.panel === tag && h.buildId === panel.buildId && isShippedSessionRow(h)
  );
  if (wrapRows.length === 0) return { isSent: false, sentAt: null };
  const times = wrapRows
    .map((h) => h.endedAt || h.createdAt)
    .filter(Boolean)
    .map((t) => new Date(t).getTime())
    .filter((t) => !Number.isNaN(t));
  return { isSent: true, sentAt: times.length ? Math.min(...times) : null };
}

const QC_STAGE_LABEL = productionStages.find((s) => s.key === "qc")?.label;

// Pat's question (Sept 23, looking at "Avg Panels Shipped / Day" on
// Analytics): "if they are marked wrapped that means they are complete.
// maybe they are not being marked as wrapped?" — checked directly against
// the real logged data, and the answer was yes: several builds have a
// *completed* QC session on file (sometimes QC re-verified a second time,
// sometimes with Rework logged after it) but never got a completed Wrap
// session logged at all, so they never count toward "shipped" even though
// everything on file says they're done.
//
// This does NOT change what "shipped" means (see isShippedSessionRow's own
// comment for why Wrap, not QC, is deliberately kept as this app's real
// finish line — QC is a checkpoint before the panel is actually wrapped and
// out the door, not the finish itself). What was missing was a way to
// *find* the gap: every build that cleared a completed QC but has no
// completed Wrap (or legacy combined "QC/Wrap") row on file at all —
// surfaced so Pat can either log the Wrap scan that got missed, or confirm
// the panel genuinely isn't done yet. Sorted oldest-activity-first, since a
// build with real work logged well past QC and then nothing for weeks is
// the most likely genuine "forgot to scan Wrap" case, versus one still
// actively moving through rework/re-verification.
export function computeMissingWrapPanels(panels, workHistory) {
  const wrappedBuildIds = new Set(workHistory.filter(isShippedSessionRow).map((h) => h.buildId));
  const qcDoneBuildIds = new Set(
    workHistory.filter((h) => h.taskCompleted && h.stage === QC_STAGE_LABEL).map((h) => h.buildId)
  );

  return panels
    .filter((panel) => qcDoneBuildIds.has(panel.buildId) && !wrappedBuildIds.has(panel.buildId))
    .map((panel) => {
      const timestamps = workHistory
        .filter((h) => h.buildId === panel.buildId && h.createdAt)
        .map((h) => new Date(h.createdAt).getTime())
        .filter((t) => !Number.isNaN(t));
      return {
        buildId: panel.buildId,
        id: panel.id,
        jobNumber: panel.jobNumber,
        customer: panel.customer,
        lastActivityAt: timestamps.length ? Math.max(...timestamps) : null,
      };
    })
    .sort((a, b) => (a.lastActivityAt ?? 0) - (b.lastActivityAt ?? 0));
}

// Key of the "Rework" stage — the one stage where stopping a session
// requires a short explanation of what went wrong (see ActiveSession.jsx's
// Stop Session flow), rather than just a progress percentage. Rework is
// meant to be a paper trail, not just logged time: every reworked entry
// records why it's being reworked, the root cause, and who the original
// work is attributed to — a real person, always, so there's someone to
// actually go ask what happened (see the "Attributed to" picker in
// ActiveSession.jsx, which no longer offers an "Unknown" out for a
// technician logging rework fresh; EditWorkHistoryModal's admin-correction
// view still recognizes an "Unknown" value already saved on an older
// entry, it just can't be chosen going forward), so the shop can spot a
// recurring root cause or a training gap instead of only ever seeing that
// rework happened.
export const REWORK_STAGE_KEY = "rework";
export const REWORK_STAGE_LABEL = productionStages.find((s) => s.key === REWORK_STAGE_KEY)?.label;

// Key of the "Verifying Packout" stage — where a Lead Panel Technician
// checks an incoming kit against its parts list before the build starts.
// Pat's request: when something required is missing, capture that as real
// structured data (not just a note that, until this update, was never
// actually saved anywhere — see the Stop Session "Notes" field and
// computePackoutIssues below) so a pattern of customer-supplied kits
// arriving short can be shown as real evidence, not recalled from memory.
export const VERIFY_STAGE_KEY = "verify";
export const VERIFY_STAGE_LABEL = productionStages.find((s) => s.key === VERIFY_STAGE_KEY)?.label;

// Every Verifying Packout session where the technician reported something
// was missing (packoutMissingParts === true) — one row per report, not
// deduplicated per panel, since Pat wants to see "all the issues," including
// a panel flagged more than once for different missing items.
//
// An issue counts as resolved once a LATER Verifying Packout session on the
// same build either reports packoutMissingParts === false (checked again,
// nothing missing that time) or taskCompleted === true (verification was
// finished) — whichever comes first chronologically after the report. If no
// such later session exists yet, the issue is still open and daysOpen is
// measured against `now`.
export function computePackoutIssues(panels, workHistory, employees, { now = Date.now() } = {}) {
  const employeeById = new Map(employees.map((e) => [e.id, e]));
  const panelByBuildId = new Map(panels.map((p) => [p.buildId, p]));

  const verifyRows = workHistory
    .filter((h) => h.stage === VERIFY_STAGE_LABEL && h.createdAt)
    .map((h) => ({ ...h, _t: new Date(h.createdAt).getTime() }))
    .filter((h) => !Number.isNaN(h._t))
    .sort((a, b) => a._t - b._t);

  const issues = [];
  verifyRows.forEach((h) => {
    if (h.packoutMissingParts !== true) return;
    const resolution = verifyRows.find(
      (later) =>
        later.buildId === h.buildId &&
        later._t > h._t &&
        (later.taskCompleted || later.packoutMissingParts === false)
    );
    const panel = panelByBuildId.get(h.buildId);
    const reportedBy = employeeById.get(h.employeeId);
    const endTime = resolution ? resolution._t : now;
    issues.push({
      id: h.id,
      buildId: h.buildId,
      panelTag: h.panel,
      panelId: panel?.id ?? (h.panel || "").replace(/^#/, ""),
      jobNumber: panel?.jobNumber ?? "",
      customer: panel?.customer ?? "",
      missingDescription: h.packoutMissingDescription || "",
      reportedById: h.employeeId,
      reportedByName: reportedBy?.name ?? "Unknown",
      reportedAt: h.createdAt,
      resolved: !!resolution,
      resolvedAt: resolution ? resolution.createdAt : null,
      daysOpen: Number(Math.max(0, (endTime - h._t) / 86400000).toFixed(1)),
    });
  });

  return issues.sort((a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime());
}

function stageStatsFromRows(rows, stage) {
  const stageRows = rows.filter((h) => h.stage === stage.label);
  if (stageRows.length === 0) return null;
  const totalHours = stageRows.reduce((s, h) => s + (h.hours || 0), 0);
  const completedTasks = stageRows.filter((h) => h.taskCompleted).length;
  const totalConnections = stageRows.reduce((s, h) => s + (h.connectionsCredited || 0), 0);
  return {
    key: stage.key,
    label: stage.label,
    sessions: stageRows.length,
    hours: Number(totalHours.toFixed(1)),
    avgHours: stageRows.length ? Number((totalHours / stageRows.length).toFixed(2)) : 0,
    completedTasks,
    totalConnections,
    connectionsPerHour: totalHours > 0 ? Number((totalConnections / totalHours).toFixed(1)) : 0,
    technicians: new Set(stageRows.map((h) => h.employeeId)).size,
  };
}

// Real per-employee output stats, computed from their actual logged work
// (workHistory), broken down by production stage. Replaces what used to be a
// seeded-random stand-in now that every technician's sessions produce real
// history — average hours per task, and for Route/Terminate specifically,
// average connections credited per hour (their real terminating rate).
export function computeStageStats(workHistory, employeeId) {
  const mine = workHistory.filter((h) => h.employeeId === employeeId);
  return productionStages.map((stage) => stageStatsFromRows(mine, stage)).filter(Boolean);
}

// Team-wide equivalent of computeStageStats — every technician's sessions
// combined, one row per production stage. This is the "how long does each
// part of the build process actually take" view: total shop hours sunk
// into a stage and the average hours a single task at that stage takes —
// whichever stage has the highest avgHours (or the most totalHours) is
// where the process is actually spending its time, i.e. the bottleneck.
export function computeTeamStageStats(workHistory) {
  // A "Mark as Sent" admin correction (see adminMarkPanelSent in
  // AppContext.jsx) is a real, completed Wrap row on purpose — every other
  // "is this panel done" check in the app should see it — but it's a 0-hour
  // record with no technician behind it, not a real timed session. Counting
  // it here would drag down the shop's actual average Wrap time and
  // over-count how many technicians have worked that stage, so it's
  // excluded from this specific "how long does each step really take" view.
  const realRows = workHistory.filter((h) => !h.loggedByAdmin);
  return productionStages.map((stage) => stageStatsFromRows(realRows, stage)).filter(Boolean);
}

// Week-to-week performance for one employee's profile view — hours,
// sessions, connections credited, and flagged-session count, bucketed by
// the same Wednesday-anchored payroll week used for overtime above (see
// payrollWeekKey/payrollWeekStart). Reused here rather than introducing a
// second, different "week" — once the shop's operating week starts
// Wednesday, that's the natural week-over-week grouping everywhere, not
// just for pay. Bucketed by `createdAt` (the real DB timestamp), same
// reasoning the trend charts elsewhere in this file already use — `date` is
// a display-only string with no year in it. Rows with no `createdAt` yet
// (shouldn't normally happen — see the comment on that field) are skipped
// rather than crashing. Most-recent-week-first, capped at `weeks` entries;
// a week with zero sessions simply doesn't appear (nothing to show), same
// "don't fabricate a day/week that didn't happen" philosophy already used
// for Non-Productive Time.
export function computeWeeklyPerformance(workHistory, employeeId, { weeks = 8, now = Date.now() } = {}) {
  const mine = workHistory.filter((h) => h.employeeId === employeeId && h.createdAt);
  const buckets = new Map();
  mine.forEach((h) => {
    const d = new Date(h.createdAt);
    if (Number.isNaN(d.getTime())) return;
    const weekKey = payrollWeekKey(d);
    if (!buckets.has(weekKey)) {
      buckets.set(weekKey, { weekKey, weekStart: payrollWeekStart(d).getTime(), hours: 0, sessions: 0, connections: 0, flagged: 0 });
    }
    const b = buckets.get(weekKey);
    b.hours += h.hours || 0;
    b.sessions += 1;
    b.connections += h.connectionsCredited || 0;
    if (h.status === "Flagged") b.flagged += 1;
  });
  return Array.from(buckets.values())
    .filter((b) => b.weekStart <= now)
    .map((b) => ({ ...b, hours: Number(b.hours.toFixed(2)) }))
    .sort((a, b) => b.weekStart - a.weekStart)
    .slice(0, weeks);
}

// "What they're good at, what they need to work on" for one employee's
// profile view — entirely derived from real logged sessions, nothing
// manually entered or seeded. Compares this employee's own average
// hours-per-session at each production stage against the shop-wide average
// for that same stage (computeTeamStageStats): lower avgHours is better
// (faster), so a stage where they run meaningfully faster than the shop
// average is a strength, meaningfully slower is an area to work on.
//
// Gated two ways so this doesn't read noise as a pattern: a stage only
// counts once BOTH this employee and the shop as a whole have logged at
// least INSIGHT_MIN_SESSIONS sessions there (one lucky or unlucky session
// shouldn't define a "finding"), and only once the difference from the shop
// average is at least INSIGHT_MIN_PCT_DIFF (ordinary day-to-day variation
// shouldn't either). Also reports two signals that aren't stage-specific:
// this employee's overall Flagged rate, and how many times a Rework entry
// (see the Rework-attribution update) has named them as the root cause —
// both worth a manager's attention even though neither is a "stage."
export const INSIGHT_MIN_SESSIONS = 3;
const INSIGHT_MIN_PCT_DIFF = 0.15;

export function computeEmployeeInsights(workHistory, employeeId) {
  const mineStats = computeStageStats(workHistory, employeeId);
  const teamStats = computeTeamStageStats(workHistory);
  const teamByKey = new Map(teamStats.map((s) => [s.key, s]));

  const comparisons = mineStats
    .map((mine) => {
      const team = teamByKey.get(mine.key);
      if (!team || mine.sessions < INSIGHT_MIN_SESSIONS || team.sessions < INSIGHT_MIN_SESSIONS || team.avgHours <= 0) {
        return null;
      }
      const pctDiff = (team.avgHours - mine.avgHours) / team.avgHours; // positive = faster than the shop average
      return { key: mine.key, label: mine.label, mineAvgHours: mine.avgHours, teamAvgHours: team.avgHours, pctDiff };
    })
    .filter(Boolean);

  const strengths = comparisons
    .filter((c) => c.pctDiff >= INSIGHT_MIN_PCT_DIFF)
    .sort((a, b) => b.pctDiff - a.pctDiff)
    .slice(0, 3);
  const improvements = comparisons
    .filter((c) => c.pctDiff <= -INSIGHT_MIN_PCT_DIFF)
    .sort((a, b) => a.pctDiff - b.pctDiff)
    .slice(0, 3);

  const mine = workHistory.filter((h) => h.employeeId === employeeId);
  const flaggedCount = mine.filter((h) => h.status === "Flagged").length;
  const reworkAttributedCount = workHistory.filter((h) => h.reworkAttributedToId === employeeId).length;

  return {
    strengths,
    improvements,
    totalSessions: mine.length,
    flaggedCount,
    flaggedRate: mine.length > 0 ? Number(((flaggedCount / mine.length) * 100).toFixed(1)) : 0,
    reworkAttributedCount,
  };
}

// A leaderboard for every production stage — 1st place through however many
// technicians qualify, "who's best at this task" made visible at a glance
// instead of buried inside each person's own profile. Ranked by the same
// per-employee, per-stage numbers computeStageStats/computeEmployeeInsights
// already compute — nothing new is tracked, this just re-sorts real logged
// history across the whole roster.
//
// Ranking metric, per stage: for Route/Terminate (CONNECT_STAGE_KEY), rank
// by connections credited per hour, descending — that's this app's existing
// measure of real terminating output (Update 9's connections/hour rule, the
// Analytics stage cards' secondary line), and a fairer "who's fastest" than
// raw avgHours for a stage whose session length varies with how big the
// panel was. Every other stage has no per-session size signal to normalize
// by, so it's ranked by average hours per session, ascending — faster is
// better, same "lower avgHours is better" reading computeEmployeeInsights
// already uses for strengths/improvements.
//
// Same INSIGHT_MIN_SESSIONS qualifying bar as the Strengths/Improvements
// card, and for the same reason: one lucky fast session (or one unlucky
// slow one) shouldn't hand someone a #1 or bury them in last place. A
// technician under the minimum at a given stage simply doesn't appear on
// that stage's board yet — not ranked last, since that would misrepresent
// "not enough data" as "worst." Ties (identical avgHours or
// connectionsPerHour) are broken by whoever has logged more sessions at
// that stage, since that number is the more statistically reliable one of
// the two. A stage nobody has cleared the minimum at yet doesn't appear on
// the leaderboard at all, same "don't fabricate a ranking with no real
// data behind it" rule the rest of this app already follows.
//
// Training is deliberately excluded — it isn't a production task with a
// "who's best" answer (Pat's own words: "we do not need to put training in
// there. because i mean, its training"), so it never produces a board here
// even once technicians clear the session minimum on it.
const LEADERBOARD_EXCLUDED_STAGE_KEYS = new Set(["training"]);

export function computeStageLeaderboards(workHistory, employees, { minSessions = INSIGHT_MIN_SESSIONS } = {}) {
  const byStageKey = new Map();
  employees.forEach((emp) => {
    computeStageStats(workHistory, emp.id).forEach((s) => {
      if (LEADERBOARD_EXCLUDED_STAGE_KEYS.has(s.key)) return;
      if (s.sessions < minSessions) return;
      if (!byStageKey.has(s.key)) byStageKey.set(s.key, []);
      byStageKey.get(s.key).push({
        employee: emp,
        sessions: s.sessions,
        avgHours: s.avgHours,
        connectionsPerHour: s.connectionsPerHour,
        totalConnections: s.totalConnections,
      });
    });
  });

  return productionStages
    .filter((stage) => !LEADERBOARD_EXCLUDED_STAGE_KEYS.has(stage.key))
    .map((stage) => {
      const rows = byStageKey.get(stage.key);
      if (!rows || rows.length === 0) return null;
      const rankedBy = stage.key === CONNECT_STAGE_KEY ? "connectionsPerHour" : "avgHours";
      const sorted = [...rows].sort((a, b) => {
        if (rankedBy === "connectionsPerHour") {
          if (b.connectionsPerHour !== a.connectionsPerHour) return b.connectionsPerHour - a.connectionsPerHour;
        } else if (a.avgHours !== b.avgHours) {
          return a.avgHours - b.avgHours;
        }
        return b.sessions - a.sessions;
      });
      return {
        key: stage.key,
        label: stage.label,
        rankedBy,
        rows: sorted.map((r, i) => ({ ...r, rank: i + 1 })),
      };
    })
    .filter(Boolean);
}

// "Start to finish" build-time projections — for every build that's
// actually shipped (a Wrap row on file with taskCompleted true — or a
// pre-split "QC/Wrap" row, see isShippedSessionRow above — same definition
// Reports.jsx's "Panels Shipped" stat uses, just checked per build instead
// of counted across all of them), sums every hour logged against that exact
// (panel id, buildId) across every stage it went through — Panel Prep
// through Wrap, plus any Rework/sub-assembly/Training time — the real total
// labor investment in that one panel, not just one stage of it. Averaged
// across every shipped build, this answers "how long does a panel really
// take, start to finish," for staffing and scheduling projections. A build
// still in progress (no completed Wrap row yet) is excluded — its total
// would understate a real full build.
export function computeAvgBuildTime(panels, workHistory) {
  const shipped = panels
    .map((panel) => ({ panel, stats: computeBuildStats(workHistory, panel) }))
    .filter(({ panel }) => {
      const tag = `#${panel.id}`;
      return workHistory.some((h) => h.panel === tag && h.buildId === panel.buildId && isShippedSessionRow(h));
    });

  if (shipped.length === 0) {
    return {
      completedBuilds: 0,
      avgHoursPerBuild: 0,
      medianHoursPerBuild: 0,
      avgConnectionsPerBuild: 0,
      hoursPerConnection: null,
      builds: [],
    };
  }

  const hoursSorted = shipped.map((b) => b.stats.hours).sort((a, b) => a - b);
  const totalHours = hoursSorted.reduce((s, h) => s + h, 0);
  const totalConnections = shipped.reduce((s, b) => s + b.stats.connections, 0);
  const mid = Math.floor(hoursSorted.length / 2);
  const medianHoursPerBuild =
    hoursSorted.length % 2 !== 0 ? hoursSorted[mid] : (hoursSorted[mid - 1] + hoursSorted[mid]) / 2;

  // Route/Terminate hours specifically, summed across shipped builds only —
  // the portion of total build time that actually scales with how many
  // connections a panel has, unlike prep/sort/build/test/QC time, which
  // behaves more like a fixed per-panel overhead regardless of size. This
  // is what powers the connection-aware part of estimateBuildHours below.
  // Sum-of-hours / sum-of-connections (not a mean of each build's own
  // ratio) so a small panel's noisier per-build rate doesn't count as much
  // as a big panel's more stable one.
  const connectHours = shipped.reduce((sum, { panel }) => {
    const tag = `#${panel.id}`;
    const rows = workHistory.filter(
      (h) => h.panel === tag && h.buildId === panel.buildId && h.stage === CONNECT_STAGE_LABEL
    );
    return sum + rows.reduce((s, h) => s + (h.hours || 0), 0);
  }, 0);

  return {
    completedBuilds: shipped.length,
    avgHoursPerBuild: Number((totalHours / shipped.length).toFixed(1)),
    medianHoursPerBuild: Number(medianHoursPerBuild.toFixed(1)),
    avgConnectionsPerBuild: Math.round(totalConnections / shipped.length),
    hoursPerConnection: totalConnections > 0 ? Number((connectHours / totalConnections).toFixed(3)) : null,
    builds: shipped
      .map(({ panel, stats }) => ({
        buildId: panel.buildId,
        id: panel.id,
        jobNumber: panel.jobNumber,
        customer: panel.customer,
        hours: stats.hours,
        connections: stats.connections,
        sessions: stats.sessions,
      }))
      .sort((a, b) => b.hours - a.hours),
  };
}

// "How many panels are we getting out per day, on average, since the
// beginning of this app" (Pat's own phrasing) — a single headline throughput
// number for leadership, distinct from computeAvgBuildTime's per-panel hours
// above. Panels enter the pipeline at different stages (a repeat build might
// skip Prep, an in-flight job might have been imported mid-routing when this
// app went live), so there's no single fair "day zero" to measure from on a
// PER-PANEL basis. Instead the denominator is shop-wide: calendar days
// elapsed since the very first workHistory row this app has on file at all
// (i.e. since the shop actually started using it), and the numerator is
// every panel that's shipped since then (same isShippedSessionRow/
// SHIP_STAGE_LABEL "actually done" definition used everywhere else in this
// file — QC/Wrap's pre-split legacy rows included). Floors the day count at
// 1 so day one doesn't divide by zero or produce a misleadingly huge number.
// Returns `avgPanelsPerDay: null` (not a fabricated 0) until there's at
// least one logged session to measure a start date from at all.
export function computePanelsPerDayAvg(panels, workHistory, { now = Date.now() } = {}) {
  const timestamps = workHistory
    .map((h) => h.createdAt)
    .filter(Boolean)
    .map((t) => new Date(t).getTime())
    .filter((t) => !Number.isNaN(t));

  if (timestamps.length === 0) {
    return { shippedPanels: 0, daysSinceStart: 0, avgPanelsPerDay: null, startDate: null };
  }

  const startMs = Math.min(...timestamps);
  const daysSinceStart = Math.max(1, Math.ceil((now - startMs) / 86400000));
  const shippedBuildIds = new Set(workHistory.filter(isShippedSessionRow).map((h) => h.buildId));

  return {
    shippedPanels: shippedBuildIds.size,
    daysSinceStart,
    avgPanelsPerDay: Number((shippedBuildIds.size / daysSinceStart).toFixed(2)),
    startDate: startMs,
  };
}

// Siemens' ask (Pat, Sept 28): prove the shop can ship this many panels a
// day, Monday through Friday, on a sustained basis — they'll pay overtime
// once that's demonstrated. Pat also asked directly whether working
// Saturdays/Sundays (to get ahead) inflates, or actually helps, that
// Monday-Friday number.
export const CAPACITY_TARGET_PER_DAY = 8;

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Monday (local midnight) of the calendar week containing ts, as a dayKeyFor
// string — built from local Y/M/D components (never by re-parsing a
// "YYYY-MM-DD" string with `new Date(...)`, which JS reads as UTC midnight
// and can silently roll back a day in a negative-UTC-offset timezone like
// this shop's).
function mondayKeyFor(ts) {
  const d = new Date(ts);
  const dow = d.getDay(); // 0 Sun .. 6 Sat
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diffToMonday);
  return dayKeyFor(monday.getTime());
}

// Answers "how many panels are we actually shipping per weekday" — the
// specific, narrower question Siemens is asking, as distinct from
// computePanelsPerDayAvg's single lifetime blended average above (which
// pools every day, weekends included, since the app's first day). Two rules
// make this trustworthy enough to hand to a customer:
//
// 1. Only a REAL, same-day-logged Wrap completion counts toward a given
//    date. loggedByAdmin rows (AppContext.adminMarkPanelSent, the backlog
//    "Mark as Sent" tool) are excluded entirely here, even though they still
//    count as shipped everywhere else in the app (the Sent tab, the
//    lifetime Avg Panels Shipped/Day tile, weekly P&L) — those rows are
//    stamped with the day an admin clicked the button, not the panel's real
//    (often weeks-old, unknown) ship date. Checked directly against the
//    database before building this: a September 23-26 backlog-clearing pass
//    logged 46 such corrections, and folding them in would have made
//    several ordinary days look like exceptional single-day output that
//    never actually happened on that date — exactly the kind of number that
//    falls apart if a customer ever asks a follow-up question.
// 2. A panel that ships on a Saturday or Sunday is bucketed under that
//    Saturday/Sunday, never folded into the weekday total — so working
//    weekends can never directly inflate the Monday-Friday figure. It can
//    only help indirectly, by clearing prep/routing work ahead of time so a
//    panel finishes (Wraps) sooner in the following week — something worth
//    watching for in the week-by-week trend below as more weekends of data
//    come in, not something this function claims to prove on its own.
//
// A calendar day only appears at all if the shop logged real (non-admin)
// activity that day — a closed day (a holiday) has none and is correctly
// left out of the average rather than counted as a 0-panel weekday, while a
// day the shop was open but genuinely shipped nothing still counts as a
// real zero. The current, still-in-progress calendar day is always tagged
// `inProgress` and excluded from every average, so checking this mid-shift
// never drags the numbers down with a partial day.
export function computeWeekdayCapacityReport(panels, workHistory, { now = Date.now(), targetPerDay = CAPACITY_TARGET_PER_DAY } = {}) {
  const todayKey = dayKeyFor(now);
  const dayTimestamps = new Map(); // dateKey -> a real ms timestamp logged that day

  workHistory.forEach((h) => {
    if (h.loggedByAdmin || !h.createdAt) return;
    const t = new Date(h.createdAt).getTime();
    if (Number.isNaN(t)) return;
    const key = dayKeyFor(t);
    if (key && !dayTimestamps.has(key)) dayTimestamps.set(key, t);
  });

  const shipCounts = new Map(); // dateKey -> panels shipped that day
  const perBuildShipTs = new Map(); // buildId -> earliest real (non-admin) ship ms
  workHistory
    .filter((h) => isShippedSessionRow(h) && !h.loggedByAdmin)
    .forEach((h) => {
      const t = new Date(h.endedAt || h.createdAt).getTime();
      if (Number.isNaN(t)) return;
      const existing = perBuildShipTs.get(h.buildId);
      if (existing === undefined || t < existing) perBuildShipTs.set(h.buildId, t);
    });
  perBuildShipTs.forEach((t) => {
    const key = dayKeyFor(t);
    if (!key) return;
    shipCounts.set(key, (shipCounts.get(key) ?? 0) + 1);
    if (!dayTimestamps.has(key)) dayTimestamps.set(key, t);
  });

  const days = Array.from(dayTimestamps.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([key, ts]) => {
      const weekday = new Date(ts).getDay();
      return {
        date: key,
        dow: DOW_LABELS[weekday],
        weekday,
        isWeekday: weekday >= 1 && weekday <= 5,
        panelsShipped: shipCounts.get(key) ?? 0,
        weekOf: mondayKeyFor(ts),
        inProgress: key === todayKey,
      };
    });

  const weekdayDays = days.filter((d) => d.isWeekday && !d.inProgress);
  const weekendDays = days.filter((d) => !d.isWeekday && !d.inProgress);

  const weekdayTotal = weekdayDays.reduce((s, d) => s + d.panelsShipped, 0);
  const bestWeekday = weekdayDays.reduce((max, d) => Math.max(max, d.panelsShipped), 0);
  const daysAtOrAboveTarget = weekdayDays.filter((d) => d.panelsShipped >= targetPerDay).length;

  const weeklyMap = new Map();
  weekdayDays.forEach((d) => {
    if (!weeklyMap.has(d.weekOf)) weeklyMap.set(d.weekOf, []);
    weeklyMap.get(d.weekOf).push(d);
  });
  const weeks = Array.from(weeklyMap.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([weekOf, list]) => {
      const total = list.reduce((s, d) => s + d.panelsShipped, 0);
      return {
        weekOf,
        weekdaysLogged: list.length,
        total,
        avgPerDay: Number((total / list.length).toFixed(2)),
      };
    });

  const excludedAdminCorrections = workHistory.filter((h) => h.loggedByAdmin && isShippedSessionRow(h)).length;

  return {
    targetPerDay,
    days,
    weekdayDays: weekdayDays.length,
    weekdayTotal,
    weekdayAvg: weekdayDays.length ? Number((weekdayTotal / weekdayDays.length).toFixed(2)) : null,
    bestWeekday,
    daysAtOrAboveTarget,
    pctDaysAtTarget: weekdayDays.length ? Number(((daysAtOrAboveTarget / weekdayDays.length) * 100).toFixed(0)) : null,
    weekendTotal: weekendDays.reduce((s, d) => s + d.panelsShipped, 0),
    saturdayTotal: weekendDays.filter((d) => d.weekday === 6).reduce((s, d) => s + d.panelsShipped, 0),
    sundayTotal: weekendDays.filter((d) => d.weekday === 0).reduce((s, d) => s + d.panelsShipped, 0),
    weeks,
    excludedAdminCorrections,
  };
}

// Answers a sharper version of the same staffing question as
// computeWeekdayCapacityReport above, but sliced by LABOR HOURS instead of
// calendar day-of-week: "with the crew we actually have, what do we ship on
// a straight 40-hr week per person, versus what does overtime actually buy
// us on top of that" — as opposed to the weekday/weekend split above, which
// can't tell a technician staying late on a Tuesday apart from one working a
// normal Tuesday.
//
// There's no way to know which specific clocked hour built which specific
// panel, so — same deliberate, clearly-labeled approximation already used
// by computeOvertimeCostByBuild above — each payroll week's real (non-admin)
// shipped-panel count is split across that week's shop-wide regular vs.
// overtime hours in direct proportion to how many of each were worked, using
// one flat panels-per-labor-hour rate for the week. This isn't a claim that
// overtime hours are individually as productive as regular ones — it's the
// simplest honest way to turn "X panels shipped on Y total hours, Z of them
// overtime" into a same-week, apples-to-apples comparison, rather than
// comparing distinct weeks that happened to have or lack overtime (which, at
// this shop's current data volume, would mostly just compare noise).
//
// Reuses the exact same real-shipped-panel definition (isShippedSessionRow,
// loggedByAdmin excluded, same "Mark as Sent" backlog-timestamp problem
// documented on computeWeekdayCapacityReport and computeWeeklyProfitAndLoss
// above) and the same payroll week (Wednesday-anchored) every other
// hours/pay view in this app already uses (Payroll, Week-to-Week
// Performance, Team's capacity bar). The still-in-progress current payroll
// week is always returned (tagged `inProgress`) but excluded from the
// averages, same "don't let a partial period drag the number down" rule
// used everywhere else in this app that ticks with `now`.
export function computeCapacityByHoursMix(panels, workHistory, clockLog, employees, { now = Date.now() } = {}) {
  const perBuildShipTs = new Map();
  workHistory
    .filter((h) => isShippedSessionRow(h) && !h.loggedByAdmin)
    .forEach((h) => {
      const t = new Date(h.endedAt || h.createdAt).getTime();
      if (Number.isNaN(t)) return;
      const existing = perBuildShipTs.get(h.buildId);
      if (existing === undefined || t < existing) perBuildShipTs.set(h.buildId, t);
    });

  const activeDayKeys = new Set();
  workHistory.forEach((h) => {
    if (h.loggedByAdmin || !h.createdAt) return;
    const t = new Date(h.createdAt).getTime();
    if (!Number.isNaN(t)) {
      const key = dayKeyFor(t);
      if (key) activeDayKeys.add(key);
    }
  });
  clockLog.forEach((c) => {
    if (!c.clockedInAt) return;
    const key = dayKeyFor(c.clockedInAt);
    if (key) activeDayKeys.add(key);
  });
  activeDayKeys.delete(dayKeyFor(now)); // today is still in progress — never a complete weekday

  const weekdayActivityCount = new Map(); // payroll week key -> # distinct Mon-Fri days with real activity
  activeDayKeys.forEach((key) => {
    const ts = new Date(`${key}T12:00:00`).getTime(); // midday: safely inside the day regardless of local TZ
    if (Number.isNaN(ts)) return;
    const dow = new Date(ts).getDay();
    if (dow === 0 || dow === 6) return; // weekends don't count toward a "panels per weekday" denominator
    const wk = payrollWeekKey(new Date(ts));
    weekdayActivityCount.set(wk, (weekdayActivityCount.get(wk) ?? 0) + 1);
  });

  const shippedByWeek = new Map();
  perBuildShipTs.forEach((t) => {
    const wk = payrollWeekKey(new Date(t));
    shippedByWeek.set(wk, (shippedByWeek.get(wk) ?? 0) + 1);
  });

  const currentWeekKey = payrollWeekKey(new Date(now));
  const allWeekKeys = new Set([...shippedByWeek.keys(), ...weekdayActivityCount.keys()]);

  const weeks = Array.from(allWeekKeys)
    .sort()
    .map((wk) => {
      const [y, m, d] = wk.split("-").map(Number);
      const { start, end } = payrollWeekRange(new Date(y, m - 1, d));
      let regularHours = 0;
      let overtimeHours = 0;
      employees.forEach((emp) => {
        const pay = computeOvertimePay(clockLog, emp, start, end, { now });
        regularHours += pay.regularHours;
        overtimeHours += pay.overtimeHours;
      });
      regularHours = Number(regularHours.toFixed(2));
      overtimeHours = Number(overtimeHours.toFixed(2));
      const totalHours = Number((regularHours + overtimeHours).toFixed(2));
      const shipped = shippedByWeek.get(wk) ?? 0;
      const weekdaysActive = weekdayActivityCount.get(wk) ?? 0;
      const panelsPerHour = totalHours > 0 ? shipped / totalHours : null;
      const regularAttributedPanels = panelsPerHour !== null ? panelsPerHour * regularHours : 0;
      const overtimeAttributedPanels = panelsPerHour !== null ? panelsPerHour * overtimeHours : 0;
      return {
        weekOf: wk,
        inProgress: wk === currentWeekKey,
        shipped,
        weekdaysActive,
        regularHours,
        overtimeHours,
        totalHours,
        regularAttributedPanels: Number(regularAttributedPanels.toFixed(2)),
        overtimeAttributedPanels: Number(overtimeAttributedPanels.toFixed(2)),
      };
    });

  const includedWeeks = weeks.filter((w) => !w.inProgress && w.weekdaysActive > 0);
  const totalWeekdaysActive = includedWeeks.reduce((s, w) => s + w.weekdaysActive, 0);
  const totalRegularAttributed = includedWeeks.reduce((s, w) => s + w.regularAttributedPanels, 0);
  const totalOvertimeAttributed = includedWeeks.reduce((s, w) => s + w.overtimeAttributedPanels, 0);
  const totalOvertimeHours = Number(includedWeeks.reduce((s, w) => s + w.overtimeHours, 0).toFixed(2));

  const avgPanelsPerDayAt40 =
    totalWeekdaysActive > 0 ? Number((totalRegularAttributed / totalWeekdaysActive).toFixed(2)) : null;
  const avgPanelsPerDayWithOt =
    totalWeekdaysActive > 0
      ? Number(((totalRegularAttributed + totalOvertimeAttributed) / totalWeekdaysActive).toFixed(2))
      : null;
  const otContributionPerDay =
    avgPanelsPerDayAt40 !== null && avgPanelsPerDayWithOt !== null
      ? Number((avgPanelsPerDayWithOt - avgPanelsPerDayAt40).toFixed(2))
      : null;

  return {
    weeks: weeks.slice().sort((a, b) => (a.weekOf < b.weekOf ? 1 : a.weekOf > b.weekOf ? -1 : 0)),
    weeksIncluded: includedWeeks.length,
    totalWeekdaysActive,
    totalOvertimeHours,
    avgPanelsPerDayAt40,
    avgPanelsPerDayWithOt,
    otContributionPerDay,
  };
}

// Powers the "Estimate a New Panel" calculator on Reports.jsx: given which
// stages a hypothetical panel's routing will actually go through and how
// many connections it's expected to need, projects total build hours.
// Every selected stage contributes its own historical avgHours from
// stageStats (computeTeamStageStats) EXCEPT Route/Terminate, which uses
// hoursPerConnection × estimatedConnections instead whenever that rate is
// available — a flat avgHours for Route/Terminate would be wrong for
// anything but an average-sized panel, since terminating time is driven by
// how many connections there actually are, not by "how long a
// Route/Terminate session usually runs" shopwide. Pure function — no
// dependency on live app state — so it's easy to test and to preview
// changes to instantly in the UI as the admin adjusts the inputs.
export function estimateBuildHours(stageStats, selectedStageKeys, estimatedConnections, hoursPerConnection) {
  const statsByKey = new Map(stageStats.map((s) => [s.key, s]));
  const conns = Math.max(0, Number(estimatedConnections) || 0);
  const breakdown = selectedStageKeys.map((key) => {
    const stat = statsByKey.get(key);
    if (key === CONNECT_STAGE_KEY && hoursPerConnection !== null && conns > 0) {
      return {
        key,
        hours: Number((hoursPerConnection * conns).toFixed(1)),
        method: "rate",
        basis: `${hoursPerConnection} hrs/connection × ${conns} connections`,
      };
    }
    return {
      key,
      hours: stat?.avgHours ?? 0,
      method: "average",
      basis: stat ? `avg of ${stat.sessions} logged session${stat.sessions === 1 ? "" : "s"}` : "no history logged yet",
    };
  });
  const totalHours = Number(breakdown.reduce((s, b) => s + b.hours, 0).toFixed(1));
  return { totalHours, breakdown };
}

// One row per employee with team-wide comparable KPIs — the "how does
// everyone stack up" table. connectionsPerHour is scoped to hours actually
// spent on Route/Terminate specifically (the only stage that produces a
// connection count), not total hours, so it reflects real terminating
// speed rather than being diluted by time spent on other stages.
export function computeEmployeeLeaderboard(workHistory, employees) {
  return employees.map((emp) => {
    const rows = workHistory.filter((h) => h.employeeId === emp.id);
    const totalHours = rows.reduce((s, h) => s + (h.hours || 0), 0);
    const completedTasks = rows.filter((h) => h.taskCompleted).length;
    const totalConnections = rows.reduce((s, h) => s + (h.connectionsCredited || 0), 0);
    const connectHours = rows
      .filter((h) => h.stage === CONNECT_STAGE_LABEL)
      .reduce((s, h) => s + (h.hours || 0), 0);
    return {
      employeeId: emp.id,
      name: emp.name,
      role: emp.role,
      sessions: rows.length,
      hours: Number(totalHours.toFixed(1)),
      completedTasks,
      totalConnections,
      connectionsPerHour: connectHours > 0 ? Number((totalConnections / connectHours).toFixed(1)) : 0,
      attainmentPct: emp.attainmentPct ?? 0,
    };
  });
}

// Real daily hours trend from actual logged work, bucketed by the
// session's real timestamp (workHistory[].createdAt) — replaces the
// earlier generateDailyOutput() placeholder wherever a chart needs to show
// actual output against a target rather than seeded-random demo data.
// Returns the same shape generateDailyOutput did ({date, label, value,
// target, aboveTarget}) so existing chart JSX didn't need to change, just
// its data source.
export function computeDailyHoursTrend(workHistory, days = 30, target = 0) {
  const byDate = new Map();
  workHistory.forEach((h) => {
    if (!h.createdAt) return;
    const key = new Date(h.createdAt).toISOString().slice(0, 10);
    byDate.set(key, (byDate.get(key) ?? 0) + (h.hours || 0));
  });
  const out = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const value = Number((byDate.get(key) ?? 0).toFixed(1));
    out.push({
      date: key,
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      value,
      target,
      aboveTarget: value >= target,
    });
  }
  return out;
}

// Same idea as computeDailyHoursTrend, but connections credited (Route/
// Terminate only) instead of hours — "how many connections are we actually
// making per day."
export function computeDailyConnectionsTrend(workHistory, days = 30) {
  const byDate = new Map();
  workHistory.forEach((h) => {
    if (!h.createdAt) return;
    const key = new Date(h.createdAt).toISOString().slice(0, 10);
    byDate.set(key, (byDate.get(key) ?? 0) + (h.connectionsCredited || 0));
  });
  const out = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({
      date: key,
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      value: byDate.get(key) ?? 0,
    });
  }
  return out;
}

// For any panel id with more than one build on file (see "repeat panel
// builds" above), hours-per-build across those builds — reveals whether
// the crew is getting faster at a repeat job (learning curve) or slower
// (scope creep, different crew, etc). Skips ids where no build has actually
// been worked yet, so a freshly-imported repeat order doesn't show up as a
// zero-hour "build."
export function computeRepeatBuildTrends(panels, workHistory) {
  const byId = new Map();
  panels.forEach((p) => {
    if (!byId.has(p.id)) byId.set(p.id, []);
    byId.get(p.id).push(p);
  });
  const trends = [];
  byId.forEach((builds, id) => {
    if (builds.length < 2) return;
    const withStats = builds.map((p) => ({ panel: p, stats: computeBuildStats(workHistory, p) }));
    if (!withStats.some((b) => b.stats.sessions > 0)) return;
    trends.push({ id, builds: withStats });
  });
  return trends;
}

// Labor cost (hours actually logged × that technician's CURRENT pay rate —
// pay rates aren't versioned historically, so a raise applies retroactively
// to past hours here) against what each build was quoted for. This is
// deliberately admin-eyes-only data — this page already sits behind admin
// login — and is the number that actually answers "are we pricing jobs
// like this correctly."
export function computeCostSummary(panels, workHistory, employees) {
  const payRateById = new Map(employees.map((e) => [e.id, e.payRate || 0]));
  let totalLaborCost = 0;
  let totalRevenue = 0;
  const perPanel = panels.map((p) => {
    const stats = computeBuildStats(workHistory, p);
    const tag = `#${p.id}`;
    const rows = workHistory.filter((h) => h.panel === tag && h.buildId === p.buildId);
    const laborCost = rows.reduce((s, h) => s + (h.hours || 0) * (payRateById.get(h.employeeId) || 0), 0);
    const revenue = p.price || 0;
    totalLaborCost += laborCost;
    totalRevenue += revenue;
    return {
      buildId: p.buildId,
      id: p.id,
      jobNumber: p.jobNumber,
      customer: p.customer,
      revenue,
      laborCost: Number(laborCost.toFixed(2)),
      margin: Number((revenue - laborCost).toFixed(2)),
      marginPct: revenue > 0 ? Math.round(((revenue - laborCost) / revenue) * 100) : null,
      hours: stats.hours,
    };
  });
  return {
    totalLaborCost: Number(totalLaborCost.toFixed(2)),
    totalRevenue: Number(totalRevenue.toFixed(2)),
    totalMargin: Number((totalRevenue - totalLaborCost).toFixed(2)),
    perPanel: perPanel.filter((p) => p.hours > 0).sort((a, b) => b.hours - a.hours),
  };
}

// The single "what are we actually paying, per hour, blended across the
// shop" number the "Estimate a New Panel" calculator uses to turn its
// estimated hours into an estimated labor cost. Computed the same honest
// way as computeCostSummary's own per-panel labor cost (hours × that
// technician's CURRENT pay rate, summed) — just rolled up across every
// hour ever logged instead of one panel at a time, so someone who logs
// more hours naturally weighs more in the blend (they're doing more of
// the actual work), rather than averaging every employee's rate equally
// regardless of how much they've actually worked. Returns
// `blendedRate: null` (not a divide-by-zero) when nothing has been logged
// yet — the calculator shows a "no history yet" note in that case instead
// of a fabricated $0/hr estimate.
export function computeBlendedLaborRate(workHistory, employees) {
  const payRateById = new Map(employees.map((e) => [e.id, e.payRate || 0]));
  let totalHours = 0;
  let totalCost = 0;
  workHistory.forEach((h) => {
    const hours = h.hours || 0;
    totalHours += hours;
    totalCost += hours * (payRateById.get(h.employeeId) || 0);
  });
  return {
    totalHours: Number(totalHours.toFixed(2)),
    totalCost: Number(totalCost.toFixed(2)),
    blendedRate: totalHours > 0 ? Number((totalCost / totalHours).toFixed(2)) : null,
  };
}

// ---------------------------------------------------------------------------
// Payroll week + overtime. The shop's payroll week runs Wednesday through
// Tuesday — a different "week" than the Clock QR's Monday-anchored ISO week
// above (isoWeekKey), which rotates for an unrelated reason (a weekly
// printed sheet). Every hour an employee is actually clocked in past 40 in a
// single payroll week pays out at 1.5x their normal rate — one flat rule for
// everyone, not scoped by role, matching how it was asked ("when someone
// logs in after the 40th hour").
//
// Overtime is computed from CLOCKED (attendance) hours — assemblyos_clock_log
// — not from workHistory's production/task hours. Two reasons: (1) paid
// breaks (see the break-windows update) are already inside a clocked span,
// and payroll owes pay for that whole span, not just task time; (2)
// overtime is a function of how long someone was actually at the shop that
// week, not how much of it they happened to log against a specific panel —
// a technician can be clocked in without an active session (between tasks,
// waiting on parts, etc.) and that time still counts toward their 40.
export const OVERTIME_THRESHOLD_HOURS = 40;
export const OVERTIME_MULTIPLIER = 1.5;

// Where a "getting close to 40" warning kicks in on capacity-visibility
// views (Team roster) — 80% of the overtime threshold. A named constant
// rather than a hardcoded 32 so the two stay in sync if the threshold ever
// changes, and so the warning point itself is a one-line change on its own.
export const CAPACITY_WARNING_HOURS = Number((OVERTIME_THRESHOLD_HOURS * 0.8).toFixed(2));

// Midnight (local time) of the Wednesday that starts the payroll week
// containing `date`.
export function payrollWeekStart(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffFromWed = (d.getDay() - 3 + 7) % 7; // getDay(): 0=Sun..6=Sat, Wednesday=3
  d.setDate(d.getDate() - diffFromWed);
  return d;
}

// Stable string key for the payroll week containing `date` — the calendar
// date (YYYY-MM-DD) of that week's Wednesday, e.g. "2026-09-23".
export function payrollWeekKey(date = new Date()) {
  const start = payrollWeekStart(date);
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
}

// [start, end) millisecond bounds of the payroll week containing `date`.
export function payrollWeekRange(date = new Date()) {
  const start = payrollWeekStart(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start: start.getTime(), end: end.getTime() };
}

// Sums one employee's clocked (attendance) hours from clockLog that fall
// inside [rangeStart, rangeEnd) — clipping any entry that only partially
// overlaps the range to just its overlapping portion, rather than counting
// it whole or not at all (an employee who clocked in Tuesday night and out
// Wednesday morning should only have the Wednesday portion count toward the
// new payroll week). An entry that's still open is capped at `now` (or the
// range end, whichever is earlier) — same "never trust a runaway span"
// caution effectiveElapsedMs/computeNonProductiveTime already apply
// elsewhere, so a forgotten clock-out can't balloon into phantom overtime.
export function clockedHoursInRange(clockLog, employeeId, rangeStart, rangeEnd, { now = Date.now() } = {}) {
  let ms = 0;
  clockLog
    .filter((c) => c.employeeId === employeeId)
    .forEach((c) => {
      const inAt = c.clockedInAt;
      const outAt = c.clockedOutAt ?? Math.min(now, rangeEnd);
      const overlapStart = Math.max(inAt, rangeStart);
      const overlapEnd = Math.min(outAt, rangeEnd);
      if (overlapEnd > overlapStart) ms += overlapEnd - overlapStart;
    });
  return Number((ms / 3600000).toFixed(2));
}

// Regular/overtime hours + pay for one employee across the payroll week
// [rangeStart, rangeEnd). `regularHours` is capped at OVERTIME_THRESHOLD_HOURS
// so it and `overtimeHours` always add back up to the real total exactly.
export function computeOvertimePay(clockLog, employee, rangeStart, rangeEnd, { now = Date.now() } = {}) {
  const totalHours = clockedHoursInRange(clockLog, employee.id, rangeStart, rangeEnd, { now });
  const regularHours = Number(Math.min(totalHours, OVERTIME_THRESHOLD_HOURS).toFixed(2));
  const overtimeHours = Number(Math.max(0, totalHours - OVERTIME_THRESHOLD_HOURS).toFixed(2));
  const rate = employee.payRate || 0;
  const regularPay = Number((regularHours * rate).toFixed(2));
  const overtimePay = Number((overtimeHours * rate * OVERTIME_MULTIPLIER).toFixed(2));
  return {
    totalHours,
    regularHours,
    overtimeHours,
    regularPay,
    overtimePay,
    totalPay: Number((regularPay + overtimePay).toFixed(2)),
  };
}

// Shop-wide payroll roll-up for a given payroll week — one row per employee
// (including anyone with zero hours that week, since a payroll admin needs
// to see who DIDN'T clock in at all, not just who did), sorted by total pay
// descending.
export function computePayrollSummary(clockLog, employees, rangeStart, rangeEnd, { now = Date.now() } = {}) {
  return employees
    .map((e) => ({ employee: e, ...computeOvertimePay(clockLog, e, rangeStart, rangeEnd, { now }) }))
    .sort((a, b) => b.totalPay - a.totalPay);
}

// A simple weekly profit-and-loss for the Payroll page — Pat's own words:
// "a reflection of payroll along with the work that is logged complete...
// basically like a profit and loss." Pairs the same week's real payroll
// cost (computePayrollSummary above — clocked hours, overtime included,
// the exact number the rest of the Payroll page already shows) against
// revenue recognized that week.
//
// "Work logged complete" is read as panels that actually SHIPPED during
// this payroll week — this app's one existing, already-established
// definition of "this job is actually done" (isShippedSessionRow/
// SHIP_STAGE_LABEL, used for the "Panels Shipped" stat and the build-time
// projections), not any one completed session/stage along the way. A
// panel's price isn't earned bit by bit as steps get checked off — it's
// billed once the whole thing ships — so that's the revenue event this
// pairs against payroll cost. If Pat actually meant something broader
// (every completed session, not just a full ship), that's a quick
// follow-up — flagged here since it's a real judgment call, not a fact.
//
// A build with more than one completed Wrap row on file (shouldn't
// normally happen) only counts its price once — de-duplicated by buildId
// — so a corrected/re-logged completion can't double-count revenue.
//
// loggedByAdmin rows (AppContext.adminMarkPanelSent, the "Mark as Sent"
// backlog tool from Update 32) are excluded from which WEEK a panel's
// revenue lands in, same reasoning as computeWeekdayCapacityReport above:
// that tool stamps both createdAt and endedAt with the day an admin
// happened to click the button, not the panel's real historical ship
// date (confirmed directly against the live data — see Update 34's
// findings). A backlog of weeks- or months-old admin corrections cleared
// in one sitting would otherwise all land in whichever single week that
// cleanup happened, fabricating an impossible spike in that week's
// revenue/panel count (exactly what surfaced live: 70+ "panels shipped"
// and $60k+ "revenue" in a single week that never actually happened).
// These builds still count everywhere a lifetime/all-time total is shown
// (Dashboard's Avg Panels Shipped/Day, the Sent tab, Analytics build-time
// projections) — only this week-by-week revenue-recognition view excludes
// them, because there's no trustworthy week to honestly credit them to.
// excludedAdminCorrections/-Revenue surface this so the exclusion is never
// silent.
export function computeWeeklyProfitAndLoss(panels, workHistory, clockLog, employees, rangeStart, rangeEnd, { now = Date.now() } = {}) {
  const inRange = (h) => {
    if (!isShippedSessionRow(h) || !h.createdAt) return false;
    const t = new Date(h.createdAt).getTime();
    return !Number.isNaN(t) && t >= rangeStart && t < rangeEnd;
  };
  const shippedBuildIds = new Set(
    workHistory.filter((h) => inRange(h) && !h.loggedByAdmin).map((h) => h.buildId)
  );
  const shippedPanels = panels
    .filter((p) => shippedBuildIds.has(p.buildId))
    .map((p) => ({ buildId: p.buildId, id: p.id, jobNumber: p.jobNumber, customer: p.customer, price: p.price || 0 }))
    .sort((a, b) => b.price - a.price);
  const revenue = Number(shippedPanels.reduce((s, p) => s + p.price, 0).toFixed(2));

  const excludedAdminBuildIds = new Set(
    workHistory.filter((h) => inRange(h) && h.loggedByAdmin && !shippedBuildIds.has(h.buildId)).map((h) => h.buildId)
  );
  const excludedAdminCorrections = excludedAdminBuildIds.size;
  const excludedAdminRevenue = Number(
    panels
      .filter((p) => excludedAdminBuildIds.has(p.buildId))
      .reduce((s, p) => s + (p.price || 0), 0)
      .toFixed(2)
  );

  const payrollCost = Number(
    computePayrollSummary(clockLog, employees, rangeStart, rangeEnd, { now })
      .reduce((s, r) => s + r.totalPay, 0)
      .toFixed(2)
  );

  const profit = Number((revenue - payrollCost).toFixed(2));
  return {
    revenue,
    payrollCost,
    profit,
    marginPct: revenue > 0 ? Math.round((profit / revenue) * 100) : null,
    shippedPanels,
    excludedAdminCorrections,
    excludedAdminRevenue,
  };
}

// One range's worth of P&L plus the real, already-tracked shop signals a
// margin swing is usually chalked up to — OT hours, connections credited,
// rework activity, packout issues reported, and flagged sessions. Used by
// computeMarginDrivers below to build a same-week-vs-previous-week
// comparison; kept as its own function since the ProfitAndLoss page's
// multi-week trend table (computeProfitAndLossTrend) needs the same P&L
// figures without the driver breakdown for every week shown.
function pnlWithDrivers(panels, workHistory, clockLog, employees, start, end, { now = Date.now() } = {}) {
  const pnl = computeWeeklyProfitAndLoss(panels, workHistory, clockLog, employees, start, end, { now });
  const otHours = Number(
    computePayrollSummary(clockLog, employees, start, end, { now })
      .reduce((s, r) => s + r.overtimeHours, 0)
      .toFixed(2)
  );
  const inRange = (h) => {
    if (h.loggedByAdmin || !h.createdAt) return false;
    const t = new Date(h.createdAt).getTime();
    return !Number.isNaN(t) && t >= start && t < end;
  };
  const rangeRows = workHistory.filter(inRange);
  const connectionsCredited = rangeRows.reduce((s, h) => s + (h.connectionsCredited || 0), 0);
  const reworkRows = rangeRows.filter((h) => h.stage === REWORK_STAGE_LABEL);
  const reworkSessions = reworkRows.length;
  const reworkHours = Number(reworkRows.reduce((s, h) => s + (h.hours || 0), 0).toFixed(2));
  const flaggedSessions = rangeRows.filter((h) => h.status === "Flagged").length;
  const packoutIssuesReported = computePackoutIssues(panels, workHistory, employees, { now }).filter((issue) => {
    const t = new Date(issue.reportedAt).getTime();
    return !Number.isNaN(t) && t >= start && t < end;
  }).length;

  return {
    revenue: pnl.revenue,
    payrollCost: pnl.payrollCost,
    profit: pnl.profit,
    marginPct: pnl.marginPct,
    shippedCount: pnl.shippedPanels.length,
    shippedPanels: pnl.shippedPanels,
    otHours,
    connectionsCredited,
    reworkSessions,
    reworkHours,
    flaggedSessions,
    packoutIssuesReported,
  };
}

// Powers the ProfitAndLoss page's "What's Changing Margin" section — Pat's
// own words: "suggestions on what was driving that margin higher or lower.
// like more ot this week than last week, or more connections made this
// week or x amount of issues on the session or there was more rework." This
// deliberately surfaces real, already-tracked deltas rather than inventing
// a causal model — it says what changed between the two ranges (OT hours,
// connections credited, rework, packout issues, flagged sessions), so Pat
// can judge for herself what's actually behind a margin swing, the same
// "always show where the number came from" discipline this whole app
// already follows, rather than asserting a specific cause it can't prove.
export function computeMarginDrivers(panels, workHistory, clockLog, employees, currentRange, previousRange, opts = {}) {
  const current = pnlWithDrivers(panels, workHistory, clockLog, employees, currentRange.start, currentRange.end, opts);
  const previous = pnlWithDrivers(panels, workHistory, clockLog, employees, previousRange.start, previousRange.end, opts);
  const round2 = (n) => Number(n.toFixed(2));
  const delta = (key) => round2(current[key] - previous[key]);
  return {
    current,
    previous,
    deltas: {
      revenue: delta("revenue"),
      payrollCost: delta("payrollCost"),
      profit: delta("profit"),
      marginPct: current.marginPct !== null && previous.marginPct !== null ? current.marginPct - previous.marginPct : null,
      shippedCount: current.shippedCount - previous.shippedCount,
      otHours: delta("otHours"),
      connectionsCredited: current.connectionsCredited - previous.connectionsCredited,
      reworkSessions: current.reworkSessions - previous.reworkSessions,
      reworkHours: delta("reworkHours"),
      flaggedSessions: current.flaggedSessions - previous.flaggedSessions,
      packoutIssuesReported: current.packoutIssuesReported - previous.packoutIssuesReported,
    },
  };
}

// Multi-week P&L trend for the ProfitAndLoss page — Pat asked to "do
// comparisons" beyond just this-week-vs-last, so this returns the last
// `weeks` payroll weeks (most recent first, current in-progress week
// included and tagged `inProgress`) with the same revenue/cost/profit/
// margin/shipped figures computeWeeklyProfitAndLoss already computes for
// one week, so the page can list them side by side.
export function computeProfitAndLossTrend(panels, workHistory, clockLog, employees, { weeks = 8, now = Date.now() } = {}) {
  const currentWeekStart = payrollWeekStart(new Date(now));
  const out = [];
  for (let i = 0; i < weeks; i++) {
    const start = new Date(currentWeekStart);
    start.setDate(start.getDate() - 7 * i);
    const { start: rangeStart, end: rangeEnd } = payrollWeekRange(start);
    const pnl = computeWeeklyProfitAndLoss(panels, workHistory, clockLog, employees, rangeStart, rangeEnd, { now });
    out.push({
      weekOf: payrollWeekKey(start),
      inProgress: i === 0,
      revenue: pnl.revenue,
      payrollCost: pnl.payrollCost,
      profit: pnl.profit,
      marginPct: pnl.marginPct,
      shippedCount: pnl.shippedPanels.length,
    });
  }
  return out;
}

// Multi-week version of pnlWithDrivers, for the ProfitAndLoss page's
// "What's Changing Margin" bar charts — Pat wanted to compare more than
// just this-week-vs-last-week ("instead of going back and forth comparing
// weeks... an option to compare prior weeks and those bars are side by
// side"), so this returns every driver metric (not just revenue/cost/
// profit/margin the way computeProfitAndLossTrend does) for each of the
// last `weeks` payroll weeks, most-recent-first, so the page can let
// someone pick any subset of weeks and chart them side by side per metric.
export function computeMarginDriversTrend(panels, workHistory, clockLog, employees, { weeks = 12, now = Date.now() } = {}) {
  const currentWeekStart = payrollWeekStart(new Date(now));
  const out = [];
  for (let i = 0; i < weeks; i++) {
    const start = new Date(currentWeekStart);
    start.setDate(start.getDate() - 7 * i);
    const { start: rangeStart, end: rangeEnd } = payrollWeekRange(start);
    const d = pnlWithDrivers(panels, workHistory, clockLog, employees, rangeStart, rangeEnd, { now });
    out.push({
      weekOf: payrollWeekKey(start),
      weekStart: start.getTime(),
      inProgress: i === 0,
      shippedCount: d.shippedCount,
      otHours: d.otHours,
      connectionsCredited: d.connectionsCredited,
      reworkSessions: d.reworkSessions,
      reworkHours: d.reworkHours,
      flaggedSessions: d.flaggedSessions,
      packoutIssuesReported: d.packoutIssuesReported,
    });
  }
  return out;
}

// Attributes overtime PREMIUM cost (the extra OVERTIME_MULTIPLIER-1 on top
// of what those hours would have cost at straight time — the actual added
// cost overtime causes, which is the number that matters for "should this
// job be priced higher") across the panels an employee logged work on
// during a week they earned overtime, in proportion to how many task hours
// they logged on each panel that week.
//
// This is a deliberate approximation, not a strict "which specific panel
// pushed them over 40 hours" determination: overtime itself is computed
// from clocked ATTENDANCE hours (clockedHoursInRange/computeOvertimePay),
// while this allocates against logged TASK hours (workHistory) for the
// same week — task hours run lower than attendance hours (breaks and
// non-productive time are excluded from them) and aren't necessarily in
// the same order the clock accumulated. A proportional split was chosen
// over a stricter chronological one (lining up each session's timestamp
// against the exact moment the employee's clocked hours crossed 40) because
// it's simple to explain to a non-technical reader and degrades honestly:
// a week where an employee earned overtime but logged no task hours at all
// (rare, but possible — e.g. training, or a data gap) can't be attributed
// to any panel, and is called out separately as unattributedOvertimeHours/
// Cost rather than guessed at or silently dropped.
export function computeOvertimeCostByBuild(panels, workHistory, clockLog, employees) {
  const panelByBuildId = new Map();
  panels.forEach((p) => {
    if (!panelByBuildId.has(p.buildId)) {
      panelByBuildId.set(p.buildId, { buildId: p.buildId, id: p.id, jobNumber: p.jobNumber, customer: p.customer });
    }
  });

  const byBuild = new Map();
  let unattributedOvertimeHours = 0;
  let unattributedOvertimeCost = 0;
  let totalOvertimeHours = 0;
  let totalOvertimePremiumCost = 0;

  employees.forEach((emp) => {
    // Every payroll week this employee has any clock activity in — checking
    // both the clock-in's week and (when different) the clock-out's week so
    // a shift spanning the Tue-night/Wed boundary isn't missed on either side.
    const weekKeys = new Set();
    clockLog
      .filter((c) => c.employeeId === emp.id)
      .forEach((c) => {
        if (c.clockedInAt) weekKeys.add(payrollWeekKey(new Date(c.clockedInAt)));
        if (c.clockedOutAt) weekKeys.add(payrollWeekKey(new Date(c.clockedOutAt)));
      });

    weekKeys.forEach((wk) => {
      const { start, end } = payrollWeekRange(new Date(`${wk}T00:00:00`));
      const { overtimeHours } = computeOvertimePay(clockLog, emp, start, end);
      if (overtimeHours <= 0) return;

      totalOvertimeHours += overtimeHours;
      const premiumCost = Number((overtimeHours * (emp.payRate || 0) * (OVERTIME_MULTIPLIER - 1)).toFixed(2));
      totalOvertimePremiumCost += premiumCost;

      const weekSessions = workHistory.filter((h) => {
        if (h.employeeId !== emp.id || !h.createdAt) return false;
        const t = new Date(h.createdAt).getTime();
        return !Number.isNaN(t) && t >= start && t < end;
      });
      const weekTaskHours = weekSessions.reduce((s, h) => s + (h.hours || 0), 0);

      if (weekTaskHours <= 0) {
        unattributedOvertimeHours += overtimeHours;
        unattributedOvertimeCost += premiumCost;
        return;
      }

      weekSessions.forEach((h) => {
        const share = (h.hours || 0) / weekTaskHours;
        if (share <= 0) return;
        const info = panelByBuildId.get(h.buildId) || { buildId: h.buildId, id: h.buildId, jobNumber: "", customer: "" };
        if (!byBuild.has(h.buildId)) byBuild.set(h.buildId, { ...info, otHours: 0, otCost: 0 });
        const b = byBuild.get(h.buildId);
        b.otHours += overtimeHours * share;
        b.otCost += premiumCost * share;
      });
    });
  });

  const builds = Array.from(byBuild.values())
    .map((b) => ({ ...b, otHours: Number(b.otHours.toFixed(2)), otCost: Number(b.otCost.toFixed(2)) }))
    .filter((b) => b.otHours > 0)
    .sort((a, b) => b.otCost - a.otCost);

  return {
    totalOvertimeHours: Number(totalOvertimeHours.toFixed(2)),
    totalOvertimePremiumCost: Number(totalOvertimePremiumCost.toFixed(2)),
    unattributedOvertimeHours: Number(unattributedOvertimeHours.toFixed(2)),
    unattributedOvertimeCost: Number(unattributedOvertimeCost.toFixed(2)),
    builds,
  };
}

// How many people are typically working the SAME stage at the SAME time —
// Pat's staffing question: not "how long does a session take" (that's
// computeTeamStageStats/Average Time per Step) but "how many hands does
// this step actually need." Answered with a real interval-overlap sweep
// over each stage's logged sessions, not a rough headcount/session-count
// guess, since two technicians who each worked 4 hours on a stage today
// could have been fully overlapping (2 people needed at once) or fully
// back-to-back (1 person was enough) — only the real clock times tell you
// which.
//
// Only rows with real startedAt/endedAt clock times count (see the
// start/end-timestamp update) — a session logged before that field existed,
// or a "Mark as Sent" admin correction (0-hour, no real time span —
// excluded the same way computeTeamStageStats excludes it), can't be placed
// on a timeline at all, so it's left out rather than guessed at.
//
// The average is time-weighted across only the periods when at least one
// person was actually on that stage — nights, weekends, and any other gap
// with zero concurrency are excluded from the denominator on purpose.
// Otherwise a stage that's genuinely busy for a few real hours a day would
// look artificially "low-staffed" just because it averages against a mostly
// idle 24-hour clock, which would defeat the entire point of asking "when
// this task is actually happening, how many people are on it."
function concurrencyFromIntervals(intervals) {
  const events = [];
  intervals.forEach(({ start, end }) => {
    if (!(end > start)) return; // defensive: a corrected/zero-length entry contributes nothing to the timeline
    events.push([start, 1]);
    events.push([end, -1]);
  });
  if (events.length === 0) return { avgConcurrent: 0, peakConcurrent: 0, activeHours: 0 };

  // Ties sort ends (-1) before starts (+1) at the exact same instant, so a
  // session that ends the moment another begins reads as sequential (never
  // concurrent) rather than momentarily "2 people," which would overstate
  // genuine overlap.
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  let concurrency = 0;
  let prevT = events[0][0];
  let weightedSum = 0;
  let activeDurationMs = 0;
  let peakConcurrent = 0;

  events.forEach(([t, delta]) => {
    if (t > prevT && concurrency > 0) {
      const durMs = t - prevT;
      weightedSum += concurrency * durMs;
      activeDurationMs += durMs;
    }
    concurrency += delta;
    peakConcurrent = Math.max(peakConcurrent, concurrency);
    prevT = t;
  });

  return {
    avgConcurrent: activeDurationMs > 0 ? weightedSum / activeDurationMs : peakConcurrent > 0 ? 1 : 0,
    peakConcurrent,
    activeHours: activeDurationMs / 3600000,
  };
}

export function computeStageConcurrency(workHistory) {
  const validRows = workHistory.filter((h) => {
    if (h.loggedByAdmin || !h.stage || !h.startedAt || !h.endedAt) return false;
    const s = new Date(h.startedAt).getTime();
    const e = new Date(h.endedAt).getTime();
    return !Number.isNaN(s) && !Number.isNaN(e) && e > s;
  });

  const byStage = new Map();
  validRows.forEach((h) => {
    if (!byStage.has(h.stage)) byStage.set(h.stage, []);
    byStage.get(h.stage).push({ start: new Date(h.startedAt).getTime(), end: new Date(h.endedAt).getTime() });
  });

  const results = [];
  byStage.forEach((intervals, stageLabel) => {
    const stageDef = productionStages.find((s) => s.label === stageLabel);
    const { avgConcurrent, peakConcurrent, activeHours } = concurrencyFromIntervals(intervals);
    results.push({
      key: stageDef?.key ?? stageLabel,
      label: stageLabel,
      avgConcurrent: Number(avgConcurrent.toFixed(2)),
      peakConcurrent,
      sessionsCounted: intervals.length,
      activeHours: Number(activeHours.toFixed(1)),
    });
  });

  return results.sort((a, b) => b.avgConcurrent - a.avgConcurrent);
}
