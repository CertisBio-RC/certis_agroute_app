"use client";

import React, { useMemo, useState } from "react";
import { Stop } from "./CertisMap";

type RouteLegRow = {
  fromLabel: string;
  toLabel: string;
  distanceMeters: number;
  durationSeconds: number;
};

type RetailerSummaryRow = {
  retailer: string;
  tripStops: number;
  totalLocations: number;
  agronomyLocations: number;
  suppliers: string[];
  categoryBreakdown: string[];
  states: string[];
};

type Props = {
  basePath: string;

  // trip inputs
  homeLabel: string;
  homeZipApplied: string;
  homeCoords: [number, number] | null;
  tripStops: Stop[];

  // route stats
  routeLegs: RouteLegRow[];
  routeTotals: { distanceMeters: number; durationSeconds: number } | null;

  // summaries
  tripRetailerSummary: RetailerSummaryRow[];
};

function metersToMiles(m: number) {
  return m / 1609.344;
}

function formatMiles(meters: number) {
  const mi = metersToMiles(meters);
  if (!isFinite(mi)) return "—";
  if (mi < 0.1) return "<0.1 mi";
  if (mi < 10) return `${mi.toFixed(1)} mi`;
  return `${mi.toFixed(0)} mi`;
}

function formatMinutes(seconds: number) {
  const min = seconds / 60;
  if (!isFinite(min)) return "—";
  if (min < 1) return "<1 min";
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const r = Math.round(min - h * 60);
  return `${h}h ${r}m`;
}

