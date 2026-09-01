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
// Non-productive time — every minute of a Panel Technician's scheduled shift
// that ISN'T covered by a logged production session (and isn't already a
// paid break — see BREAK_WINDOWS above). This is entirely DERIVED from
// workHistory; there's no separate clock-in feature and no new action for a
// technician to take, so "how much of today wasn't spent on a task" is
// computed after the fact from the same session data everything else here
// already uses.
//
// Scoped to Panel Technicians only (ROLES.TECH) — this fixed 7:00am–4:30pm
// shift window is what Pat gave us for that role specifically. Lead Panel
// Technicians have a different daily-hours target (7 vs 8 — see
// initialRoleDefaults) and no fixed shift window was specified for them, so
// they're left out of this for now rather than guessing their hours.
export const TECH_SHIFT_WINDOW = { startMinute: 7 * 60, endMinute: 16 * 60 + 30 }; // 7:00 am – 4:30 pm

// Local calendar-day key ("2026-08-31") for an ISO timestamp, or null if the
// timestamp is missing/unparseable. workHistory rows are bucketed to a day
// by `createdAt` (the real DB-assigned timestamp), not the `date` display
// string, since `date` has no year in it — same reasoning as the trend
// charts (see fromDbWorkHistory's comment on createdAt).
function dayKeyFor(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Per-day non-productive breakdown for one technician, most recent day
// first: [{ dayKey, label, loggedHours, capacityHours, nonProductiveHours }].
//
// IMPORTANT LIMITATION: only days with at least one workHistory row for this
// employee are included. There's no attendance/clock-in signal anywhere in
// this app, so a day with zero logged sessions is indistinguishable between
// "sat around all day" and "day off / sick / not yet hired" — rather than
// guess, that day is simply left out of the result instead of being counted
// as a full 8.5-hour idle shift, which would misrepresent absences as
// non-productive time. A day that DOES have logged work still gets its full
// non-productive gap computed correctly, including before the first session
// of the day and after the last.
export function computeNonProductiveTime(workHistory, employeeId, { now = Date.now() } = {}) {
  const byDay = new Map();
  workHistory.forEach((h) => {
    if (h.employeeId !== employeeId) return;
    const key = dayKeyFor(h.createdAt);
    if (!key) return; // no reliable timestamp — can't bucket this row to a day
    if (!byDay.has(key)) byDay.set(key, { loggedMs: 0, sampleDate: new Date(h.createdAt) });
    byDay.get(key).loggedMs += (h.hours || 0) * 3600000;
  });

  const todayKey = dayKeyFor(new Date(now).toISOString());

  const results = [...byDay.entries()].map(([key, { loggedMs, sampleDate }]) => {
    const dayStart = new Date(sampleDate);
    dayStart.setHours(0, 0, 0, 0);
    const shiftStart = dayStart.getTime() + TECH_SHIFT_WINDOW.startMinute * 60000;
    const shiftEndFull = dayStart.getTime() + TECH_SHIFT_WINDOW.endMinute * 60000;
    // For today specifically, cap capacity at "now" — otherwise someone
    // checking at 9am would see hours of "non-productive time" for the part
    // of the shift that hasn't even happened yet.
    const shiftEnd = key === todayKey ? Math.min(shiftEndFull, now) : shiftEndFull;
    const capacityMs = shiftEnd > shiftStart ? effectiveElapsedMs(shiftStart, shiftEnd) : 0;
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

// Shop-wide roll-up across every Panel Technician in `employees` (Leads are
// skipped — see the note on TECH_SHIFT_WINDOW), for the Analytics page.
// `workHistory` is expected to already be whatever range/role/employee
// filter the page has applied — same pattern as every other Reports.jsx
// computation, so this automatically respects the page's date-range picker.
// Sorted by most non-productive hours first, so the technicians it's most
// worth asking about float to the top.
export function computeNonProductiveSummary(workHistory, employees) {
  const perEmployee = employees
    .filter((e) => e.role === ROLES.TECH)
    .map((emp) => {
      const days = computeNonProductiveTime(workHistory, emp.id);
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

// Stages a technician can pick after scanning a panel's QR code.
export const productionStages = [
  { key: "verify", label: "Verifying Packout" },
  { key: "sort", label: "Sorting" },
  { key: "build", label: "Control Panel Build" },
  { key: "connect", label: "Route/Terminate" },
  { key: "test", label: "Continuity Test" },
  { key: "ship", label: "QC/Wrap" },
  { key: "rework", label: "Rework" },
  { key: "subbuild", label: "Agastat Sub. Assm." },
  { key: "auxpanel", label: "Aux Panel Build" },
  { key: "auxswitch", label: "Aux Switch Assm." },
];

// Key of the "Route/Terminate" stage — the one stage where progress logged
// translates directly into a connection count (see connectionsForPanel and
// AppContext.stopSession, which computes each session's connectionsCredited
// as (percentAdded / 100) * the panel's target connection count).
export const CONNECT_STAGE_KEY = "connect";
export const CONNECT_STAGE_LABEL = productionStages.find((s) => s.key === CONNECT_STAGE_KEY)?.label;

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
  return productionStages.map((stage) => stageStatsFromRows(workHistory, stage)).filter(Boolean);
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
