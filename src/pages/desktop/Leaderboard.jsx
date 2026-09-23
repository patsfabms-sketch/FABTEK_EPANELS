import { useMemo } from "react";
import { useApp } from "../../context/AppContext";
import { computeStageLeaderboards, INSIGHT_MIN_SESSIONS } from "../../data/mockData";
import { Card, Avatar } from "../../components/ui";

// One rank badge per row — gold/silver/bronze for the top 3, a plain
// numbered circle below that. Kept as its own tiny component since it shows
// up once per row across every stage card on this page.
function RankBadge({ rank }) {
  const style =
    rank === 1
      ? "bg-amber-400 text-amber-950"
      : rank === 2
      ? "bg-slate-300 text-slate-800"
      : rank === 3
      ? "bg-orange-300 text-orange-950"
      : "bg-paper-100 text-ink-500";
  return (
    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${style}`}>
      {rank}
    </div>
  );
}

// One production stage's leaderboard — 1st place through whoever else
// qualifies, all visible at once (no click-through needed) since the whole
// point of this page is "easier visibility" of the full order, not just the
// winner.
function StageLeaderboardCard({ board }) {
  const metricLabel = board.rankedBy === "connectionsPerHour" ? "Connections/hr" : "Avg Hours";
  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[13px] font-bold text-ink-900">{board.label}</p>
        <p className="text-[10px] text-ink-400">
          Ranked by {board.rankedBy === "connectionsPerHour" ? "connections/hr (higher is better)" : "avg hours (lower is better)"}
        </p>
      </div>
      <div className="space-y-1.5">
        {board.rows.map((r) => (
          <div key={r.employee.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-paper-50">
            <RankBadge rank={r.rank} />
            <Avatar employee={r.employee} sizeClass="w-6 h-6 text-[10px]" />
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold text-ink-900 truncate">{r.employee.name}</p>
              <p className="text-[10px] text-ink-400">
                {r.sessions} session{r.sessions === 1 ? "" : "s"}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[13px] font-bold text-brand-600">
                {board.rankedBy === "connectionsPerHour" ? r.connectionsPerHour : r.avgHours}
              </p>
              <p className="text-[9px] text-ink-400">{metricLabel}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function Leaderboard() {
  const { workHistory, employees } = useApp();

  const boards = useMemo(() => computeStageLeaderboards(workHistory, employees), [workHistory, employees]);

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ink-900">Leaderboard</h1>
        <p className="text-sm text-ink-500 mt-1">
          Who's best at each task, 1st place through however many technicians qualify — all-time, from real logged
          sessions.
        </p>
      </div>

      {boards.length === 0 ? (
        <Card>
          <p className="text-xs text-ink-400 text-center py-8">
            No stage has {INSIGHT_MIN_SESSIONS}+ logged sessions from at least one technician yet — leaderboards show
            up here once there's enough history to rank fairly.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {boards.map((board) => (
            <StageLeaderboardCard key={board.key} board={board} />
          ))}
        </div>
      )}

      <p className="text-[11px] text-ink-400 mt-6">
        A technician needs at least {INSIGHT_MIN_SESSIONS} logged sessions at a stage to show up on that stage's
        board — one unusually fast or slow session shouldn't hand out (or bury) a rank. Route/Terminate is ranked by
        connections credited per hour, since that stage's session length depends on how big the panel was; every
        other stage is ranked by average hours per session, since there's no per-session size signal to account for
        there. Ties are broken by whoever has logged more sessions at that stage.
      </p>
    </div>
  );
}
