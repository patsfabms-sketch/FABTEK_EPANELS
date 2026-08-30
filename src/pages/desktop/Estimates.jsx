import { useEffect, useRef, useState } from "react";
import { useApp } from "../../context/AppContext";
import { connectionsForPanel } from "../../data/mockData";
import { parseEstimateCsv, parseEstimatePdf } from "../../data/estimateImport";
import { Card, SectionTitle, Button, formatNumber, formatDate } from "../../components/ui";

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
// Most QuickBooks estimates simply don't carry a PO number — there's nothing
// for the importer to extract — so this cell lets a manager type one in
// right where the import just landed, without a separate trip to the panel
// detail view.
function PoCell({ panel }) {
  const { updatePanel } = useApp();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(panel.poNumber || "");

  useEffect(() => setValue(panel.poNumber || ""), [panel.poNumber]);

  function save() {
    updatePanel(panel.buildId, { poNumber: value.trim() });
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === "Enter" && save()}
        className="w-28 rounded-md border border-brand-300 px-1.5 py-1 text-[12px]"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className={panel.poNumber ? "hover:text-brand-600" : "text-ink-400 italic hover:text-brand-600"}
    >
      {panel.poNumber || "add PO…"}
    </button>
  );
}

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
            Import QuickBooks estimates and set the rate used to derive panel connection counts
          </p>
        </div>
      </div>

      <PanelEstimatesCard />
    </div>
  );
}

function PanelEstimatesCard() {
  const { panels, pricePerConnection, setPricePerConnection, importEstimates } = useApp();
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
        ? `Imported ${allRows.length} panel${allRows.length === 1 ? "" : "s"} from ${files.length} file${
            files.length === 1 ? "" : "s"
          }.${allErrors.length ? ` ${allErrors.length} line(s) skipped.` : ""}`
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
        subtitle="Import a QuickBooks estimate to set panel connection counts from the estimate price"
      />

      <div className="flex items-end gap-3 mb-4">
        <div>
          <label className="text-xs font-semibold text-ink-500">Price per connection</label>
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

      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-ink-500 border-b border-paper-100">
              <th className="py-1.5 pr-3 font-semibold">Panel</th>
              <th className="py-1.5 pr-3 font-semibold">Job #</th>
              <th className="py-1.5 pr-3 font-semibold">Customer</th>
              <th className="py-1.5 pr-3 font-semibold">Date Added</th>
              <th className="py-1.5 pr-3 font-semibold">PO #</th>
              <th className="py-1.5 pr-3 font-semibold">Estimate</th>
              <th className="py-1.5 pr-3 font-semibold text-right">Connections</th>
            </tr>
          </thead>
          <tbody>
            {panels.map((p) => (
              <tr key={p.buildId} className="border-b border-paper-50">
                <td className="py-1.5 pr-3 font-medium text-ink-900">#{p.id}</td>
                <td className="py-1.5 pr-3 text-ink-600">{p.jobNumber || "—"}</td>
                <td className="py-1.5 pr-3 text-ink-600">{p.customer}</td>
                <td className="py-1.5 pr-3 text-ink-600">{formatDate(p.dateAdded)}</td>
                <td className="py-1.5 pr-3 text-ink-600">
                  <PoCell panel={p} />
                </td>
                <td className="py-1.5 pr-3 text-ink-600">${formatNumber(p.price)}</td>
                <td className="py-1.5 pr-3 text-right font-semibold text-ink-900">
                  {formatNumber(connectionsForPanel(p, pricePerConnection))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
