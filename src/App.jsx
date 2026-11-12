import { lazy, Suspense } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppProvider, useApp } from "./context/AppContext";
import { LoadingScreen } from "./components/ui";
import { getViewPref, defaultViewForScreen } from "./data/viewPref";
import DesktopLayout from "./layouts/DesktopLayout";
import MobileLayout from "./layouts/MobileLayout";
import Dashboard from "./pages/desktop/Dashboard";
import FloorStatus from "./pages/desktop/FloorStatus";
import Reports from "./pages/desktop/Reports";
import Team from "./pages/desktop/Team";
import Payroll from "./pages/desktop/Payroll";
import ProfitAndLoss from "./pages/desktop/ProfitAndLoss";
import CapacityReport from "./pages/desktop/CapacityReport";
import PackoutIssues from "./pages/desktop/PackoutIssues";
import Estimates from "./pages/desktop/Estimates";
import EmployeeDetail from "./pages/desktop/EmployeeDetail";
import SessionLog from "./pages/desktop/SessionLog";
import Leaderboard from "./pages/desktop/Leaderboard";
import Panels from "./pages/desktop/Panels";
import GetApp from "./pages/desktop/GetApp";
// Kit pages pull in zip/PDF libraries — load them only when opened so the
// main bundle (and every phone's startup) stays the same size.
const Kits = lazy(() => import("./pages/desktop/Kits"));
const KitCheck = lazy(() => import("./pages/desktop/KitCheck"));
const kitFallback = <p className="p-8 text-sm text-ink-500">Loading…</p>;
import Home from "./pages/mobile/Home";
import ActiveSession from "./pages/mobile/ActiveSession";
import History from "./pages/mobile/History";
import Profile from "./pages/mobile/Profile";

// "/" lands managers on the Dashboard as always. Someone with panels-only
// console access goes to whichever view they used last on this device (phone
// app or desktop), or — if they haven't picked yet — the one that fits the
// screen: tablet/computer-sized gets the desktop view, phone-sized the phone app.
function HomeRedirect() {
  const { ready, panelsOnlyConsole } = useApp();
  if (!ready) return <LoadingScreen />;
  if (panelsOnlyConsole) {
    const view = getViewPref() ?? defaultViewForScreen();
    return <Navigate to={view === "phone" ? "/mobile" : "/kits"} replace />;
  }
  return <Navigate to="/dashboard" replace />;
}

export default function App() {
  return (
    <AppProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<HomeRedirect />} />

          <Route element={<DesktopLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/floor-status" element={<FloorStatus />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/team" element={<Team />} />
            <Route path="/team/:id" element={<EmployeeDetail />} />
            <Route path="/payroll" element={<Payroll />} />
            <Route path="/pnl" element={<ProfitAndLoss />} />
            <Route path="/capacity-report" element={<CapacityReport />} />
            <Route path="/packout-issues" element={<PackoutIssues />} />
            <Route path="/sessions" element={<SessionLog />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/estimates" element={<Estimates />} />
            <Route path="/panels" element={<Panels />} />
            <Route path="/kits" element={<Suspense fallback={kitFallback}><Kits /></Suspense>} />
            <Route path="/kit/:buildId" element={<Suspense fallback={kitFallback}><KitCheck /></Suspense>} />
            <Route path="/get-app" element={<GetApp />} />
          </Route>

          <Route element={<MobileLayout />}>
            <Route path="/mobile" element={<Home />} />
            <Route path="/mobile/session" element={<ActiveSession />} />
            <Route path="/mobile/history" element={<History />} />
            <Route path="/mobile/profile" element={<Profile />} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </HashRouter>
    </AppProvider>
  );
}
