import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { productionStages, taskProgress } from "../../data/mockData";
import { Button } from "../../components/ui";

export default function LogWork() {
  const { submitProductionLog, panels, workHistory } = useApp();
  const navigate = useNavigate();
  const [panel, setPanel] = useState(panels[0]?.id ?? "");
  const [stage, setStage] = useState(productionStages[0].label);
  const [percentAdded, setPercentAdded] = useState(null);
  const [hours, setHours] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const startingProgress = useMemo(
    () => taskProgress(workHistory, `#${panel}`, stage),
    [workHistory, panel, stage]
  );
  const remaining = 100 - startingProgress;
  const percentOptions = useMemo(() => {
    const opts = [];
    for (let p = 10; p <= remaining; p += 10) opts.push(p);
    if (remaining > 0 && !opts.includes(remaining)) opts.push(remaining);
    return opts;
  }, [remaining]);

  function handleSubmit() {
    if (!percentAdded) {
      setError("Select how much progress you completed.");
      return;
    }
    setError("");
    submitProductionLog({
      panel: `#${panel}`,
      stage,
      percentAdded,
      hours: hours ? Number(hours) : 1,
    });
    setSubmitted(true);
    setPercentAdded(null);
    setHours("");
    setTimeout(() => setSubmitted(false), 1800);
  }

  if (panels.length === 0) {
    return (
      <div className="p-5 text-center mt-10">
        <p className="text-sm font-semibold text-ink-900">No panels yet</p>
        <p className="text-xs text-ink-500 mt-1">
          Ask your manager to import a panel estimate before you can log work.
        </p>
      </div>
    );
  }

  return (
    <div className="p-5">
      <h1 className="text-lg font-bold text-ink-900">Log Production Work</h1>
      <p className="text-[11px] text-ink-500 mt-0.5">Submit a report for a completed assembly task</p>

      <div className="mt-4">
        <label className="text-xs font-semibold text-ink-500">Select Panel / Job</label>
        <select
          value={panel}
          onChange={(e) => {
            setPanel(e.target.value);
            setPercentAdded(null);
          }}
          className="mt-1 w-full rounded-lg border border-paper-200 px-3 py-2.5 text-sm bg-white"
        >
          {panels.map((p) => (
            <option key={p.id} value={p.id}>
              #{p.id} — {p.customer}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4">
        <label className="text-xs font-semibold text-ink-500">Task Stage</label>
        <div className="grid grid-cols-2 gap-2 mt-1">
          {productionStages.map((s) => (
            <button
              key={s.key}
              onClick={() => {
                setStage(s.label);
                setPercentAdded(null);
              }}
              className={`rounded-lg border px-3 py-2.5 text-[13px] font-medium text-left ${
                stage === s.label
                  ? "border-brand-400 bg-brand-50 text-brand-700"
                  : "border-paper-200 text-ink-600"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {startingProgress > 0 && (
        <p className="text-[11px] text-warn-600 font-semibold mt-3">
          This task is already {startingProgress}% complete.
        </p>
      )}

      <div className="mt-4">
        <label className="text-xs font-semibold text-ink-500">Progress completed this session</label>
        <div className="grid grid-cols-4 gap-2 mt-1">
          {percentOptions.map((p) => (
            <button
              key={p}
              onClick={() => setPercentAdded(p)}
              className={`rounded-lg border px-2 py-2 text-[13px] font-semibold ${
                percentAdded === p
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-paper-200 text-ink-900"
              }`}
            >
              +{p}%
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <label className="text-xs font-semibold text-ink-500">Hours logged</label>
        <input
          type="number"
          step="0.1"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          placeholder="1.0"
          className="mt-1 w-full rounded-lg border border-paper-200 px-3 py-2.5 text-sm"
        />
      </div>

      {error && <p className="text-[11px] text-bad-600 mt-2">{error}</p>}
      {submitted && <p className="text-[11px] text-good-600 mt-2 font-semibold">Production log submitted ✓</p>}

      <Button className="w-full mt-5 py-3" onClick={handleSubmit}>
        Submit Production Log
      </Button>
      <Button variant="ghost" className="w-full mt-2 py-3" onClick={() => navigate("/mobile")}>
        Cancel
      </Button>
    </div>
  );
}
