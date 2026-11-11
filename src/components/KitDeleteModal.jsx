import { useState } from "react";
import { Modal, Button } from "./ui";

// Confirm removing a kit (for example, the wrong zip was added). Uses an
// in-app dialog, not a browser pop-up, so it works the same on every tablet.
export default function KitDeleteModal({ kit, onClose, onConfirm }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  async function go() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (e) {
      setError(e.message || String(e));
      setBusy(false);
    }
  }
  return (
    <Modal onClose={busy ? () => {} : onClose} widthClass="max-w-md">
      <h3 className="text-base font-bold text-ink-900">Delete this kit?</h3>
      <p className="text-[13px] text-ink-700 mt-2">
        Panel <b>{kit.panelId}</b> · SO {kit.soNumber} · Item {kit.itemNumber}
        {kit.topDescription ? <span className="block text-ink-500">{kit.topDescription}</span> : null}
      </p>
      <p className="text-[13px] text-ink-700 mt-3">
        This removes the kit's checklist, check marks, history, red pins and the stored drawings and files. The panel itself in AssemblyOS is not touched, and you can add the right zip again afterward. This can't be undone.
      </p>
      {error && <p className="text-sm text-bad-600 mt-3">{error}</p>}
      <div className="flex justify-end gap-2 mt-5">
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="danger" onClick={go} disabled={busy}>
          {busy ? "Deleting…" : "Yes, delete this kit"}
        </Button>
      </div>
    </Modal>
  );
}
