import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import QRCode from "qrcode";
import { panelQrValue } from "../data/mockData";
import { Modal, Button, RoleBadge, formatNumber } from "./ui";

const SIZE_PRESETS = [
  { label: "Small", inches: 1 },
  { label: "Medium", inches: 1.5 },
  { label: "Large", inches: 2 },
  { label: "X-Large", inches: 3 },
];

// Usable print area on a US Letter sheet with a quarter-inch margin on every
// side — used only to give the user a live estimate of how many stickers
// will land on each physical page. The actual print layout (flex-wrap) fits
// however many really do based on the browser's own pagination, so this is
// informational, not a hard constraint.
const PAGE_USABLE_WIDTH_IN = 8;
const PAGE_USABLE_HEIGHT_IN = 10.5;
const GAP_IN = 0.15;
const LABEL_HEIGHT_IN = 0.22;

function formatElapsed(startedAt, now) {
  const mins = Math.max(0, Math.round((now - startedAt) / 60000));
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function PanelDetailModal({ group, onClose }) {
  const navigate = useNavigate();
  const [showPrint, setShowPrint] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  if (!group) return null;
  const { panel, target, active, completed } = group;

  return (
    <Modal onClose={onClose} widthClass="max-w-2xl">
      <div className="flex items-start justify-between mb-1">
        <div>
          <h2 className="text-lg font-bold text-ink-900">Panel #{panel.id}</h2>
          <p className="text-sm text-ink-500 mt-0.5">
            {panel.customer}
            {panel.order ? ` · ${panel.order}` : ""}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="text-ink-400 hover:text-ink-700 text-xl leading-none px-1"
        >
          ×
        </button>
      </div>

      <div className="flex flex-wrap gap-3 my-5">
        <StatBlock label="Connection Target" value={formatNumber(target)} />
        <StatBlock label="Estimate" value={`$${formatNumber(panel.price)}`} />
        <StatBlock label="Active Now" value={active.length} />
        <StatBlock label="Logged Entries" value={completed.length} />
      </div>

      <p className="text-[11px] font-semibold text-ink-500 uppercase tracking-wide mb-2">
        Currently scanned in ({active.length})
      </p>
      {active.length === 0 ? (
        <p className="text-xs text-ink-400 mb-5">No one is currently scanned into this panel.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 mb-5">
          {active.map((s) => (
            <div key={s.id} className="rounded-lg border border-paper-200 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={() => s.employee && navigate(`/team/${s.employee.id}`)}
                  className="text-[13px] font-medium text-ink-900 hover:text-brand-600 text-left truncate"
                >
                  {s.employee?.name ?? "Unknown Technician"}
                </button>
                <span className="w-1.5 h-1.5 rounded-full bg-good-500 animate-pulse shrink-0" />
              </div>
              {s.employee && <RoleBadge role={s.employee.role} />}
              <p className="text-[11px] font-semibold text-brand-700 mt-1.5">{s.stage}</p>
              <p className="text-[11px] text-ink-500 mt-0.5">{formatElapsed(s.startedAt, now)} elapsed</p>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] font-semibold text-ink-500 uppercase tracking-wide mb-2 pt-3 border-t border-paper-100">
        Completed work on this panel
      </p>
      {completed.length === 0 ? (
        <p className="text-xs text-ink-400 mb-1">Nothing logged on this panel yet.</p>
      ) : (
        <div className="space-y-1.5 max-h-52 overflow-y-auto scrollbar-thin pr-1">
          {completed.map((h) => (
            <div key={h.id} className="flex items-center justify-between text-[12px]">
              <span className="text-ink-700">
                <span className="font-medium text-ink-900">{h.employee?.name ?? "Unknown"}</span> added{" "}
                <span className="font-semibold">+{h.percentAdded}%</span> to {h.stage ?? "a task"}
                {h.taskCompleted && <span className="text-good-600 font-semibold"> (completed)</span>}
              </span>
              <span className="text-ink-400 shrink-0 ml-2">{h.date}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 pt-4 border-t border-paper-100 flex justify-end">
        <Button onClick={() => setShowPrint(true)}>
          <PrinterIcon /> Print QR Code
        </Button>
      </div>

      {showPrint && <PrintQrModal panel={panel} onClose={() => setShowPrint(false)} />}
    </Modal>
  );
}

function StatBlock({ label, value }) {
  return (
    <div className="flex-1 min-w-[130px] rounded-lg bg-paper-50 border border-paper-200 px-3 py-2.5">
      <p className="text-[11px] font-medium text-ink-500">{label}</p>
      <p className="text-lg font-bold text-ink-900 mt-0.5">{value}</p>
    </div>
  );
}

function PrintQrModal({ panel, onClose }) {
  const value = useMemo(() => panelQrValue(panel), [panel]);
  const [sizeIn, setSizeIn] = useState(1.5);
  const [quantity, setQuantity] = useState(12);
  const [dataUrl, setDataUrl] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setDataUrl(null);
    QRCode.toDataURL(value, { width: 512, margin: 1 })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't generate the QR code. Try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  const perRow = Math.max(1, Math.floor((PAGE_USABLE_WIDTH_IN + GAP_IN) / (sizeIn + GAP_IN)));
  const rowHeight = sizeIn + LABEL_HEIGHT_IN + GAP_IN;
  const rows = Math.ceil(quantity / perRow);
  const rowsPerSheet = Math.max(1, Math.floor((PAGE_USABLE_HEIGHT_IN + GAP_IN) / rowHeight));
  const sheets = Math.max(1, Math.ceil(rows / rowsPerSheet));

  function handleSizePreset(inches) {
    setSizeIn(inches);
  }

  function handlePrint() {
    if (!dataUrl) return;
    window.print();
  }

  function handleQuantityChange(e) {
    const n = Math.round(Number(e.target.value));
    if (Number.isFinite(n)) setQuantity(Math.min(200, Math.max(1, n)));
  }

  return (
    <Modal onClose={onClose} widthClass="max-w-md">
      <div className="flex items-start justify-between mb-4">
        <h3 className="text-base font-bold text-ink-900">Print QR Code — Panel #{panel.id}</h3>
        <button
          onClick={onClose}
          aria-label="Close"
          className="text-ink-400 hover:text-ink-700 text-xl leading-none px-1"
        >
          ×
        </button>
      </div>

      <div className="flex justify-center mb-5">
        <div className="rounded-lg border border-paper-200 bg-white p-3">
          {dataUrl ? (
            <img src={dataUrl} alt={`QR code for panel ${panel.id}`} width={140} height={140} />
          ) : error ? (
            <p className="text-xs text-bad-600 w-[140px] text-center py-10">{error}</p>
          ) : (
            <div className="w-[140px] h-[140px] flex items-center justify-center text-xs text-ink-400">
              Generating…
            </div>
          )}
        </div>
      </div>

      <label className="text-xs font-semibold text-ink-500">QR code size</label>
      <div className="grid grid-cols-4 gap-2 mt-1.5 mb-3">
        {SIZE_PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => handleSizePreset(p.inches)}
            className={`rounded-lg border px-2 py-2 text-[12px] font-semibold text-center ${
              sizeIn === p.inches
                ? "border-brand-500 bg-brand-50 text-brand-700"
                : "border-paper-200 text-ink-700 hover:border-brand-300"
            }`}
          >
            {p.label}
            <span className="block text-[10px] font-normal text-ink-400">{p.inches}"</span>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 mb-5">
        <label className="text-xs font-semibold text-ink-500 shrink-0">Custom size (inches)</label>
        <input
          type="number"
          min="0.5"
          max="4"
          step="0.25"
          value={sizeIn}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) setSizeIn(Math.min(4, Math.max(0.5, n)));
          }}
          className="w-20 rounded-lg border border-paper-200 px-2 py-1.5 text-sm"
        />
      </div>

      <label className="text-xs font-semibold text-ink-500">How many to print</label>
      <input
        type="number"
        min="1"
        max="200"
        value={quantity}
        onChange={handleQuantityChange}
        className="mt-1.5 w-full rounded-lg border border-paper-200 px-3 py-2 text-sm"
      />
      <p className="text-[11px] text-ink-500 mt-2 mb-5">
        About {perRow} per row · {rows} row{rows === 1 ? "" : "s"} · roughly {sheets} sheet
        {sheets === 1 ? "" : "s"} of paper at this size.
      </p>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handlePrint} disabled={!dataUrl}>
          <PrinterIcon /> Print
        </Button>
      </div>

      {dataUrl &&
        createPortal(
          <div id="qr-print-area">
            <style>{`
              #qr-print-area { display: none; }
              @media print {
                body > #root { display: none !important; }
                #qr-print-area {
                  display: flex;
                  flex-wrap: wrap;
                  align-content: flex-start;
                  gap: ${GAP_IN}in;
                  padding: 0.25in;
                }
                #qr-print-area .qr-sticker {
                  width: ${sizeIn}in;
                  break-inside: avoid;
                  page-break-inside: avoid;
                }
                #qr-print-area .qr-sticker img {
                  width: ${sizeIn}in;
                  height: ${sizeIn}in;
                  display: block;
                }
                #qr-print-area .qr-sticker p {
                  font-size: 8pt;
                  text-align: center;
                  margin: 2pt 0 0;
                  color: #000;
                }
                @page { size: letter; margin: 0; }
              }
            `}</style>
            {Array.from({ length: quantity }).map((_, i) => (
              <div className="qr-sticker" key={i}>
                <img src={dataUrl} alt="" />
                <p>
                  #{panel.id} · {panel.customer}
                </p>
              </div>
            ))}
          </div>,
          document.body
        )}
    </Modal>
  );
}

function PrinterIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 9V3.5h12V9" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="4" y="9" width="16" height="8" rx="1.5" />
      <path d="M6 14.5h12V20a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5v-5.5Z" />
    </svg>
  );
}
