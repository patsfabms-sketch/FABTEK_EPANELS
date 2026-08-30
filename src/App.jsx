import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppProvider } from "./context/AppContext";
import DesktopLayout from "./layouts/DesktopLayout";
import MobileLayout from "./layouts/MobileLayout";
import Dashboard from "./pages/desktop/Dashboard";
import Reports from "./pages/desktop/Reports";
import Goals from "./pages/desktop/Goals";
import Team from "./pages/desktop/Team";
import Estimates from "./pages/desktop/Estimates";
import EmployeeDetail from "./pages/desktop/EmployeeDetail";
import Panels from "./pages/desktop/Panels";
import Home from "./pages/mobile/Home";
import ActiveSession from "./pages/mobile/ActiveSession";
import History from "./pages/mobile/History";
import Profile from "./pages/mobile/Profile";

export default function App() {
  return (
    <AppProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          <Route element={<DesktopLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/goals" element={<Goals />} />
            <Route path="/team" element={<Team />} />
            <Route path="/team/:id" element={<EmployeeDetail />} />
            <Route path="/estimates" element={<Estimates />} />
            <Route path="/panels" element={<Panels />} />
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
