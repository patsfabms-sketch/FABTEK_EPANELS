import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { productionStages, connectionsForPanel, taskProgress } from "../../data/mockData";
import { Button, formatNumber } from "../../components/ui";

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
  } = useApp();
  const navigate = useNavigate();
  const [showScanner, setShowScanner] = useState(false);
  const [scannedPanel, setScannedPanel] = useState(null);
  const [selectedStage, setSelectedStage] = useState(null);

  const dailyGoal = currentUser.override ?? roleDefaults[currentUser.role].daily;
  const todayHours = workHistory
    .filter((h) => h.date === workHistory[0]?.date)
    .reduce((s, h) => s + h.hours, 0);

  const stageProgress =
    scannedPanel && selectedStage ? taskProgress(allWorkHistory, `#${scannedPanel.id}`, selectedStage) : 0;

  function closeScanner() {
    setShowScanner(false);
    setScannedPanel(null);
    setSelectedStage(null);
  }

  function handleScan(panel) {
    setScannedPanel(panel);
  }

  function handleStart() {
    const target = connectionsForPanel(scannedPanel, pricePerConnection);
    startSession(`#${scannedPanel.id}`, selectedStage, target);
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
                <p className="text-sm font-semibold text-ink-900 mb-1">Scanning Panel…</p>
                <p className="text-[11px] text-ink-500 mb-4">Point camera at the QR code on the panel. (Simulated — pick one below.)</p>
                {panels.length === 0 && (
                  <p className="text-xs text-ink-400 text-center py-6">
                    No panels yet — ask your manager to import a panel estimate first.
                  </p>
                )}
                <div className="space-y-2">
                  {panels.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleScan(p)}
                      className="w-full flex items-center justify-between rounded-lg border border-paper-200 px-3 py-2.5 text-left hover:border-brand-400"
                    >
                      <span className="text-sm font-medium text-ink-900">#{p.id}</span>
                      <span className="text-[11px] text-ink-500">{p.customer}</span>
                    </button>
                  ))}
                </div>
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
                  <p className="text-sm font-semibold text-ink-900">Panel #{scannedPanel.id}</p>
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
