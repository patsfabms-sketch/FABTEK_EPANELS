import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { Card, SectionTitle, Button } from "../../components/ui";

// The install target is the mobile view specifically, not "/" (which
// redirects to the desktop console — see App.jsx) — scanning this should
// land a technician straight on the login screen, not the manager console.
// Computed from the live origin rather than hard-coded so this keeps working
// if the site ever moves to a different domain.
function installUrl() {
  return `${window.location.origin}/#/mobile`;
}

export default function GetApp() {
  const url = installUrl();
  const [dataUrl, setDataUrl] = useState(null);
  const [error, setError] = useState(null);
  const [showPrint, setShowPrint] = useState(false);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, { width: 640, margin: 1 })
      .then((d) => {
        if (!cancelled) setDataUrl(d);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't generate the QR code. Try refreshing this page.");
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  function handleDownload() {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "assemblyos-app-qr.png";
    a.click();
  }

  function handlePrint() {
    if (!dataUrl) return;
    setShowPrint(true);
    // Give the print portal a render pass before invoking the browser's
    // print dialog — same trick as the panel QR print flow.
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  }

  return (
    <div className="p-6 max-w-[900px] mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ink-900">Get the App</h1>
        <p className="text-sm text-ink-500 mt-1">
          Give technicians a QR code that installs AssemblyOS on their phone like a real app — no app store needed.
        </p>
      </div>

      <Card className="flex flex-col sm:flex-row gap-6 items-start">
        <div className="rounded-xl2 border border-paper-200 bg-white p-4 shrink-0 mx-auto sm:mx-0">
          {dataUrl ? (
            <img src={dataUrl} alt="QR code to install the AssemblyOS technician app" width={220} height={220} />
          ) : error ? (
            <p className="text-xs text-bad-600 w-[220px] text-center py-20">{error}</p>
          ) : (
            <div className="w-[220px] h-[220px] flex items-center justify-center text-xs text-ink-400">
              Generating…
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <SectionTitle
            title="Scan to install"
            subtitle="Works with any phone's built-in camera app — no separate QR scanner needed"
          />
          <p className="text-[13px] text-ink-700 break-all bg-paper-50 border border-paper-200 rounded-lg px-3 py-2 mb-4">
            {url}
          </p>

          <div className="flex flex-wrap gap-2 mb-6">
            <Button variant="subtle" onClick={handleDownload} disabled={!dataUrl}>
              <DownloadIcon /> Download QR Code
            </Button>
            <Button onClick={handlePrint} disabled={!dataUrl}>
              <PrinterIcon /> Print for the shop floor
            </Button>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] font-semibold text-ink-500 uppercase tracking-wide mb-1.5">
                iPhone (Safari)
              </p>
              <ol className="text-[13px] text-ink-700 space-y-1 list-decimal list-inside">
                <li>Scan the code — it opens in Safari</li>
                <li>Tap the Share icon</li>
                <li>Tap "Add to Home Screen"</li>
              </ol>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-ink-500 uppercase tracking-wide mb-1.5">
                Android (Chrome)
              </p>
              <ol className="text-[13px] text-ink-700 space-y-1 list-decimal list-inside">
                <li>Scan the code — it opens in Chrome</li>
                <li>Tap the ⋮ menu (or the "Install app" banner if it appears)</li>
                <li>Tap "Install app" / "Add to Home screen"</li>
              </ol>
            </div>
          </div>
          <p className="text-[11px] text-ink-400 mt-4">
            Once installed, it opens full-screen like any other app and goes straight to the login screen — no
            download, no app store, and it automatically stays up to date whenever this app is updated.
          </p>
        </div>
      </Card>

      {showPrint &&
        dataUrl &&
        createPortal(
          <div id="app-qr-print-area">
            <style>{`
              #app-qr-print-area { display: none; }
              @media print {
                body > #root { display: none !important; }
                #app-qr-print-area {
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                  justify-content: center;
                  height: 100vh;
                  text-align: center;
                  padding: 1in;
                }
                #app-qr-print-area img { width: 3.5in; height: 3.5in; }
                #app-qr-print-area h2 { font-size: 20pt; margin: 0.4in 0 0.1in; color: #000; }
                #app-qr-print-area p { font-size: 11pt; color: #333; margin: 0; }
                @page { size: letter; margin: 0; }
              }
            `}</style>
            <img src={dataUrl} alt="" />
            <h2>Scan to install AssemblyOS</h2>
            <p>Point your phone's camera at this code, then follow the prompt to add it to your home screen.</p>
          </div>,
          document.body
        )}
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3.5v11.5M12 15l-4-4M12 15l4-4" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M4.5 17.5V19a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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
