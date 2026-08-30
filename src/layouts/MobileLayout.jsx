import { NavLink, Outlet, useNavigate, Link } from "react-router-dom";
import { useApp } from "../context/AppContext";
import Login from "../pages/mobile/Login";
import AdminHome from "../pages/mobile/AdminHome";

// No "Log Work" tab — work is logged automatically as a byproduct of
// scanning into a panel and stopping the session (see AppContext.stopSession),
// never through a standalone manual-entry form.
const TABS = [
  { to: "/mobile", label: "Home", icon: HomeIcon, end: true },
  { to: "/mobile/history", label: "History", icon: HistoryIcon },
  { to: "/mobile/profile", label: "Profile", icon: ProfileIcon },
];

export default function MobileLayout() {
  const { session, currentUser, currentAdmin } = useApp();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-ink-950 flex items-center justify-center py-8 px-4">
      <div className="w-full max-w-[400px] bg-paper-50 rounded-[2.25rem] border-8 border-ink-900 shadow-popover overflow-hidden flex flex-col h-[820px]">
        <div className="flex items-center justify-between px-5 pt-3 pb-1 text-[11px] font-semibold text-ink-900 shrink-0">
          <span>9:41</span>
          <span className="flex items-center gap-1 text-ink-500">
            <SignalIcon /> <WifiIcon /> <BatteryIcon />
          </span>
        </div>
        <Link
          to="/dashboard"
          className="mx-5 mb-1 shrink-0 text-[10px] font-semibold text-brand-600 hover:text-brand-700 self-start"
        >
          ← Manager (desktop) console
        </Link>

        {currentUser && session.active && (
          <button
            onClick={() => navigate("/mobile/session")}
            className="mx-4 mt-1 mb-2 shrink-0 rounded-lg bg-good-50 border border-good-100 text-good-600 text-[11px] font-semibold px-3 py-1.5 flex items-center justify-between"
          >
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-good-500 animate-pulse" /> Session active — Panel {session.panel}
            </span>
            <span>Resume →</span>
          </button>
        )}

        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {currentUser ? <Outlet /> : currentAdmin ? <AdminHome /> : <Login />}
        </div>

        {currentUser && (
          <nav className="grid grid-cols-4 border-t border-paper-200 bg-white shrink-0">
            {TABS.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium ${
                    isActive ? "text-brand-600" : "text-ink-400"
                  }`
                }
              >
                <tab.icon className="w-5 h-5" />
                {tab.label}
              </NavLink>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}

function iconProps(props) {
  return { fill: "none", stroke: "currentColor", strokeWidth: 1.8, viewBox: "0 0 24 24", ...props };
}
function HomeIcon(props) {
  return (
    <svg {...iconProps(props)}>
      <path d="M4 11.5 12 4l8 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 10v9h12v-9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function HistoryIcon(props) {
  return (
    <svg {...iconProps(props)}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function ProfileIcon(props) {
  return (
    <svg {...iconProps(props)}>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5 20c0-3.5 3-6.2 7-6.2s7 2.7 7 6.2" strokeLinecap="round" />
    </svg>
  );
}
function SignalIcon() {
  return (
    <svg width="14" height="10" viewBox="0 0 14 10" fill="currentColor">
      <rect x="0" y="6" width="2.5" height="4" rx="0.5" />
      <rect x="4" y="4" width="2.5" height="6" rx="0.5" />
      <rect x="8" y="2" width="2.5" height="8" rx="0.5" />
      <rect x="11.5" y="0" width="2.5" height="10" rx="0.5" />
    </svg>
  );
}
function WifiIcon() {
  return (
    <svg width="14" height="10" viewBox="0 0 14 10" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M1 3.5a9 9 0 0 1 12 0M3.3 6a5.5 5.5 0 0 1 7.4 0" strokeLinecap="round" />
      <circle cx="7" cy="8.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
function BatteryIcon() {
  return (
    <svg width="20" height="10" viewBox="0 0 20 10" fill="none" stroke="currentColor" strokeWidth="1.2">
      <rect x="0.5" y="0.5" width="16" height="9" rx="2" />
      <rect x="17.5" y="3" width="1.5" height="4" rx="0.5" fill="currentColor" stroke="none" />
      <rect x="2" y="2" width="12" height="6" rx="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
