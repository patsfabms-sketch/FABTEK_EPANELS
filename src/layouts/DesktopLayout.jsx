import { NavLink, Outlet, Link } from "react-router-dom";
import { useApp } from "../context/AppContext";
import AdminLogin from "../pages/desktop/AdminLogin";
import { SaveErrorBanner, LoadingScreen } from "../components/ui";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: DashboardIcon },
  { to: "/panels", label: "Panels", icon: PanelsIcon },
  { to: "/reports", label: "Reports", icon: ReportsIcon },
  { to: "/goals", label: "Goals", icon: GoalsIcon },
  { to: "/team", label: "Team", icon: TeamIcon },
  { to: "/estimates", label: "Estimates", icon: EstimatesIcon },
  { to: "/get-app", label: "Get the App", icon: GetAppIcon },
];

export default function DesktopLayout() {
  const { currentAdmin, adminLogout, saveError, ready } = useApp();

  if (!ready) return <LoadingScreen />;
  if (!currentAdmin) return <AdminLogin />;

  return (
    <div className="min-h-screen flex flex-col bg-paper-50">
      <SaveErrorBanner saveError={saveError} />
      <div className="flex-1 flex min-h-0">
      <aside className="w-56 shrink-0 bg-ink-950 text-paper-100 flex flex-col">
        <div className="px-5 py-5 flex items-center gap-2 border-b border-white/10">
          <div className="w-7 h-7 rounded-lg bg-brand-500 flex items-center justify-center font-bold text-sm">
            A
          </div>
          <div>
            <p className="text-sm font-bold leading-none">AssemblyOS</p>
            <p className="text-[10px] text-white/40 mt-0.5">Production Console</p>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map((item) => (
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
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-white/10 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-brand-400 flex items-center justify-center text-xs font-bold shrink-0">
            {currentAdmin.name.split(" ").map((n) => n[0]).join("")}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold truncate">{currentAdmin.name}</p>
            <p className="text-[10px] text-white/40 truncate">Production Manager</p>
          </div>
          <button
            onClick={adminLogout}
            title="Log out"
            className="text-white/40 hover:text-white text-[11px] font-semibold shrink-0"
          >
            Log Out
          </button>
        </div>
        <Link
          to="/mobile"
          className="mx-3 mb-3 flex items-center justify-center gap-1.5 rounded-lg border border-white/10 py-2 text-[11px] font-semibold text-white/60 hover:text-white hover:bg-white/5"
        >
          <PhoneIcon className="w-3.5 h-3.5" /> View technician (mobile) app
        </Link>
      </aside>

      <main className="flex-1 min-w-0 overflow-y-auto">
        <Outlet />
      </main>
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
function ReportsIcon(props) {
  return (
    <svg {...iconProps(props)}>
      <path d="M4 20V10M12 20V4M20 20v-7" strokeLinecap="round" />
    </svg>
  );
}
function GoalsIcon(props) {
  return (
    <svg {...iconProps(props)}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.6" fill="currentColor" />
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
