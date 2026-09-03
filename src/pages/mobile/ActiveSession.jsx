import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { Button, formatNumber } from "../../components/ui";
import { unitLabel, effectiveElapsedMs, REWORK_STAGE_LABEL } from "../../data/mockData";

// Sentinel for the "Attributed To" picker below — distinct from an unset
// (not-yet-chosen) selection, "unknown" is an explicit, deliberate answer
// meaning rework isn't attributable to one person's error (a supplied part
// was bad, a spec changed, damage in handling, etc.), and translates to a
// real `null` on the saved entry so it isn't confused with "nobody has
// answered this yet."
const UNKNOWN_ATTRIBUTION = "unknown";

export default function ActiveSession() {
  const { session, setSessionNotes, stopSession, panels, employees } = useApp();
  const activePanel = panels.find((p) => `#${p.id}` === session.panel && p.buildId === session.buildId);
  const navigate = useNavigate();
  const [elapsed, setElapsed] = useState(0);
  const [showStopModal, setShowStopModal] = useState(false);
  const [percentAdded, setPercentAdded] = useState(null);

  // Only asked for — and only required — when this session's stage is
  // Rework. Pat's request: before a Rework session can be logged out of,
  // capture why it's being reworked, the root cause, and who the original
  // work is attributed to, so this is a paper trail a shop can actually
  // learn from (a recurring root cause, a training gap) instead of just
  // logged hours with no context.
  const isRework = session.stage === REWORK_STAGE_LABEL;
  const [reworkReason, setReworkReason] = useState("");
  const [reworkRootCause, setReworkRootCause] = useState("");
  const [reworkAttributedTo, setReworkAttributedTo] = useState(""); // "" = not yet chosen

  // Shows the same break-adjusted time that will actually get logged when
  // this session stops (see effectiveElapsedMs) — so a technician working
  // through 9:15–9:30, 11:00–11:30, or 3:15–3:30 sees the clock hold rather
  // than getting a number here that doesn't match their logged hours later.
  useEffect(() => {
    if (!session.active || !session.startedAt) return;
    const tick = () => setElapsed(effectiveElapsedMs(session.startedAt, Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [session.active, session.startedAt]);

  if (!session.active) {
    return (
      <div className="p-5 text-center mt-10">
        <p className="text-sm text-ink-500">No active session.</p>
        <Button className="mt-4" onClick={() => navigate("/mobile")}>
          Go to Home
        </Button>
      </div>
    );
  }

  const hrs = String(Math.floor(elapsed / 3600000)).padStart(2, "0");
  const mins = String(Math.floor((elapsed % 3600000) / 60000)).padStart(2, "0");
  const secs = String(Math.floor((elapsed % 60000) / 1000)).padStart(2, "0");

  const remaining = 100 - session.startingProgress;
  const options = [];
  for (let p = 10; p <= remaining; p += 10) options.push(p);
  if (remaining > 0 && !options.includes(remaining)) options.push(remaining);

  function openStopModal() {
    // Nothing left to add if the task was already at 100% when this session
    // started — pre-select 0% so Confirm isn't stuck disabled with no options.
    setPercentAdded(remaining <= 0 ? 0 : null);
    setReworkReason("");
    setReworkRootCause("");
    setReworkAttributedTo("");
    setShowStopModal(true);
  }

  // Rework's three fields are required in addition to the usual progress
  // pick — same "disabled until answered" pattern the percent-progress
  // buttons already use, just with more to fill in before this unlocks.
  const reworkFieldsComplete =
    !isRework || (reworkReason.trim() !== "" && reworkRootCause.trim() !== "" && reworkAttributedTo !== "");
  const canConfirm = percentAdded !== null && reworkFieldsComplete;

  function confirmStop() {
    stopSession(percentAdded ?? 0, {
      reworkReason: isRework ? reworkReason.trim() : null,
      reworkRootCause: isRework ? reworkRootCause.trim() : null,
      reworkAttributedToId: isRework && reworkAttributedTo !== UNKNOWN_ATTRIBUTION ? reworkAttributedTo : null,
    });
    navigate("/mobile");
  }

  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-semibold text-good-600 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-good-500 animate-pulse" /> Active Work Session
        </p>
      </div>
      <h1 className="text-lg font-bold text-ink-900">
        Panel {session.panel}
        {activePanel && unitLabel(activePanel) && (
          <span className="ml-1.5 inline-block rounded-full bg-brand-50 text-brand-700 text-[11px] font-semibold px-2 py-0.5 align-middle">
            {unitLabel(activePanel)}
          </span>
        )}
      </h1>
      {activePanel && (
        <p className="text-[11px] text-ink-500 mt-0.5">
          Customer {activePanel.customer} · {activePanel.order}
        </p>
      )}
      {session.targetConnections ? (
        <p className="text-[11px] text-ink-500 mt-0.5">
          {formatNumber(session.targetConnections)} connections on this panel
        </p>
      ) : null}
      {session.stage && (
        <span className="inline-block mt-2 rounded-full bg-brand-50 text-brand-700 text-[11px] font-semibold px-2.5 py-1">
          {session.stage}
        </span>
      )}

      <div className="mt-5 rounded-xl2 bg-white border border-paper-200 shadow-card p-5 text-center">
        <p className="text-xs font-semibold text-ink-500 mb-1">Elapsed time</p>
        <p className="text-3xl font-bold text-ink-900 tabular-nums">
          {hrs}:{mins}:{secs}
        </p>
      </div>

      <div className="mt-4 rounded-xl2 bg-white border border-paper-200 shadow-card p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-ink-500">Task progress</p>
          <p className="text-xs font-semibold text-ink-900">{session.startingProgress}% before your session</p>
        </div>
        <div className="h-2 rounded-full bg-paper-100 overflow-hidden">
          <div className="h-full rounded-full bg-brand-500" style={{ width: `${session.startingProgress}%` }} />
        </div>
        <p className="text-[10px] text-ink-400 mt-2">
          {session.startingProgress > 0
            ? "Prior work has already been logged on this task — you'll report how much further you get when you stop."
            : "You'll report your own progress in 10% steps when you stop this session."}
        </p>
      </div>

      <div className="mt-4">
        <label className="text-xs font-semibold text-ink-500">Notes (optional)</label>
        <textarea
          value={session.notes}
          onChange={(e) => setSessionNotes(e.target.value)}
          rows={2}
          placeholder="Add note…"
          className="mt-1 w-full rounded-lg border border-paper-200 px-3 py-2 text-sm resize-none"
        />
      </div>

      <Button variant="danger" className="w-full mt-5 py-3" onClick={openStopModal}>
        Stop Session
      </Button>

      {showStopModal && (
        <div className="fixed inset-0 z-30 bg-black/40 flex items-end justify-center" onClick={() => setShowStopModal(false)}>
          <div
            className="w-full max-w-[400px] bg-white rounded-t-2xl p-5 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-paper-200 mx-auto mb-4" />
            <p className="text-sm font-semibold text-ink-900 mb-1">How much progress did you make?</p>
            <p className="text-[11px] text-ink-500 mb-4">
              This task was {session.startingProgress}% done before your session. Estimate how much further you got —
              in 10% steps.
            </p>

            {remaining <= 0 ? (
              <p className="text-[11px] text-ink-500 bg-paper-50 border border-paper-200 rounded-lg px-3 py-2.5 mb-4">
                This task was already at 100% — there's no progress left to add. Your time will still be logged.
              </p>
            ) : (
              <div className="grid grid-cols-4 gap-2 mb-4">
                {options.map((p) => (
                  <button
                    key={p}
                    onClick={() => setPercentAdded(p)}
                    className={`rounded-lg border px-2 py-2.5 text-sm font-semibold ${
                      percentAdded === p
                        ? "border-brand-500 bg-brand-50 text-brand-700"
                        : "border-paper-200 text-ink-900 hover:border-brand-400"
                    }`}
                  >
                    +{p}%
                  </button>
                ))}
              </div>
            )}

            {remaining > 0 && (
              <button
                onClick={() => setPercentAdded(remaining)}
                className={`w-full rounded-lg border px-3 py-2.5 text-sm font-semibold mb-4 ${
                  percentAdded === remaining
                    ? "border-good-500 bg-good-50 text-good-700"
                    : "border-good-200 text-good-600 hover:border-good-400"
                }`}
              >
                ✓ Task Complete (+{remaining}%)
              </button>
            )}

            {percentAdded !== null && (
              <p className="text-[11px] text-ink-500 mb-3 text-center">
                Task will be at{" "}
                <span className="font-semibold text-ink-900">
                  {Math.min(100, session.startingProgress + percentAdded)}%
                </span>{" "}
                after this session.
              </p>
            )}

            {isRework && (
              <div className="border-t border-paper-100 pt-4 mt-1 mb-4">
                <p className="text-sm font-semibold text-ink-900 mb-1">Rework details</p>
                <p className="text-[11px] text-ink-500 mb-3">
                  Required before this rework session can be logged out — helps the shop spot a recurring root
                  cause instead of just seeing that rework happened.
                </p>

                <label className="text-xs font-semibold text-ink-500">What needed to be reworked, and why</label>
                <textarea
                  value={reworkReason}
                  onChange={(e) => setReworkReason(e.target.value)}
                  rows={2}
                  placeholder="e.g. 3 terminations failed continuity test — wires re-landed"
                  className="mt-1 mb-3 w-full rounded-lg border border-paper-200 px-3 py-2 text-sm resize-none"
                />

                <label className="text-xs font-semibold text-ink-500">Root cause</label>
                <textarea
                  value={reworkRootCause}
                  onChange={(e) => setReworkRootCause(e.target.value)}
                  rows={2}
                  placeholder="e.g. wrong wire gauge pulled from the cart"
                  className="mt-1 mb-3 w-full rounded-lg border border-paper-200 px-3 py-2 text-sm resize-none"
                />

                <label className="text-xs font-semibold text-ink-500">Attributed to</label>
                <select
                  value={reworkAttributedTo}
                  onChange={(e) => setReworkAttributedTo(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-paper-200 px-3 py-2 text-sm bg-white"
                >
                  <option value="" disabled>
                    Select…
                  </option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                  <option value={UNKNOWN_ATTRIBUTION}>Unknown / not one person's error</option>
                </select>
              </div>
            )}

            <Button className="w-full py-3" disabled={!canConfirm} onClick={confirmStop}>
              Confirm &amp; Stop Session
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
