import { useState } from "react";
import { useApp } from "../../context/AppContext";
import { Button } from "../../components/ui";

const STEPS = {
  USERNAME: "username",
  PASSWORD: "password",
  SET_PASSWORD: "set-password",
};

const SERVER_ERROR = "Can't reach the server. Check your connection and try again.";

// Every step here round-trips to the shared backend now (a real network
// call, not an in-memory lookup) — `busy` guards each submit against
// double-clicks/double-Enter while that's in flight.
export default function AdminLogin() {
  const { checkAdminUsername, adminLogin, setAdminPasswordAndLogin } = useApp();
  const [step, setStep] = useState(STEPS.USERNAME);
  const [username, setUsername] = useState("");
  const [pendingAdminId, setPendingAdminId] = useState(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submitUsername() {
    if (busy) return;
    if (!username.trim()) {
      setError("Enter your username.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await checkAdminUsername(username);
      if (result.serverError) {
        setError(SERVER_ERROR);
        return;
      }
      if (!result.found) {
        setError("Username not found.");
        return;
      }
      setPassword("");
      setConfirmPassword("");
      if (result.needsSetup) {
        setPendingAdminId(result.adminId);
        setStep(STEPS.SET_PASSWORD);
      } else {
        setStep(STEPS.PASSWORD);
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitPassword() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await adminLogin(username, password);
      if (!result.ok) {
        setError(result.error ?? "Incorrect password.");
        setPassword("");
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitNewPassword() {
    if (busy) return;
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords didn't match — try again.");
      setPassword("");
      setConfirmPassword("");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await setAdminPasswordAndLogin(pendingAdminId, password);
      if (!result.ok) {
        setError(result.error ?? SERVER_ERROR);
        setPassword("");
        setConfirmPassword("");
      }
    } finally {
      setBusy(false);
    }
  }

  function goBack() {
    setStep(STEPS.USERNAME);
    setPassword("");
    setConfirmPassword("");
    setError("");
  }

  return (
    <div className="min-h-screen bg-paper-50 flex items-center justify-center p-6">
      <div className="w-full max-w-[360px] bg-white rounded-2xl shadow-popover p-6">
        <div className="w-12 h-12 rounded-xl bg-brand-500 text-white flex items-center justify-center font-bold text-lg mb-4">
          A
        </div>
        <h1 className="text-lg font-bold text-ink-900 mb-1">AssemblyOS</h1>
        <p className="text-xs text-ink-500 mb-6">Sign in to the production manager console</p>

        {step === STEPS.USERNAME && (
          <div>
            <label className="text-xs font-semibold text-ink-500">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitUsername()}
              placeholder="e.g. Pwarren"
              autoCapitalize="none"
              autoFocus
              disabled={busy}
              className="mt-1 w-full rounded-lg border border-paper-200 px-3 py-2.5 text-sm disabled:opacity-60"
            />
            {error && <p className="text-[11px] text-bad-600 mt-2">{error}</p>}
            <Button className="w-full mt-4 py-2.5" onClick={submitUsername} disabled={busy}>
              {busy ? "Checking…" : "Continue"}
            </Button>
          </div>
        )}

        {step === STEPS.PASSWORD && (
          <div>
            <button onClick={goBack} disabled={busy} className="text-[11px] font-semibold text-brand-600 mb-3 disabled:opacity-50">
              ← Back
            </button>
            <label className="text-xs font-semibold text-ink-500">Password for @{username}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitPassword()}
              autoFocus
              disabled={busy}
              className="mt-1 w-full rounded-lg border border-paper-200 px-3 py-2.5 text-sm disabled:opacity-60"
            />
            {error && <p className="text-[11px] text-bad-600 mt-2">{error}</p>}
            <Button className="w-full mt-4 py-2.5" onClick={submitPassword} disabled={busy}>
              {busy ? "Signing in…" : "Log In"}
            </Button>
          </div>
        )}

        {step === STEPS.SET_PASSWORD && (
          <div>
            <button onClick={goBack} disabled={busy} className="text-[11px] font-semibold text-brand-600 mb-3 disabled:opacity-50">
              ← Back
            </button>
            <p className="text-[11px] text-ink-500 mb-3">
              First time logging in as @{username} — set the password you'll use going forward.
            </p>
            <label className="text-xs font-semibold text-ink-500">New password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              disabled={busy}
              className="mt-1 w-full rounded-lg border border-paper-200 px-3 py-2.5 text-sm disabled:opacity-60"
            />
            <label className="text-xs font-semibold text-ink-500 mt-3 block">Confirm password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitNewPassword()}
              disabled={busy}
              className="mt-1 w-full rounded-lg border border-paper-200 px-3 py-2.5 text-sm disabled:opacity-60"
            />
            {error && <p className="text-[11px] text-bad-600 mt-2">{error}</p>}
            <Button className="w-full mt-4 py-2.5" onClick={submitNewPassword} disabled={busy}>
              {busy ? "Saving…" : "Set Password & Log In"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
