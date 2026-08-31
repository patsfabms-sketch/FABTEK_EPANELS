import { useEffect } from "react";
import { ROLE_META } from "../data/mockData";

export function Card({ children, className = "", padded = true, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl2 border border-paper-200 shadow-card ${
        padded ? "p-5" : ""
      } ${onClick ? "cursor-pointer hover:border-brand-300 transition-colors" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

// Generic centered dialog: backdrop click and Escape both close it. Stacks
// fine (a Modal can open another Modal — the print-settings dialog on top of
// the panel-detail dialog does exactly this).
export function Modal({ onClose, children, widthClass = "max-w-lg" }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className={`w-full ${widthClass} max-h-[90vh] overflow-y-auto bg-white rounded-xl2 shadow-popover p-6`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export function SectionTitle({ title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div>
        <h2 className="text-[15px] font-semibold text-ink-900">{title}</h2>
        {subtitle && <p className="text-xs text-ink-500 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function RoleBadge({ role }) {
  const meta = ROLE_META[role];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.bg} ${meta.color}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
      {role}
    </span>
  );
}

export function AttainmentPill({ pct }) {
  const tone =
    pct >= 100 ? "good" : pct >= 90 ? "warn" : "bad";
  const styles = {
    good: "bg-good-50 text-good-600",
    warn: "bg-warn-50 text-warn-600",
    bad: "bg-bad-50 text-bad-600",
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${styles[tone]}`}>
      {pct}%
    </span>
  );
}

export function StatCard({ label, value, sub, accent = "text-ink-900" }) {
  return (
    <Card className="flex-1 min-w-[160px]">
      <p className="text-xs font-medium text-ink-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${accent}`}>{value}</p>
      {sub && <p className="text-[11px] text-ink-500 mt-1">{sub}</p>}
    </Card>
  );
}

export function Button({ children, variant = "primary", className = "", ...props }) {
  const variants = {
    primary: "bg-brand-500 text-white hover:bg-brand-600",
    danger: "bg-bad-500 text-white hover:bg-bad-600",
    ghost: "bg-transparent text-ink-700 hover:bg-paper-100 border border-paper-200",
    subtle: "bg-paper-100 text-ink-700 hover:bg-paper-200",
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

// Shown whenever AppContext can't reach the shared AssemblyOS backend
// (Supabase) — either the initial load or a subsequent read/write failed.
// A failure here used to be swallowed silently back when this was just a
// localStorage write; now it means changes on this device may not be
// visible to anyone else until connectivity is back. Both the desktop and
// mobile layout mount this so it's visible no matter where the failure
// happens.
export function SaveErrorBanner({ saveError }) {
  if (!saveError) return null;
  return (
    <div className="bg-bad-500 text-white text-[12px] font-semibold px-4 py-2 text-center shrink-0 print:hidden">
      Can't reach the AssemblyOS server — check your internet connection. Changes made now may not save or show up
      on other devices until it's back.
    </div>
  );
}

// Shown while AppContext's initial fetch from the shared backend is still
// in flight. Without this, a device that's already signed in would flash
// the login screen for a moment (currentAdmin/currentUser both start out
// unresolved until the roster has actually loaded) before landing on the
// right screen.
//
// `connectionFailed` covers the case that used to look identical to being
// logged out: the initial fetch failed (bad wifi, e.g. on the shop floor)
// and AppContext is retrying it in the background — see the "Initial load"
// effect in AppContext.jsx. `ready` stays false the whole time, so this
// screen (never the Login/AdminLogin screen) is what shows until it
// recovers, for a device that's already signed in and one that isn't alike.
export function LoadingScreen({ connectionFailed = false, onRetry } = {}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-paper-50 px-6 text-center">
      <div className="w-10 h-10 rounded-xl bg-brand-500 text-white flex items-center justify-center font-bold text-lg animate-pulse">
        A
      </div>
      {connectionFailed ? (
        <>
          <p className="text-xs font-semibold text-bad-600">Can't reach the AssemblyOS server</p>
          <p className="text-[11px] text-ink-400 max-w-[240px]">
            Check the connection here — this will move on by itself as soon as it's back, or try again now.
          </p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-1 text-[11px] font-semibold text-brand-600 hover:text-brand-700"
            >
              Retry now
            </button>
          )}
        </>
      ) : (
        <p className="text-xs text-ink-400">Loading AssemblyOS…</p>
      )}
    </div>
  );
}

export function formatNumber(n) {
  return new Intl.NumberFormat("en-US").format(Math.round(n));
}

export function formatCurrency(n) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);
}

export function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
