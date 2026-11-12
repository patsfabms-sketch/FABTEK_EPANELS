import { useMemo, useState } from "react";
import { useApp } from "../context/AppContext";
import {
  normalizeGeofence,
  recentClockPoints,
  recommendGeofenceCenter,
  geofenceCoverage,
} from "../data/mockData";
import { Button, Modal, formatNumber } from "./ui";

// Manager tool for the Clock QR location check: where "the shop" is and how
// close someone has to be for a clock-in/out to count as on-site. Scans from
// outside are still allowed — they just get flagged for review (see
// evaluateClockLocation in mockData.js).
//
// The calibration panel shows, for whatever center + radius is typed in, how
// the real scans from the last 60 days would have been judged — so "tighter"
// can be tried out against actual data before saving, instead of guessed at.
const RADIUS_PRESETS = [100, 150, 200, 300, 500];
const CALIBRATION_DAYS = 60;

export default function ClockLocationModal({ onClose }) {
  const { clockGeofence, updateClockGeofence, clockLog } = useApp();
  const [lat, setLat] = useState(String(clockGeofence.lat));
  const [lng, setLng] = useState(String(clockGeofence.lng));
  const [radius, setRadius] = useState(String(clockGeofence.radiusFt));
  const [gpsStatus, setGpsStatus] = useState("");
  const [gpsBusy, setGpsBusy] = useState(false);

  const points = useMemo(() => recentClockPoints(clockLog, { days: CALIBRATION_DAYS }), [clockLog]);
  const recommended = useMemo(() => recommendGeofenceCenter(points), [points]);

  const latNum = Number(lat);
  const lngNum = Number(lng);
  const radiusNum = Number(radius);
  const valid =
    lat.trim() !== "" &&
    lng.trim() !== "" &&
    Number.isFinite(latNum) &&
    Number.isFinite(lngNum) &&
    Math.abs(latNum) <= 90 &&
    Math.abs(lngNum) <= 180 &&
    Number.isFinite(radiusNum) &&
    radiusNum >= 25 &&
    radiusNum <= 5000;

  const draft = valid ? normalizeGeofence({ lat: latNum, lng: lngNum, radiusFt: radiusNum }) : null;
  const coverage = useMemo(() => (draft ? geofenceCoverage(points, draft) : null), [draft, points]);
  const changed =
    draft &&
    (draft.lat !== clockGeofence.lat || draft.lng !== clockGeofence.lng || draft.radiusFt !== clockGeofence.radiusFt);

  function useRecommended() {
    if (!recommended) return;
    setLat(String(recommended.lat));
    setLng(String(recommended.lng));
  }

  function useThisDevice() {
    if (!("geolocation" in navigator)) {
      setGpsStatus("This device can't share its location.");
      return;
    }
    setGpsBusy(true);
    setGpsStatus("Getting a fix…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(7));
        setLng(pos.coords.longitude.toFixed(7));
        setGpsStatus(`Using this device's location (accurate to about ${Math.round(pos.coords.accuracy * 3.281)} ft).`);
        setGpsBusy(false);
      },
      () => {
        setGpsStatus("Couldn't get a location — allow location access for this site and try again.");
        setGpsBusy(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  function save() {
    if (!draft) return;
    updateClockGeofence(draft);
    onClose();
  }

  return (
    <Modal onClose={onClose} widthClass="max-w-[520px]">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-ink-900">Clock-in location</h3>
        <button onClick={onClose} className="text-ink-400 text-lg leading-none">
          ×
        </button>
      </div>
      <p className="text-[12px] text-ink-500 mb-4">
        A clock-in or clock-out counts as on-site when the phone's GPS is within this distance of the center point.
        Scans outside it still go through, but are flagged for a manager to review.
      </p>

      <div className="grid grid-cols-2 gap-3 mb-2">
        <label className="block">
          <span className="text-xs font-semibold text-ink-500">Center latitude</span>
          <input
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            inputMode="decimal"
            className="mt-1 w-full rounded-lg border border-paper-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-ink-500">Center longitude</span>
          <input
            value={lng}
            onChange={(e) => setLng(e.target.value)}
            inputMode="decimal"
            className="mt-1 w-full rounded-lg border border-paper-200 px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2 mb-1">
        <Button variant="ghost" onClick={useRecommended} disabled={!recommended}>
          Re-center on where people actually clock in
        </Button>
        <Button variant="ghost" onClick={useThisDevice} disabled={gpsBusy}>
          Use this device's location
        </Button>
      </div>
      <p className="text-[11px] text-ink-400 mb-1">
        {recommended
          ? `The first button uses the middle of ${formatNumber(recommended.pointsUsed)} real scans from the last ${CALIBRATION_DAYS} days${
              recommended.pointsIgnored ? ` (ignoring ${recommended.pointsIgnored} far-off ones)` : ""
            }. The second is best from a phone standing at the spot you want as the center.`
          : "Not enough recent scans with a location yet to suggest a center."}
      </p>
      {gpsStatus && <p className="text-[11px] text-ink-600 mb-1">{gpsStatus}</p>}
      {valid && (
        <a
          href={`https://www.google.com/maps/@${latNum},${lngNum},19z/data=!3m1!1e3`}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] font-semibold text-brand-600 hover:text-brand-700"
        >
          Check this point on a satellite map ↗
        </a>
      )}

      <label className="block mt-4 mb-2">
        <span className="text-xs font-semibold text-ink-500">How close (feet from the center)</span>
        <input
          type="number"
          min="25"
          max="5000"
          step="25"
          value={radius}
          onChange={(e) => setRadius(e.target.value)}
          className="mt-1 w-32 rounded-lg border border-paper-200 px-3 py-2 text-sm"
        />
      </label>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {RADIUS_PRESETS.map((r) => (
          <button
            key={r}
            onClick={() => setRadius(String(r))}
            className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
              Number(radius) === r
                ? "bg-brand-500 text-white border-brand-500"
                : "bg-white text-ink-600 border-paper-200 hover:border-brand-300"
            }`}
          >
            {r} ft
          </button>
        ))}
      </div>

      <div className="rounded-lg bg-paper-50 border border-paper-200 px-3 py-2.5 mb-4 text-[12px] text-ink-700">
        {!valid ? (
          <span className="text-bad-600">Enter a valid latitude, longitude and a distance between 25 and 5,000 feet.</span>
        ) : coverage.total === 0 ? (
          <span>No scans with a location in the last {CALIBRATION_DAYS} days to compare against yet.</span>
        ) : (
          <>
            <p className="font-semibold text-ink-900">
              {coverage.pct.toFixed(1)}% of the last {CALIBRATION_DAYS} days' scans would count as on-site
              <span className="font-normal text-ink-500">
                {" "}
                ({formatNumber(coverage.inside)} of {formatNumber(coverage.total)})
              </span>
            </p>
            <p className="text-[11px] text-ink-500 mt-0.5">
              From this center, a typical scan is {formatNumber(coverage.p50)} ft away, 9 in 10 are within{" "}
              {formatNumber(coverage.p90)} ft, and the farthest was {formatNumber(coverage.max)} ft. Set the distance
              just above where the real scans stop to keep people honest without flagging the normal ones.
            </p>
          </>
        )}
      </div>

      <p className="text-[11px] text-ink-400 mb-4">
        Applies to scans from now on — earlier scans keep the on-site/flagged result they were given at the time.
      </p>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save} disabled={!valid || !changed}>
          Save location
        </Button>
      </div>
    </Modal>
  );
}
