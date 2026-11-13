import { useMemo, useState } from "react";

// "Which panels is this kit for?" — a scrolling list of jobs (RFQ number +
// customer name, like the RFQ that was already sent), with every unit of a
// multi-unit job as a tap-to-tick chip and a one-tap "all units" toggle. Tick
// as many panels as the kit covers; the same kit is saved to each.
export default function KitPanelPicker({ groups, selected, onChange, kitByBuild, suggested }) {
  const [search, setSearch] = useState("");

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? groups.filter((g) => {
          const hay = [g.rfq, g.customer, g.jobNumber, ...g.units.flatMap((u) => [u.id, u.order, kitByBuild.get(u.buildId)?.soNumber ?? ""])].join(" ").toLowerCase();
          return q.split(/\s+/).every((w) => hay.includes(w));
        })
      : groups;
    // Suggested jobs first, in the same newest-first order otherwise.
    return [...list.filter((g) => suggested.has(g.rfq)), ...list.filter((g) => !suggested.has(g.rfq))];
  }, [groups, search, suggested, kitByBuild]);

  const toggleMany = (units) => {
    const next = new Set(selected);
    const allOn = units.every((u) => next.has(u.buildId));
    units.forEach((u) => (allOn ? next.delete(u.buildId) : next.add(u.buildId)));
    onChange(next);
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by RFQ, customer, job or Siemens order…"
          className="flex-1 rounded-lg border border-paper-200 px-3 py-2 text-[13px]"
        />
        <span className="text-[12px] text-ink-500 whitespace-nowrap">{selected.size} selected</span>
        {selected.size > 0 && (
          <button onClick={() => onChange(new Set())} className="text-[12px] font-semibold text-brand-600 hover:underline [touch-action:manipulation]">
            Clear
          </button>
        )}
      </div>

      <div className="max-h-[320px] overflow-y-auto rounded-lg border border-paper-200 divide-y divide-paper-100" data-testid="panel-picker">
        {shown.length === 0 && <p className="p-4 text-[13px] text-ink-500 text-center">No panels match that.</p>}
        {shown.map((g) => {
          const on = g.units.filter((u) => selected.has(u.buildId)).length;
          const multi = g.units.length > 1;
          const state = on === 0 ? "none" : on === g.units.length ? "all" : "some";
          return (
            <div key={g.rfq} className={`p-2.5 ${on > 0 ? "bg-brand-50/60" : ""}`}>
              <button
                onClick={() => toggleMany(g.units)}
                className="w-full flex items-center gap-3 text-left min-h-[40px] [touch-action:manipulation]"
                aria-label={`${multi ? "Select all units of" : "Select"} ${g.rfq}`}
              >
                <span
                  className={`shrink-0 w-5 h-5 rounded border flex items-center justify-center text-[12px] font-bold ${
                    state === "none" ? "border-paper-300 bg-white" : "border-brand-500 bg-brand-500 text-white"
                  }`}
                >
                  {state === "all" ? "✓" : state === "some" ? "–" : ""}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="font-semibold text-ink-900 text-[14px]">{g.rfq}</span>
                  <span className="text-ink-700 text-[14px]"> · {g.customer || "—"}</span>
                  {suggested.has(g.rfq) && <span className="ml-2 inline-flex rounded-full bg-good-50 text-good-600 text-[10px] font-bold px-1.5 py-0.5">Suggested</span>}
                </span>
                <span className="text-[11px] text-ink-500 text-right whitespace-nowrap">
                  {g.jobNumber && `Job ${g.jobNumber} · `}
                  {multi ? `${g.units.length} units` : "1 panel"}
                </span>
              </button>
              {multi && (
                <div className="flex flex-wrap gap-1.5 mt-1.5 pl-8">
                  {g.units.map((u) => {
                    const sel = selected.has(u.buildId);
                    const has = kitByBuild.has(u.buildId);
                    return (
                      <button
                        key={u.buildId}
                        onClick={() => toggleMany([u])}
                        className={`rounded-lg border px-3 py-2 text-[13px] font-semibold min-h-[40px] [touch-action:manipulation] ${
                          sel ? "border-brand-500 bg-brand-500 text-white" : "border-paper-200 bg-white text-ink-700 hover:bg-paper-50"
                        }`}
                      >
                        {u.id}
                        {has && <span className={`ml-1.5 text-[10px] font-bold ${sel ? "text-white/80" : "text-warn-600"}`}>has kit</span>}
                      </button>
                    );
                  })}
                </div>
              )}
              {!multi && kitByBuild.has(g.units[0].buildId) && <p className="pl-8 text-[11px] font-bold text-warn-600">Already has a kit</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