function escHtml(v: any) {
  const s = String(v ?? "");
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatCoord(ll: [number, number]) {
  return `${ll[1].toFixed(4)}, ${ll[0].toFixed(4)}`;
}

export default function TripPrint(props: Props) {
  const {
    basePath,
    homeLabel,
    homeZipApplied,
    homeCoords,
    tripStops,
    routeLegs,
    routeTotals,
    tripRetailerSummary,
  } = props;

  const [blocked, setBlocked] = useState(false);

  const canPrint = useMemo(() => {
    return (tripStops?.length || 0) > 0 || !!homeCoords;
  }, [tripStops, homeCoords]);

  const tripMeta = useMemo(() => {
    const dt = new Date();
    const ts = dt.toLocaleString();
    return {
      title: "CERTIS AgRoute Database — Trip Print",
      subtitle: `Generated: ${ts}`,
    };
  }, []);

  const openPrintView = () => {
    setBlocked(false);

    if (!canPrint) return;

    // ✅ IMPORTANT: open the tab/window synchronously as the first thing in the click handler
    // This avoids Chrome popup blocking in most cases.
    const w = window.open("", "_blank", "noopener,noreferrer");
    if (!w) {
      setBlocked(true);
      return;
    }

    const logoUrl = `${basePath}/icons/certis-logo.png`;

    const stopsHtml =
      tripStops.length > 0
        ? tripStops
            .map((st, idx) => {
              const label = escHtml(st.label || "Stop");
              const retailer = escHtml(st.retailer || "");
              const city = escHtml(st.city || "");
              const state = escHtml(st.state || "");
              const zip = escHtml(st.zip || "");
              const kind = escHtml(st.kind || "");
              const name = escHtml((st as any).name || "");
              const email = escHtml((st as any).email || "");
              const phoneOffice = escHtml((st as any).phoneOffice || "");
              const phoneCell = escHtml((st as any).phoneCell || "");
              const address = escHtml((st as any).address || "");

              const line2 = [city ? city : "", state ? state : "", zip ? zip : ""]
                .filter(Boolean)
                .join(city && state ? ", " : " ");

              return `
                <div class="card">
                  <div class="card-h">
                    <div class="card-title">${idx + 1}. ${label}</div>
                    <div class="pill">${kind || "stop"}</div>
                  </div>

                  ${retailer ? `<div class="muted"><b>Retailer:</b> ${retailer}</div>` : ""}

                  <div class="muted">
                    ${line2 ? `${line2}` : ""}
                    ${address ? ` • ${address}` : ""}
                  </div>

                  <div class="grid2">
                    ${name ? `<div><b>Contact:</b> ${name}</div>` : `<div class="muted"> </div>`}
                    ${email ? `<div><b>Email:</b> ${email}</div>` : `<div class="muted"> </div>`}
                    ${phoneOffice ? `<div><b>Office:</b> ${phoneOffice}</div>` : `<div class="muted"> </div>`}
                    ${phoneCell ? `<div><b>Cell:</b> ${phoneCell}</div>` : `<div class="muted"> </div>`}
                  </div>
                </div>
              `;
            })
            .join("\n")
        : `<div class="muted">No stops in trip.</div>`;

    const legsHtml =
      routeLegs.length > 0
        ? `
          <div class="card">
            <div class="card-title">Distances & Times</div>
            ${
              routeTotals
                ? `<div class="muted"><b>Total:</b> ${formatMiles(routeTotals.distanceMeters)} • ${formatMinutes(
                    routeTotals.durationSeconds
                  )}</div>`
                : ""
            }
            <div class="table">
              <div class="trow thead">
                <div>Leg</div>
                <div>Distance</div>
                <div>Time</div>
              </div>
              ${routeLegs
                .map((lg, i) => {
                  const legLabel = `${escHtml(lg.fromLabel)} → ${escHtml(lg.toLabel)}`;
                  return `
                    <div class="trow">
                      <div>${i + 1}. ${legLabel}</div>
                      <div>${formatMiles(lg.distanceMeters)}</div>
                      <div>${formatMinutes(lg.durationSeconds)}</div>
                    </div>
                  `;
                })
                .join("\n")}
            </div>
          </div>
        `
        : `
          <div class="card">
            <div class="card-title">Distances & Times</div>
            <div class="muted">No route legs available (set Home ZIP and add stops, or add ≥2 stops).</div>
          </div>
        `;

    const summaryHtml =
      tripRetailerSummary.length > 0
        ? `
          <div class="card">
            <div class="card-title">Trip Summary</div>
            <div class="muted">Retailers represented in this trip.</div>
            <div class="stack">
              ${tripRetailerSummary
                .map((r) => {
                  const retailer = escHtml(r.retailer);
                  const states = escHtml((r.states || []).join(", ") || "—");
                  const suppliers = escHtml((r.suppliers || []).join(", ") || "—");
                  const cat = escHtml((r.categoryBreakdown || []).join(", ") || "—");
                  return `
                    <div class="subcard">
                      <div class="sub-h">
                        <div class="sub-title">${retailer}</div>
                        <div class="muted"><b>Trip:</b> ${r.tripStops} • <b>Total:</b> ${r.totalLocations}</div>
                      </div>
                      <div class="muted"><b>Agronomy locations:</b> ${r.agronomyLocations}</div>
                      <div class="muted"><b>States:</b> ${states}</div>
                      <div class="muted"><b>Category breakdown:</b> ${cat}</div>
                      <div class="muted"><b>Suppliers:</b> ${suppliers}</div>
                    </div>
                  `;
                })
                .join("\n")}
            </div>
          </div>
        `
        : `
          <div class="card">
            <div class="card-title">Trip Summary</div>
            <div class="muted">No trip summary available yet.</div>
          </div>
        `;

    const homeHtml = homeCoords
      ? `<div class="muted"><b>${escHtml(homeLabel)}:</b> ${escHtml(homeZipApplied || "—")} • ${escHtml(formatCoord(homeCoords))}</div>`
      : `<div class="muted"><b>Home:</b> Not set</div>`;

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escHtml(tripMeta.title)}</title>
  <style>
    :root{
      --ink:#0b1220;
      --muted:#445066;
      --card:#ffffff;
      --border:#d7deea;
      --accent:#0ea5e9;
      --gold:#fde047;
    }
    *{ box-sizing:border-box; }
    body{
      margin:0;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji";
      color:var(--ink);
      background:#f2f6ff;
      padding:22px 18px;
    }
    .page{
      max-width:900px;
      margin:0 auto;
    }
    .header{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:14px;
      padding:14px 16px;
      border:1px solid var(--border);
      border-radius:14px;
      background:linear-gradient(180deg,#ffffff,#f7fbff);
      box-shadow: 0 10px 26px rgba(0,0,0,0.08);
    }
    .brand{
      display:flex;
      align-items:center;
      gap:12px;
      min-width:0;
    }
    .brand img{ height:42px; width:auto; }
    .hgroup{ min-width:0; }
    .title{
      font-weight:900;
      letter-spacing:.2px;
      font-size:18px;
      line-height:1.15;
    }
    .subtitle{
      margin-top:4px;
      color:var(--muted);
      font-size:12px;
      font-weight:600;
    }
    .meta{
      text-align:right;
      color:var(--muted);
      font-size:12px;
      font-weight:600;
      white-space:nowrap;
    }

    .section{
      margin-top:14px;
      display:grid;
      gap:12px;
    }

    .card{
      background:var(--card);
      border:1px solid var(--border);
      border-radius:14px;
      padding:14px 14px;
      box-shadow: 0 10px 26px rgba(0,0,0,0.06);
    }
    .card-h{
      display:flex;
      align-items:flex-start;
      justify-content:space-between;
      gap:10px;
    }
    .card-title{
      font-weight:900;
      font-size:14px;
      margin-bottom:8px;
    }
    .muted{
      color:var(--muted);
      font-size:12px;
      line-height:1.35;
      margin-top:4px;
    }
    .pill{
      display:inline-flex;
      align-items:center;
      padding:3px 10px;
      border-radius:999px;
      border:1px solid var(--border);
      background:#f7fbff;
      color:var(--muted);
      font-size:11px;
      font-weight:800;
      white-space:nowrap;
    }
    .grid2{
      display:grid;
      grid-template-columns: 1fr 1fr;
      gap:6px 12px;
      margin-top:10px;
      font-size:12px;
      color:var(--ink);
    }
    .table{
      margin-top:10px;
      border:1px solid var(--border);
      border-radius:12px;
      overflow:hidden;
    }
    .trow{
      display:grid;
      grid-template-columns: 1fr 130px 120px;
      gap:10px;
      padding:8px 10px;
      border-top:1px solid var(--border);
      font-size:12px;
    }
    .thead{
      border-top:none;
      background:#f7fbff;
      font-weight:900;
      color:var(--muted);
    }
    .stack{ display:grid; gap:10px; margin-top:10px; }
    .subcard{
      border:1px solid var(--border);
      border-radius:12px;
      padding:10px 10px;
      background:#ffffff;
    }
    .sub-h{
      display:flex;
      justify-content:space-between;
      align-items:flex-start;
      gap:10px;
    }
    .sub-title{
      font-weight:900;
      font-size:13px;
    }
    .footer{
      margin-top:12px;
      color:var(--muted);
      font-size:11px;
      text-align:center;
    }

    @media print{
      body{ background:#fff; padding:0; }
      .page{ max-width:none; margin:0; }
      .header,.card{ box-shadow:none; }
      .footer{ display:none; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div class="brand">
        <img src="${logoUrl}" alt="Certis Biologicals" />
        <div class="hgroup">
          <div class="title">CERTIS AgRoute Database — Trip Print</div>
          <div class="subtitle">${escHtml(tripMeta.subtitle)}</div>
        </div>
      </div>
      <div class="meta">
        ${homeHtml}
        <div class="muted"><b>Stops:</b> ${tripStops.length}</div>
      </div>
    </div>

    <div class="section">
      ${legsHtml}
      ${summaryHtml}
      <div class="card">
        <div class="card-title">Stops (Route Order)</div>
        ${stopsHtml}
      </div>
    </div>

    <div class="footer">Tip: Use your browser “Save as PDF”.</div>
  </div>

  <script>
    // auto-open print dialog once content loads
    window.addEventListener("load", () => {
      setTimeout(() => { try { window.print(); } catch(e) {} }, 200);
    });
  </script>
</body>
</html>`;

    // write the HTML into the newly opened tab
    try {
      w.document.open();
      w.document.write(html);
      w.document.close();
      w.focus();
    } catch (e) {
      try {
        w.close();
      } catch {}
      setBlocked(true);
    }
  };

  return (
    <div className="rounded-xl border ring-1 backdrop-blur-sm p-3 bg-[linear-gradient(180deg,rgba(59,130,246,0.14),rgba(8,20,45,0.12))] border-[color:rgba(165,243,252,0.16)] ring-[color:rgba(147,197,253,0.10)] shadow-[0_14px_30px_rgba(0,0,0,0.45)]">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-extrabold leading-tight text-yellow-300">Print Trip (PDF)</div>
        <div className="text-[11px] text-white/60 whitespace-nowrap">{canPrint ? "Ready" : "Add ≥ 1 stop"}</div>
      </div>

      <button
        type="button"
        onClick={openPrintView}
        disabled={!canPrint}
        className={`mt-2 w-full text-center text-xs px-3 py-2 rounded-xl border border-cyan-200/20 font-extrabold ${
          canPrint ? "bg-[#3b2a00] text-white hover:bg-[#4a3500]" : "opacity-40 cursor-not-allowed bg-[#3b2a00]/40 text-white/70"
        }`}
        title={canPrint ? "Open print view in a new tab" : "Build a trip first"}
      >
        Print / Save as PDF
      </button>

      <div className="mt-2 text-[11px] text-white/70">
        Opens a clean print view in a new tab. Choose <span className="text-white/90 font-semibold">Save as PDF</span>.
      </div>

      {blocked && (
        <div className="mt-2 text-[11px] text-red-300">
          Popup blocked by your browser. Allow popups for this site, then try again.
        </div>
      )}
    </div>
  );
}
