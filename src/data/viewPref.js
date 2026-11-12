// Remembers, per device, whether someone who can use both the phone app and the
// desktop/tablet console last chose the "desktop" or "phone" view, so the app
// opens in the one they were using. Stored in this browser only (an iPad and a
// phone each remember their own choice). Everything is wrapped in try/catch:
// storage can be unavailable (private mode, blocked site data) and the app must
// work the same without it.
const KEY = "assemblyos-view-pref";

export function getViewPref() {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "desktop" || v === "phone" ? v : null;
  } catch {
    return null;
  }
}

export function setViewPref(v) {
  try {
    if (v === "desktop" || v === "phone") window.localStorage.setItem(KEY, v);
  } catch {
    /* ignore */
  }
}

// Where "/" should land for someone with panels-only console access and no
// saved choice yet: a tablet or computer-sized screen gets the desktop view, a
// phone-sized one gets the phone app.
export function defaultViewForScreen() {
  try {
    return window.innerWidth >= 768 ? "desktop" : "phone";
  } catch {
    return "desktop";
  }
}
