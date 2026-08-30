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


// 30 operational days of team-wide hours logged, used by both the Goal
// Management chart and the Reports chart.
export function generateDailyOutput(days = 30, target = 120) {
  const out = [];
  const today = new Date();
  let seed = 42;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const wobble = (rand() - 0.45) * 0.28;
    const value = Math.max(Math.round(target * 0.5), Math.round(target * (1 + wobble)));
    out.push({
      date: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      value,
      target,
      aboveTarget: value >= target,
    });
  }
  return out;
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

// The string encoded into a panel's printed QR code. Kept as a single,
// namespaced convention (rather than the bare panel id) so a future real
// camera-scan implementation on the mobile app can reliably recognize an
// AssemblyOS panel sticker versus any other QR code someone might point the
// camera at.
export function panelQrValue(panel) {
  return `ASSEMBLYOS:PANEL:${panel.id}`;
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

// Real per-employee output stats, computed from their actual logged work
// (workHistory), broken down by production stage. Replaces what used to be a
// seeded-random stand-in now that every technician's sessions produce real
// history — average hours per task, and for Route/Terminate specifically,
// average connections credited per hour (their real terminating rate).
export function computeStageStats(workHistory, employeeId) {
  const mine = workHistory.filter((h) => h.employeeId === employeeId);
  return productionStages
    .map((stage) => {
      const rows = mine.filter((h) => h.stage === stage.label);
      if (rows.length === 0) return null;
      const totalHours = rows.reduce((s, h) => s + (h.hours || 0), 0);
      const completedTasks = rows.filter((h) => h.taskCompleted).length;
      const totalConnections = rows.reduce((s, h) => s + (h.connectionsCredited || 0), 0);
      return {
        key: stage.key,
        label: stage.label,
        sessions: rows.length,
        hours: Number(totalHours.toFixed(1)),
        avgHours: rows.length ? Number((totalHours / rows.length).toFixed(2)) : 0,
        completedTasks,
        totalConnections,
        connectionsPerHour: totalHours > 0 ? Number((totalConnections / totalHours).toFixed(1)) : 0,
      };
    })
    .filter(Boolean);
}
