# AssemblyOS — Production Console

A React implementation of the assembly-line goal-tracking Figma design, built with real interactive logic (not just static visuals).

## Run it

```bash
npm install
npm run dev
```

Then open the printed localhost URL. Use the "View technician (mobile) app" link in the sidebar (or go to `/#/mobile`) to see the mobile flow.

## What's real vs. mock

- **Real logic:** goal attainment % is computed live from each technician's current-week average vs. their custom override (or the team default) — editing an override and hitting **Apply Changes** recalculates attainment immediately. The mobile work session has a real running timer, an incrementable/decrementable connection counter with a numeric-entry keypad, and stopping a session writes a new row into Work History. Log Work submissions also append to history. Reports/Team page filters, search, and sorting all operate on live state.
- **Persistence:** all state (goal overrides, work history, active session) is saved to `localStorage`, so it survives a page reload. There's no backend — swap the functions in `src/context/AppContext.jsx` for real API calls when you're ready to connect one.
- **Mock data:** `src/data/mockData.js` holds the starting roster, role defaults, and a 30-day output generator for the charts. Replace this with real data fetching.

## Structure

```
src/
  data/mockData.js        # seed data + calculation helpers
  context/AppContext.jsx  # app state, all "business logic"
  components/ui.jsx       # shared building blocks (cards, badges, buttons)
  layouts/                # desktop sidebar shell, mobile phone-frame shell
  pages/desktop/           Dashboard, Reports, Goals, Team
  pages/mobile/             Home, ActiveSession, LogWork, History, Profile
```

Stack: React 19 + Vite, React Router (HashRouter), Tailwind CSS, Recharts.
