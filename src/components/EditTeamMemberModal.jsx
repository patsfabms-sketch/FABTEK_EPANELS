import { useRef, useState } from "react";
import { ROLES } from "../data/mockData";
import { generatePhotoId, savePhotoBlob, deletePhotoBlob, getPhotoUrl } from "../data/photoStore";
import { Avatar, Button, Modal } from "./ui";

// The full "edit this technician's profile" form — name, role, station, pay
// rate (the original fields, from before profiles existed), plus a profile
// photo and contact info (phone/email). Pulled out of Team.jsx into its own
// shared component so both the Team roster's row-level Edit link AND the
// new "Edit Profile" button on EmployeeDetail.jsx open the exact same form
// on the exact same entry, rather than maintaining two copies — same
// extraction reasoning as EditWorkHistoryModal.jsx (see the Session Log
// update).
//
// The photo upload happens IN here, before onSave is ever called: onSave's
// contract (matching how Team.jsx already calls updateEmployee) is "here
// are the final field values to write," not "here's a raw file to go
// upload somewhere" — so a new photo is uploaded to storage first (see
// photoStore.js), and only once that succeeds does onSave get called with
// the resulting `photoPath`. If the upload fails, nothing is saved at all
// (not even the other edited fields) and an error shows instead — simpler
// and more honest than silently saving some fields but not the photo.
export default function EditTeamMemberModal({ employee, onClose, onSave }) {
  const [name, setName] = useState(employee.name);
  const [role, setRole] = useState(employee.role);
  const [station, setStation] = useState(employee.station ?? "");
  const [payRate, setPayRate] = useState(String(employee.payRate ?? ""));
  const [phone, setPhone] = useState(employee.phone ?? "");
  const [email, setEmail] = useState(employee.email ?? "");
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

  const currentPhotoUrl = removePhoto ? null : photoPreviewUrl ?? getPhotoUrl(employee.photoPath);

  function handlePhotoPick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setRemovePhoto(false);
    setPhotoPreviewUrl(URL.createObjectURL(file));
  }

  async function handleSubmit() {
    if (!name.trim()) {
      setError("Enter the technician's name.");
      return;
    }
    if (!payRate || Number(payRate) <= 0) {
      setError("Enter a pay rate greater than 0.");
      return;
    }
    setError("");
    setSaving(true);

    let photoPath = employee.photoPath ?? null;
    try {
      if (photoFile) {
        const newId = generatePhotoId(employee.id, photoFile);
        await savePhotoBlob(newId, photoFile);
        photoPath = newId;
      } else if (removePhoto) {
        photoPath = null;
      }
    } catch {
      setSaving(false);
      setError("Couldn't upload the photo — check the connection and try again.");
      return;
    }

    onSave({
      name: name.trim(),
      role,
      station: station.trim() || "Unassigned",
      payRate: Number(payRate),
      phone: phone.trim(),
      email: email.trim(),
      photoPath,
    });

    // Best-effort cleanup of whatever photo this replaced/removed — fire
    // and forget, never blocks the save that already happened above.
    const oldPath = employee.photoPath ?? null;
    if (oldPath && oldPath !== photoPath) deletePhotoBlob(oldPath);
  }

  return (
    <Modal onClose={onClose} widthClass="max-w-[420px]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-ink-900">Edit Team Member</h3>
        <button onClick={onClose} className="text-ink-400 text-lg leading-none">
          ×
        </button>
      </div>

      <div className="flex items-center gap-3 mb-4">
        {currentPhotoUrl ? (
          <img src={currentPhotoUrl} alt="" className="w-14 h-14 rounded-full object-cover bg-paper-100 shrink-0" />
        ) : (
          <Avatar employee={{ name }} sizeClass="w-14 h-14 text-lg" />
        )}
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-[12px] font-semibold text-brand-600 hover:text-brand-700 text-left"
          >
            {currentPhotoUrl ? "Change Photo" : "Upload Photo"}
          </button>
          {currentPhotoUrl && (
            <button
              type="button"
              onClick={() => {
                setPhotoFile(null);
                setPhotoPreviewUrl(null);
                setRemovePhoto(true);
              }}
              className="text-[12px] font-semibold text-bad-600 hover:text-bad-700 text-left"
            >
              Remove Photo
            </button>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoPick} />
        </div>
      </div>

      <label className="block mb-3">
        <span className="text-xs font-semibold text-ink-500">Full Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-lg border border-paper-200 px-3 py-2 text-sm"
        />
      </label>

      <label className="block mb-3">
        <span className="text-xs font-semibold text-ink-500">Role</span>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="mt-1 w-full rounded-lg border border-paper-200 px-3 py-2 text-sm bg-white"
        >
          {Object.values(ROLES).map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>

      <label className="block mb-3">
        <span className="text-xs font-semibold text-ink-500">Station</span>
        <input
          value={station}
          onChange={(e) => setStation(e.target.value)}
          placeholder="e.g. Bench 3"
          className="mt-1 w-full rounded-lg border border-paper-200 px-3 py-2 text-sm"
        />
      </label>

      <label className="block mb-3">
        <span className="text-xs font-semibold text-ink-500">Pay Rate</span>
        <div className="mt-1 flex items-center gap-1.5">
          <span className="text-sm text-ink-500">$</span>
          <input
            type="number"
            step="0.25"
            min="0"
            value={payRate}
            onChange={(e) => setPayRate(e.target.value)}
            className="w-full rounded-lg border border-paper-200 px-3 py-2 text-sm"
          />
          <span className="text-xs text-ink-500">/hr</span>
        </div>
      </label>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <label className="block">
          <span className="text-xs font-semibold text-ink-500">Phone</span>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(555) 555-0100"
            className="mt-1 w-full rounded-lg border border-paper-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-ink-500">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@fabtekindustries.com"
            className="mt-1 w-full rounded-lg border border-paper-200 px-3 py-2 text-sm"
          />
        </label>
      </div>

      <p className="text-[11px] text-ink-400 mb-4">
        Username (@{employee.username}) and PIN aren't changed here — those are set by the technician on
        the mobile app. Phone/email are contact info only and don't affect login.
      </p>

      {error && <p className="text-[11px] text-bad-600 mb-3">{error}</p>}

      <Button className="w-full py-2.5" onClick={handleSubmit} disabled={saving}>
        {saving ? "Saving…" : "Save Changes"}
      </Button>
    </Modal>
  );
}
