import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import {
  productionStages,
  connectionsForPanel,
  taskProgress,
  currentBuilds,
  parsePanelQrValue,
  unitLabel,
  isClockedIn,
} from "../../data/mockData";
import { Button, formatNumber, formatTimeRange } from "../../components/ui";
import QrScanner from "../../components/QrScanner";

export default function Home() {
  const {
    session,
    startSession,
    myWorkHistory: workHistory,
    workHistory: allWorkHistory,
    panels,
    pricePerConnection,
    currentUser,
    roleDefaults,
    clockLog,
    clockScan,
  } = useApp();
  const navigate = useNavigate();
  const [showScanner, setShowScanner] = useState(false);
  const [scannedPanel, setScannedPanel] = useState(null);
  const [selectedStage, setSelectedStage] = useState(null);
  const [useCamera, setUseCamera] = useState(true);
  const [scanError, setScanError] = useState("");

  const [showClockScanner, setShowClockScanner] = useState(false);
  const [clockScanAttempt, setClockScanAttempt] = useState(0);
  const [clockError, setClockError] = useState("");
  const [clockResult, setClockResult] = useState(null);

  const clockedIn = isClockedIn(clockLog, currentUser.id);
  const openClockEntry = clockLog.find((c) => c.employeeId === currentUser.id && !c.clockedOutAt);

  function closeClockScanner() {
    setShowClockScanner(false);
    setClockError("");
    setClockScanAttempt(0);
  }

  // Called with the raw string decoded off the shop's shared clock QR (see
  // mockData.clockQrValue/parseClockQrValue) — toggles clock in/out for
  // whoever is signed in on this phone via AppContext.clockScan, which also
  // auto-ends any panel session they forgot to stop when clocking out.
  function handleClockDetect(raw) {
    const result = clockScan(raw);
    if (!result.ok) {
      setClockError(result.error);
      setClockScanAttempt((n) => n + 1); // remounts QrScanner so it can detect again
      return;
    }
    setClockResult(result);
    closeClockScanner();
  }

  const dailyGoal = currentUser.override ?? roleDefaults[currentUser.role].daily;
  const todayHours = workHistory
    .filter((h) => h.date === workHistory[0]?.date)
    .reduce((s, h) => s + h.hours, 0);

  const stageProgress =
    scannedPanel && selectedStage
      ? taskProgress(allWorkHistory, `#${scannedPanel.id}`, selectedStage, scannedPanel.buildId)
      : 0;

  // Only the current (most recent) build of each panel is scannable — an
  // older repeat build of the same panel is closed-out history, not
  // something a technician should be logging new work against.
  const scannablePanels = currentBuilds(panels);

  function closeScanner() {
    setShowScanner(false);
    setScannedPanel(null);
    setSelectedStage(null);
    setScanError("");
    setUseCamera(true);
  }

  function handleScan(panel) {
    setScannedPanel(panel);
  }

  // Called with the raw string decoded off a real QR code by the camera —
  // matched against the same ASSEMBLYOS:PANEL:<id>:JOB:<jobNumber> format
  // PanelDetailModal prints onto every panel's sticker (see
  // mockData.panelQrValue / parsePanelQrValue).
  function handleDetect(raw) {
    const parsed = parsePanelQrValue(raw);
    if (!parsed) {
      setScanError("That QR code isn't an AssemblyOS panel label.");
      return;
    }
    // Prefer an exact (id + job number) match so a repeat build's own
    // sticker opens THAT build, not just whichever is currently newest;
    // fall back to the current scannable build for that panel id if the
    // sticker predates job numbers being encoded.
    const exact = panels.find((p) => p.id === parsed.id && (!parsed.jobNumber || p.jobNumber === parsed.jobNumber));
    const fallback = scannablePanels.find((p) => p.id === parsed.id);
    const match = exact ?? fallback;
    if (!match) {
      setScanError(`No panel #${parsed.id} found on the schedule — ask your manager to check the estimate import.`);
      return;
    }
    setScanError("");
    handleScan(match);
  }

  function handleStart() {
    const target = connectionsForPanel(scannedPanel, pricePerConnection);
    startSession(`#${scannedPanel.id}`, selectedStage, target, scannedPanel.buildId);
    closeScanner();
    navigate("/mobile/session");
  }

  return (
    <div className="p-5">
      <p className="text-sm text-ink-500">Welcome back,</p>
      <h1 className="text-xl font-bold text-ink-900 -mt-0.5">{currentUser.name}</h1>
      <p className="text-[11px] text-ink-500 mt-0.5">
        {currentUser.role} · {currentUser.station}
      </p>

      {clockResult && (
        <div className="mt-3 rounded-xl2 bg-brand-50 border border-brand-100 p-3 flex items-start justify-between gap-2">
          <p className="text-[12px] text-brand-700">
            {clockResult.type === "in"
              ? "Clocked in — have a good shift!"
              : clockResult.autoEndedSessions > 0
                ? `Clocked out — ${clockResult.hours} hrs recorded. ${clockResult.autoEndedSessions} session${clockResult.autoEndedSessions === 1 ? "" : "s"} you hadn't stopped ${clockResult.autoEndedSessions === 1 ? "was" : "were"} auto-ended and flagged for your manager to review.`
                : `Clocked out — ${clockResult.hours} hrs recorded. See you next shift!`}
          </p>
          <button onClick={() => setClockResult(null)} className="text-brand-600 text-sm leading-none shrink-0">
            ×
          </button>
        </div>
      )}

      <div className="mt-3 rounded-xl2 bg-white border border-paper-200 shadow-card p-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-ink-500">Time Clock</p>
          <p className={`text-sm font-semibold mt-0.5 ${clockedIn ? "text-good-600" : "text-ink-900"}`}>
            {clockedIn && openClockEntry
              ? `Clocked in since ${new Date(openClockEntry.clockedInAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
              : "Not clocked in"}
          </p>
        </div>
        <Button
          variant={clockedIn ? "danger" : "primary"}
          className="shrink-0"
          onClick={() => {
            setClockError("");
            setClockScanAttempt(0);
            setShowClockScanner(true);
          }}
        >
          {clockedIn ? "Clock Out" : "Clock In"}
        </Button>
      </div>

      {session.active ? (
        <div className="mt-4 rounded-xl2 bg-good-50 border border-good-100 p-4">
          <p className="text-xs font-semibold text-good-600 mb-1">Session already active</p>
          <p className="text-sm text-ink-900">
            Panel {session.panel} {session.stage ? `· ${session.stage}` : ""}
          </p>
          <Button className="mt-3 w-full" onClick={() => navigate("/mobile/session")}>
            Resume Session
          </Button>
        </div>
      ) : (
        <Button className="mt-4 w-full py-3" onClick={() => setShowScanner(true)}>
          <ScanIcon /> Scan QR Code to Start
        </Button>
      )}

      <div className="mt-5 rounded-xl2 bg-white border border-paper-200 shadow-card p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-ink-500">Today's progress</p>
          <p className="text-xs font-semibold text-ink-900">
            {todayHours.toFixed(1)}/{dailyGoal} hrs
          </p>
        </div>
        <div className="h-2 rounded-full bg-paper-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-brand-500"
            style={{ width: `${Math.min(100, (todayHours / dailyGoal) * 100)}%` }}
          />
        </div>
        <p className="text-[11px] text-ink-500 mt-2">
          Sessions logged today: <span className="font-semibold text-ink-900">{workHistory[0]?.panels ?? 0}</span>
        </p>
      </div>

      {workHistory[0] && (
        <div className="mt-4 rounded-xl2 bg-white border border-paper-200 shadow-card p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold text-ink-500">Last Logged Entry</p>
            <button onClick={() => navigate("/mobile/history")} className="text-[11px] font-semibold text-brand-600">
              View History
            </button>
          </div>
          <p className="text-sm font-semibold text-ink-900">Panel {workHistory[0].panel}</p>
          <p className="text-[11px] text-ink-500 mt-0.5">
            {workHistory[0].stage} · {workHistory[0].taskCompleted ? "Completed" : `+${workHistory[0].percentAdded}%`} ·{" "}
            {workHistory[0].date}
          </p>
          <p className="text-[10px] text-ink-400 mt-0.5">
            {formatTimeRange(workHistory[0].startedAt, workHistory[0].endedAt)}
          </p>
        </div>
      )}

      {showScanner && (
        <div className="fixed inset-0 z-20 bg-black/40 flex items-end justify-center" onClick={closeScanner}>
          <div
            className="w-full max-w-[400px] bg-white rounded-t-2xl p-5 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-paper-200 mx-auto mb-4" />

            {!scannedPanel ? (
              <>
                <p className="text-sm font-semibold text-ink-900 mb-1">Scan Panel QR Code</p>
                <p className="text-[11px] text-ink-500 mb-4">
                  {useCamera
                    ? "Point your camera at the QR code printed on the panel."
                    : "Pick the panel you're working on from the list below."}
                </p>

                {useCamera ? (
                  <>
                    <QrScanner onDetect={handleDetect} onCancel={closeScanner} />
                    {scanError && <p className="text-[11px] text-bad-600 mt-3">{scanError}</p>}
                    <button
                      onClick={() => {
                        setScanError("");
                        setUseCamera(false);
                      }}
                      className="mt-3 w-full text-center text-[11px] font-semibold text-brand-600"
                    >
                      Camera not working? Pick a panel manually
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setScanError("");
                        setUseCamera(true);
                      }}
                      className="mb-3 text-[11px] font-semibold text-brand-600"
                    >
                      ← Use camera instead
                    </button>
                    {scannablePanels.length === 0 && (
                      <p className="text-xs text-ink-400 text-center py-6">
                        No panels yet — ask your manager to import a panel estimate first.
                      </p>
                    )}
                    <div className="space-y-2">
                      {scannablePanels.map((p) => (
                        <button
                          key={p.buildId}
                          onClick={() => handleScan(p)}
                          className="w-full flex items-center justify-between rounded-lg border border-paper-200 px-3 py-2.5 text-left hover:border-brand-400"
                        >
                          <span className="text-sm font-medium text-ink-900">
                            #{p.id}
                            {unitLabel(p) && (
                              <span className="ml-1 inline-block rounded-full bg-brand-50 text-brand-700 text-[10px] font-semibold px-1.5 py-0.5 align-middle">
                                {unitLabel(p)}
                              </span>
                            )}
                          </span>
                          <span className="text-[11px] text-ink-500">{p.customer}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    setScannedPanel(null);
                    setSelectedStage(null);
                  }}
                  className="text-[11px] font-semibold text-brand-600 mb-3"
                >
                  ← Scan a different panel
                </button>

                <div className="rounded-lg bg-paper-50 border border-paper-200 px-3 py-2.5 mb-4">
                  <p className="text-sm font-semibold text-ink-900">
                    Panel #{scannedPanel.id}
                    {unitLabel(scannedPanel) && (
                      <span className="ml-1.5 inline-block rounded-full bg-brand-50 text-brand-700 text-[10px] font-semibold px-1.5 py-0.5 align-middle">
                        {unitLabel(scannedPanel)}
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-ink-500 mt-0.5">{scannedPanel.customer} · {scannedPanel.order}</p>
                  <p className="text-[11px] font-semibold text-brand-700 mt-1">
                    {formatNumber(connectionsForPanel(scannedPanel, pricePerConnection))} connections on this panel
                  </p>
                </div>

                <p className="text-sm font-semibold text-ink-900 mb-1">What are you doing on this panel?</p>
                <p className="text-[11px] text-ink-500 mb-3">Select a stage, then start your session.</p>
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {productionStages.map((s) => (
                    <button
                      key={s.key}
                      onClick={() => setSelectedStage(s.label)}
                      className={`rounded-lg border px-3 py-2.5 text-sm font-medium text-left ${
                        selectedStage === s.label
                          ? "border-brand-500 bg-brand-50 text-brand-700"
                          : "border-paper-200 text-ink-900 hover:border-brand-400"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                {selectedStage && stageProgress > 0 && (
                  <div className="rounded-lg bg-warn-50 border border-warn-100 px-3 py-2.5 mb-4">
                    <p className="text-[11px] font-semibold text-warn-600">
                      This task is already {stageProgress}% complete. You'll report how much further you get when you
                      stop.
                    </p>
                  </div>
                )}

                <Button className="w-full py-3" disabled={!selectedStage} onClick={handleStart}>
                  Start Session
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {showClockScanner && (
        <div className="fixed inset-0 z-20 bg-black/40 flex items-end justify-center" onClick={closeClockScanner}>
          <div className="w-full max-w-[400px] bg-white rounded-t-2xl p-5 pb-8" onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1 rounded-full bg-paper-200 mx-auto mb-4" />
            <p className="text-sm font-semibold text-ink-900 mb-1">
              {clockedIn ? "Scan to Clock Out" : "Scan to Clock In"}
            </p>
            <p className="text-[11px] text-ink-500 mb-4">
              Point your camera at the clock QR code posted at the shop entrance.
              {clockedIn && " Any panel session you forgot to stop will be ended automatically."}
            </p>
            <QrScanner key={clockScanAttempt} onDetect={handleClockDetect} onCancel={closeClockScanner} />
            {clockError && <p className="text-[11px] text-bad-600 mt-3">{clockError}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function ScanIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 8V5a1 1 0 0 1 1-1h3M20 8V5a1 1 0 0 0-1-1h-3M4 16v3a1 1 0 0 0 1 1h3M20 16v3a1 1 0 0 1-1 1h-3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 12h16" strokeLinecap="round" />
    </svg>
  );
}
