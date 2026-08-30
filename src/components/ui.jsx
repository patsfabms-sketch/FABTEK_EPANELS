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

export function formatNumber(n) {
  return new Intl.NumberFormat("en-US").format(Math.round(n));
}

export function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
