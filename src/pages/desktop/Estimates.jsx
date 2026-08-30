import { useEffect, useRef, useState } from "react";
import { useApp } from "../../context/AppContext";
import { parseEstimateCsv, parseEstimatePdf } from "../../data/estimateImport";
import { Card, SectionTitle, Button } from "../../components/ui";

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// PDF imports carry the original document along with them (as a data URL) so
// it can be opened again later from the panel detail view — "the original
// document of the PDF estimate should also be available to view". CSV
// imports have no source document to attach.
async function parseEstimateFile(file) {
  if (file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf") {
    const [{ rows, errors }, pdfDataUrl] = await Promise.all([parseEstimatePdf(file), readFileAsDataUrl(file)]);
    return { rows: rows.map((r) => ({ ...r, pdfDataUrl, pdfFileName: file.name })), errors };
  }
  return parseEstimateCsv(await readFileAsText(file));
}

export default function Estimates() {
  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-ink-900">Panel Estimates</h1>
          <p className="text-sm text-ink-500 mt-1">
            Import QuickBooks estimates and set the default rate used to price new panels
          </p>
        </div>
      </div>

      <PanelEstimatesCard />
    </div>
  );
}

function PanelEstimatesCard() {
  const { pricePerConnection, setPricePerConnection, importEstimates } = useApp();
  const [rateInput, setRateInput] = useState(String(pricePerConnection));
  const [dragging, setDragging] = useState(false);
  const [importMsg, setImportMsg] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => setRateInput(String(pricePerConnection)), [pricePerConnection]);

  async function handleFiles(fileList) {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;

    const allRows = [];
    const allErrors = [];
    for (const file of files) {
      try {
        const { rows, errors } = await parseEstimateFile(file);
        allRows.push(...rows);
        allErrors.push(...errors.map((e) => `${file.name}: ${e}`));
      } catch (err) {
        allErrors.push(`${file.name}: couldn't be read (${err.message ?? "unknown error"}).`);
      }
    }

    if (allRows.length) importEstimates(allRows);
    setImportMsg({
      ok: allRows.length > 0,
      text: allRows.length
        ? `Schedule is updated.${allErrors.length ? ` ${allErrors.length} line(s) skipped.` : ""}`
        : allErrors[0] || "No panels could be imported from these files.",
    });
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }

  function saveRate() {
    setPricePerConnection(rateInput);
  }

  return (
    <Card>
      <SectionTitle
        title="Panel Estimates"
        subtitle="Import a QuickBooks estimate to schedule new panels — imported panels and their details live on the Panels page"
      />

      <div className="flex items-end gap-3 mb-4">
        <div>
          <label className="text-xs font-semibold text-ink-500">Default price per connection</label>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="text-sm text-ink-500">$</span>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={rateInput}
              onChange={(e) => setRateInput(e.target.value)}
              className="w-24 rounded-lg border border-paper-200 px-2 py-1.5 text-sm"
            />
            <span className="text-xs text-ink-500">/ connection</span>
          </div>
          <p className="text-[11px] text-ink-400 mt-1 max-w-sm">
            Applied to panels as they're imported, not retroactively — raising this rate never reprices a panel
            already on the schedule. To fix one panel's rate, edit it from its detail view on the Panels page.
          </p>
        </div>
        <Button variant="subtle" onClick={saveRate}>
          Save Rate
        </Button>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`rounded-xl2 border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
          dragging ? "border-brand-500 bg-brand-50" : "border-paper-200 hover:border-brand-300"
        }`}
      >
        <p className="text-sm font-semibold text-ink-900">Drag &amp; drop QuickBooks estimate PDFs or CSVs here</p>
        <p className="text-[11px] text-ink-500 mt-1">
          or click to browse · works directly with the PDF QuickBooks emails or lets you save, or a CSV export
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv,.pdf,application/pdf"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {importMsg && (
        <p className={`text-[11px] mt-2 font-medium ${importMsg.ok ? "text-good-600" : "text-bad-600"}`}>
          {importMsg.text}
        </p>
      )}
    </Card>
  );
}
