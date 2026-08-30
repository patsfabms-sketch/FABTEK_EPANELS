import { useEffect, useState } from "react";
import { useApp } from "../../context/AppContext";
import { Button } from "../../components/ui";

const STEPS = {
  USERNAME: "username",
  PIN: "pin",
  SET_PIN: "set-pin",
  CONFIRM_PIN: "confirm-pin",
  ADMIN_PASSWORD: "admin-password",
  ADMIN_SET_PASSWORD: "admin-set-password",
};

// A username here can belong to either a technician (PIN login) or an admin
// (password login, same credentials as the desktop manager console) — see
// AppContext's checkUsername/checkAdminUsername. Trying the technician
// roster first keeps the common case (a technician's own name also being a
// substring match for nobody else) simple; falling back to the admin roster
// is what lets a manager sign into the mobile app too.
export default function Login() {
  const {
    checkUsername,
    login,
    setPinAndLogin,
    checkAdminUsername,
    adminLogin,
    setAdminPasswordAndLogin,
  } = useApp();
  const [step, setStep] = useState(STEPS.USERNAME);
  const [username, setUsername] = useState("");
  const [pendingEmployeeId, setPendingEmployeeId] = useState(null);
  const [pendingAdminId, setPendingAdminId] = useState(null);
  const [pin, setPin] = useState("");
  const [firstPin, setFirstPin] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");

  function submitUsername() {
    if (!username.trim()) {
      setError("Enter your username.");
      return;
    }
    const empResult = checkUsername(username);
    if (empResult.found) {
      setError("");
      if (empResult.needsSetup) {
        setPendingEmployeeId(empResult.employeeId);
        setStep(STEPS.SET_PIN);
      } else {
        setStep(STEPS.PIN);
      }
      return;
    }

    const adminResult = checkAdminUsername(username);
    if (adminResult.found) {
      setError("");
      setPassword("");
      setConfirmPassword("");
      if (adminResult.needsSetup) {
        setPendingAdminId(adminResult.adminId);
        setStep(STEPS.ADMIN_SET_PASSWORD);
      } else {
        setStep(STEPS.ADMIN_PASSWORD);
      }
      return;
    }

    setError("Username not found.");
  }

  function pressDigit(d) {
    if (step === STEPS.PIN && pin.length < 4) setPin((p) => p + d);
    if (step === STEPS.SET_PIN && firstPin.length < 4) setFirstPin((p) => p + d);
    if (step === STEPS.CONFIRM_PIN && pin.length < 4) setPin((p) => p + d);
  }

  function backspace() {
    if (step === STEPS.PIN) setPin((p) => p.slice(0, -1));
    if (step === STEPS.SET_PIN) setFirstPin((p) => p.slice(0, -1));
    if (step === STEPS.CONFIRM_PIN) setPin((p) => p.slice(0, -1));
  }

  function submitPin() {
    const result = login(username, pin);
    if (!result.ok) {
      setError(result.error ?? "Incorrect PIN.");
      setPin("");
      return;
    }
    setError("");
  }

  function proceedToConfirm() {
    if (firstPin.length !== 4) return;
    setError("");
    setPin("");
    setStep(STEPS.CONFIRM_PIN);
  }

  function confirmNewPin() {
    if (pin !== firstPin) {
      setError("PINs didn't match — try again.");
      setPin("");
      setFirstPin("");
      setStep(STEPS.SET_PIN);
      return;
    }
    setPinAndLogin(pendingEmployeeId, pin);
  }

  function submitAdminPassword() {
    const result = adminLogin(username, password);
    if (!result.ok) {
      setError(result.error ?? "Incorrect password.");
      setPassword("");
      return;
    }
    setError("");
  }

  function submitAdminNewPassword() {
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
    setError("");
    setAdminPasswordAndLogin(pendingAdminId, password);
  }

  function goBackToUsername() {
    setStep(STEPS.USERNAME);
    setPin("");
    setFirstPin("");
    setPassword("");
    setConfirmPassword("");
    setError("");
  }

  // Auto-advance once 4 digits are entered. Runs as an effect (not directly
  // in the render body) since these call into AppContext, which updates a
  // different component's state — doing that synchronously during render is
  // invalid in React and can cascade into a "too many re-renders" loop.
  useEffect(() => {
    if (step === STEPS.PIN && pin.length === 4) submitPin();
    if (step === STEPS.CONFIRM_PIN && pin.length === 4) confirmNewPin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, step]);

  useEffect(() => {
    if (step === STEPS.SET_PIN && firstPin.length === 4) proceedToConfirm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstPin, step]);

  const activeDigits = step === STEPS.SET_PIN ? firstPin : pin;

  return (
    <div className="p-5 flex flex-col items-center pt-16">
      <div className="w-14 h-14 rounded-2xl bg-brand-500 text-white flex items-center justify-center font-bold text-xl mb-4">
        A
      </div>
      <h1 className="text-lg font-bold text-ink-900 mb-1">AssemblyOS</h1>
      <p className="text-xs text-ink-500 mb-8">Sign in to log your work</p>

      {step === STEPS.USERNAME && (
        <div className="w-full">
          <label className="text-xs font-semibold text-ink-500">Username</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitUsername()}
            placeholder="e.g. mvance"
            autoCapitalize="none"
            className="mt-1 w-full rounded-lg border border-paper-200 px-3 py-2.5 text-sm"
          />
          {error && <p className="text-[11px] text-bad-600 mt-2">{error}</p>}
          <Button className="w-full mt-4 py-3" onClick={submitUsername}>
            Continue
          </Button>
        </div>
      )}

      {(step === STEPS.PIN || step === STEPS.SET_PIN || step === STEPS.CONFIRM_PIN) && (
        <div className="w-full flex flex-col items-center">
          <p className="text-sm font-semibold text-ink-900 mb-1">
            {step === STEPS.PIN && `Enter PIN for @${username}`}
            {step === STEPS.SET_PIN && "Set a 4-digit PIN"}
            {step === STEPS.CONFIRM_PIN && "Confirm your PIN"}
          </p>
          <p className="text-[11px] text-ink-500 mb-5">
            {step === STEPS.SET_PIN && "This is the first time logging in — choose a PIN you'll use going forward."}
            {step === STEPS.CONFIRM_PIN && "Enter the same 4 digits again."}
            {step === STEPS.PIN && "Enter your 4-digit PIN."}
          </p>

          <div className="flex gap-3 mb-6">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`w-4 h-4 rounded-full border-2 ${
                  activeDigits.length > i ? "bg-brand-500 border-brand-500" : "border-paper-300"
                }`}
              />
            ))}
          </div>

          {error && <p className="text-[11px] text-bad-600 mb-3">{error}</p>}

          <div className="grid grid-cols-3 gap-3 w-full max-w-[260px]">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
              <button
                key={d}
                onClick={() => pressDigit(String(d))}
                className="rounded-full aspect-square bg-paper-100 text-lg font-semibold text-ink-900 active:bg-paper-200"
              >
                {d}
              </button>
            ))}
            <button onClick={goBackToUsername} className="rounded-full aspect-square text-xs font-semibold text-ink-400">
              Back
            </button>
            <button
              onClick={() => pressDigit("0")}
              className="rounded-full aspect-square bg-paper-100 text-lg font-semibold text-ink-900 active:bg-paper-200"
            >
              0
            </button>
            <button onClick={backspace} className="rounded-full aspect-square text-sm font-semibold text-ink-400">
              ⌫
            </button>
          </div>
        </div>
      )}

      {step === STEPS.ADMIN_PASSWORD && (
        <div className="w-full">
          <button onClick={goBackToUsername} className="block text-[11px] font-semibold text-brand-600 mb-3">
            ← Back
          </button>
          <label className="text-xs font-semibold text-ink-500">Password for @{username}</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitAdminPassword()}
            autoFocus
            className="mt-1 w-full rounded-lg border border-paper-200 px-3 py-2.5 text-sm"
          />
          {error && <p className="text-[11px] text-bad-600 mt-2">{error}</p>}
          <Button className="w-full mt-4 py-3" onClick={submitAdminPassword}>
            Log In
          </Button>
        </div>
      )}

      {step === STEPS.ADMIN_SET_PASSWORD && (
        <div className="w-full">
          <button onClick={goBackToUsername} className="block text-[11px] font-semibold text-brand-600 mb-3">
            ← Back
          </button>
          <p className="text-[11px] text-ink-500 mb-3">
            First time logging in as @{username} — set the password you'll use going forward. (Same login
            works on the desktop manager console.)
          </p>
          <label className="text-xs font-semibold text-ink-500">New password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            className="mt-1 w-full rounded-lg border border-paper-200 px-3 py-2.5 text-sm"
          />
          <label className="text-xs font-semibold text-ink-500 mt-3 block">Confirm password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitAdminNewPassword()}
            className="mt-1 w-full rounded-lg border border-paper-200 px-3 py-2.5 text-sm"
          />
          {error && <p className="text-[11px] text-bad-600 mt-2">{error}</p>}
          <Button className="w-full mt-4 py-3" onClick={submitAdminNewPassword}>
            Set Password &amp; Log In
          </Button>
        </div>
      )}
    </div>
  );
}
