import { useState } from "react";
import { NavLink, Outlet, Link, Navigate, useLocation } from "react-router-dom";
import { useApp } from "../context/AppContext";
import AdminLogin from "../pages/desktop/AdminLogin";
import Login from "../pages/mobile/Login";
import { SaveErrorBanner, LoadingScreen, Button } from "../components/ui";
import { setViewPref } from "../data/viewPref";

// Set VITE_SANDBOX=true on the separate test site; the live site never sets it.
export const IS_SANDBOX = import.meta.env.VITE_SANDBOX === "true";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: DashboardIcon },
  { to: "/floor-status", label: "Floor Status", icon: FloorStatusIcon },
  { to: "/panels", label: "Panels", icon: PanelsIcon, panelsOnly: true },
  { to: "/reports", label: "Analytics", icon: ReportsIcon },
  { to: "/capacity-report", label: "Capacity Report", icon: CapacityIcon },
  { to: "/kits", label: "Pack-out Kits", icon: KitsIcon, sandbox: true, panelsOnly: true },
  { to: "/packout-issues", label: "Packout Issues", icon: PackoutIssuesIcon, panelsOnly: true },
  { to: "/team", label: "Team", icon: TeamIcon },
  { to: "/payroll", label: "Payroll", icon: PayrollIcon },
  { to: "/pnl", label: "P&L", icon: PnlIcon },
  { to: "/sessions", label: "Session Log", icon: SessionLogIcon },
  { to: "/leaderboard", label: "Leaderboard", icon: LeaderboardIcon },
  { to: "/estimates", label: "Estimates", icon: EstimatesIcon },
  { to: "/get-app", label: "Get the App", icon: GetAppIcon },
];

// Pages a panels-only console user may open (a path matches itself or anything
// under it). Everything else — payroll, P&L, analytics, team, estimates,
// session log and so on — bounces back to Pack-out Kits.
const PANELS_ONLY_PATHS = ["/panels", "/kits", "/kit", "/packout-issues"];

export default function DesktopLayout() {
  const {
    currentAdmin,
    currentUser,
    panelsOnlyConsole,
    logout,
    adminLogout,
    saveError,
    ready,
    initialLoadFailed,
    retryConnection,
  } = useApp();
  const location = useLocation();

  if (!ready) return <LoadingScreen connectionFailed={initialLoadFailed} onRetry={retryConnection} />;
  if (!currentAdmin && !panelsOnlyConsole) {
    // A signed-in team member without console access: say so plainly instead
    // of showing a manager login that can't work for them.
    return currentUser ? <NoConsoleAccess user={currentUser} onLogout={logout} /> : <DesktopSignIn />;
  }
  if (panelsOnlyConsole) {
    const allowed = PANELS_ONLY_PATHS.some((p) => location.pathname === p || location.pathname.startsWith(`${p}/`));
    if (!allowed) return <Navigate to="/kits" replace />;
  }
  const navItems = panelsOnlyConsole ? NAV.filter((n) => n.panelsOnly) : NAV;
  const displayName = panelsOnlyConsole ? currentUser.name : currentAdmin.name;

  return (
    <div className="min-h-screen flex flex-col bg-paper-50">
      <SaveErrorBanner saveError={saveError} />
      {IS_SANDBOX && (
        <div className="bg-warn-500 text-white text-center text-[12px] font-semibold py-1.5 print:hidden">
          SANDBOX / TEST SITE — the Pack-out Kits feature is being tested here. Everything else shows live shop data.
        </div>
      )}
      <div className="flex-1 flex min-h-0">
      <aside className="w-48 lg:w-56 shrink-0 bg-ink-950 text-paper-100 flex flex-col print:hidden">
        <div className="px-5 py-5 flex items-center gap-2 border-b border-white/10">
          <div className="w-7 h-7 rounded-lg bg-brand-500 flex items-center justify-center font-bold text-sm">
            A
          </div>
          <div>
            <p className="text-sm font-bold leading-none">AssemblyOS</p>
            <p className="text-[10px] text-white/40 mt-0.5">{panelsOnlyConsole ? "Panels & Pack-outs" : "Production Console"}</p>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                  isActive
                    ? "bg-brand-500/15 text-white border border-brand-500/30"
                    : "text-white/60 hover:bg-white/5 hover:text-white"
                }`
              }
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {item.label}
              {item.sandbox && IS_SANDBOX && (
                <span className="ml-auto rounded bg-warn-500/20 text-warn-100 text-[9px] font-bold px-1.5 py-0.5">TEST</span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-white/10 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-brand-400 flex items-center justify-center text-xs font-bold shrink-0">
            {displayName.split(" ").map((n) => n[0]).join("")}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold truncate">{displayName}</p>
            <p className="text-[10px] text-white/40 truncate">{panelsOnlyConsole ? currentUser.role : "Production Manager"}</p>
          </div>
          <button
            onClick={panelsOnlyConsole ? logout : adminLogout}
            title="Log out"
            className="text-white/40 hover:text-white text-[11px] font-semibold shrink-0"
          >
            Log Out
          </button>
        </div>
        <Link
          to="/mobile"
          onClick={() => setViewPref("phone")}
          className="mx-3 mb-3 flex items-center justify-center gap-1.5 rounded-lg border border-white/10 py-2 text-[11px] font-semibold text-white/60 hover:text-white hover:bg-white/5"
        >
          <PhoneIcon className="w-3.5 h-3.5" /> {panelsOnlyConsole ? "Switch to phone view" : "View technician (mobile) app"}
        </Link>
      </aside>

      <main className="flex-1 min-w-0 overflow-y-auto">
        <Outlet />
      </main>
      </div>
    </div>
  );
}

// Sign-in for the desktop/tablet console. Managers use their username +
// password (AdminLogin); team members who've been given console access use the
// same username + PIN they use on their phone.
function DesktopSignIn() {
  const [mode, setMode] = useState("manager");
  if (mode === "manager") {
    return (
      <AdminLogin
        footer={
          <button onClick={() => setMode("team")} className="text-[12px] font-semibold text-brand-600 hover:text-brand-700">
            Team member? Sign in with your PIN →
          </button>
        }
      />
    );
  }
  return (
    <div className="min-h-screen bg-paper-50 flex items-center justify-center p-6">
      <div className="w-full max-w-[380px] bg-white rounded-2xl shadow-popover pb-5">
        <Login />
        <div className="text-center">
          <button onClick={() => setMode("manager")} className="text-[12px] font-semibold text-brand-600 hover:text-brand-700">
            ← Manager sign-in
          </button>
        </div>
      </div>
    </div>
  );
}

function NoConsoleAccess({ user, onLogout }) {
  return (
    <div className="min-h-screen bg-paper-50 flex items-center justify-center p-6">
      <div className="w-full max-w-[380px] bg-white rounded-2xl shadow-popover p-6 text-center">
        <h1 className="text-lg font-bold text-ink-900 mb-2">Hi {user.name.split(" ")[0]}</h1>
        <p className="text-sm text-ink-600 mb-5">
          Your account is set up for the phone app only. Ask a manager if you need the desktop view turned on.
        </p>
        <Link to="/mobile" onClick={() => setViewPref("phone")} className="block">
          <Button className="w-full py-2.5">Open the phone app</Button>
        </Link>
        <Button variant="ghost" className="w-full mt-2 py-2.5" onClick={onLogout}>
          Log Out
        </Button>
      </div>
    </div>
  );
}

function iconProps(props) {
  return { fill: "none", stroke: "currentColor", strokeWidth: 1.8, viewBox: "0 0 24 24", ...props };
}
function DashboardIcon(props) {
  return (
    <svg {...iconProps(props)}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </svg>
  );
}
function FloorStatusIcon(props) {
  return (
    <svg {...iconProps(props)}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
      <path d="M12 3.5v3M12 17.5v3M20.5 12h-3M6.5 12h-3" strokeLinecap="round" />
    </svg>
  );
}
function ReportsIcon(props) {
  return (
    <svg {...iconProps(props)}>
      <path d="M4 20V10M12 20V4M20 20v-7" strokeLinecap="round" />
    </svg>
  );
}
function PnlIcon(props) {
  return (
    <svg {...iconProps(props)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9 14.5c0 1.1 1.1 2 2.5 2h1c1.4 0 2.5-.9 2.5-2s-1.1-1.8-2.5-2-2.5-.7-2.5-1.8 1.1-2 2.5-2h1c1.4 0 2.5.9 2.5 2M12 6.5v1M12 16.5v1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function CapacityIcon(props) {
  return (
    <svg {...iconProps(props)}>
      <path d="M4 20V10M12 20V4M20 20v-7" strokeLinecap="round" />
      <path d="M3 4.5 12 4M17 2.5l3 1.5-1.5 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function KitsIcon(props) {
  return (
    <svg {...iconProps(props)}>
      <path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5z" strokeLinejoin="round" />
      <path d="m8.5 12 2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function PackoutIssuesIcon(props) {
  return (
    <svg {...iconProps(props)}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 8.5h5M8 12h8M8 15.5h5" strokeLinecap="round" />
      <path d="M15.5 15.5 17.3 17.3M17.3 14.2a2.1 2.1 0 1 1-4.2 0 2.1 2.1 0 0 1 4.2 0Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function TeamIcon(props) {
  return (
    <svg {...iconProps(props)}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5" strokeLinecap="round" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M15.5 14.3c2.4.3 4 2.2 4 5.2" strokeLinecap="round" />
    </svg>
  );
}
function PanelsIcon(props) {
  return (
    <svg {...iconProps(props)}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="1.5" />
      <path d="M8 3.5v17M14 3.5v17M3.5 9.5h17M3.5 15h17" />
    </svg>
  );
}
function PayrollIcon(props) {
  return (
    <svg {...iconProps(props)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v10M9.5 9.5c0-1.1 1.1-2 2.5-2s2.5.7 2.5 1.8-1 1.7-2.5 2-2.5.9-2.5 2 1.1 1.8 2.5 1.8 2.5-.9 2.5-2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function SessionLogIcon(props) {
  return (
    <svg {...iconProps(props)}>
      <path d="M6 3.5h12a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
      <path d="M8.5 8h7M8.5 11.5h7M8.5 15h4.5" strokeLinecap="round" />
    </svg>
  );
}
function LeaderboardIcon(props) {
  return (
    <svg {...iconProps(props)}>
      <path d="M8 20v-6.5M12 20V4M16 20v-9.5" strokeLinecap="round" />
      <path d="M6 13.5h4M10 4h4M14 10.5h4" strokeLinecap="round" />
    </svg>
  );
}
function EstimatesIcon(props) {
  return (
    <svg {...iconProps(props)}>
      <path d="M6 3.5h9l3 3V20a.5.5 0 0 1-.5.5h-11A.5.5 0 0 1 6 20V4a.5.5 0 0 1 .5-.5Z" />
      <path d="M9 12.5h6M9 16h4" strokeLinecap="round" />
      <path d="M9 9h1" strokeLinecap="round" />
    </svg>
  );
}
function PhoneIcon(props) {
  return (
    <svg {...iconProps(props)}>
      <rect x="7" y="2.5" width="10" height="19" rx="2" />
      <path d="M11 18h2" strokeLinecap="round" />
    </svg>
  );
}
function GetAppIcon(props) {
  return (
    <svg {...iconProps(props)}>
      <rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1" />
      <rect x="14" y="3.5" width="6.5" height="6.5" rx="1" />
      <rect x="3.5" y="14" width="6.5" height="6.5" rx="1" />
      <path d="M14 15.5h2.5M17.5 14v5M20.5 15.5h-2" strokeLinecap="round" />
    </svg>
  );
}
