"use client";

import React, { useMemo, useState } from "react";
import type { Stop } from "./CertisMap"; // NOTE: if you have a "no type-only imports" rule here too, change this to a normal import in your project.
                                         // If that rule applies globally, use: import { Stop } from "./CertisMap"; (and ensure CertisMap exports Stop at runtime)
                                         // If Stop is a TS-only export, keep type import OR inline a local Stop type here.

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

function safeText(v: any) {
  return String(v ?? "").trim();
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function stopLine(st: Stop) {
  const city = safeText((st as any).city);
  const state = safeText((st as any).state);
  const zip = safeText((st as any).zip);
  const kind = safeText((st as any).kind);

  const loc = [city, state].filter(Boolean).join(", ") + (zip ? ` ${zip}` : "");
  const meta = [loc, kind].filter(Boolean).join(" • ");
  return meta || "—";
}

function stopDetailsLines(st: Stop) {
  const addr = safeText((st as any).address);
  const office = safeText((st as any).phoneOffice);
  const cell = safeText((st as any).phoneCell);
  const email = safeText((st as any).email);

  const lines: string[] = [];
  if (addr) lines.push(addr);
  if (office) lines.push(`Office: ${office}`);
  if (cell) lines.push(`Cell: ${cell}`);
  if (email) lines.push(email);
  return lines;
}

export default function TripPrint({
  basePath,
  homeLabel,
  homeZipApplied,
  homeCoords,
  tripStops,
  routeLegs,
  routeTotals,
  tripRetailerSummary,
}: {
  basePath: string;
  homeLabel: string;
  homeZipApplied: string;
  homeCoords: [number, number] | null;
  tripStops: Stop[];
  routeLegs: RouteLegRow[];
  routeTotals: { distanceMeters: number; durationSeconds: number } | null;
  tripRetailerSummary: RetailerSummaryRow[];
}) {
  const [status, setStatus] = useState<string>("");

  const canPrint = tripStops.length > 0;

  const printPayload = useMemo(() => {
    const now = new Date();
    const dt = now.toLocaleString();

    const homeLine = homeCoords
      ? `${homeLabel}${homeZipApplied ? ` • ${homeZipApplied}` : ""} • ${homeCoords[1].toFixed(4)}, ${homeCoords[0].toFixed(4)}`
      : "Not set";

    const stops = tripStops.map((st, idx) => ({
      n: idx + 1,
      label: safeText((st as any).label) || "Stop",
      retailer: safeText((st as any).retailer),
      meta: stopLine(st),
      details: stopDetailsLines(st),
    }));

    const legs = routeLegs.map((lg) => ({
      from: safeText(lg.fromLabel) || "Start",
      to: safeText(lg.toLabel) || "Stop",
      dist: formatMiles(Number(lg.distanceMeters || 0)),
      dur: formatMinutes(Number(lg.durationSeconds || 0)),
    }));

    const totals = routeTotals
      ? { dist: formatMiles(routeTotals.distanceMeters), dur: formatMinutes(routeTotals.durationSeconds) }
      : null;

    const retailerRows = (tripRetailerSummary || []).map((r) => ({
      retailer: safeText(r.retailer) || "Unknown Retailer",
      tripStops: Number(r.tripStops || 0),
      totalLocations: Number(r.totalLocations || 0),
      agronomyLocations: Number(r.agronomyLocations || 0),
      states: (r.states || []).join(", ") || "—",
      suppliers: (r.suppliers || []).join(", ") || "—",
      categories: (r.categoryBreakdown || []).join(", ") || "—",
    }));

    return {
      dt,
      homeLine,
      totals,
      stops,
      legs,
      retailerRows,
    };
  }, [homeCoords, homeLabel, homeZipApplied, tripStops, routeLegs, routeTotals, tripRetailerSummary]);

  const openPrintView = () => {
    if (!canPrint) return;

    // IMPORTANT: open the window synchronously in the click handler to avoid popup blocking.
    const w = window.open("", "_blank", "noopener,noreferrer");
    if (!w) {
      setStatus("Popup blocked. Allow popups for this site, then try again.");
      return;
    }

    setStatus("");

    const logoUrl = `${basePath}/icons/certis-logo.png`;

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>CERTIS AgRoute — Trip Print</title>
  <style>
    :root{
      --ink:#0b1220;
      --muted:#4b5563;
      --panel:#ffffff;
      --panel2:#f8fafc;
      --border:#e5e7eb;
      --accent:#f59e0b;
    }
    *{box-sizing:border-box}
    body{
      margin:0;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, "Apple Color Emoji","Segoe UI Emoji";
      color:var(--ink);
      background:#ffffff;
    }
    .wrap{max-width:980px;margin:0 auto;padding:22px}
    .top{
      display:flex;align-items:center;justify-content:space-between;gap:16px;
      padding-bottom:14px;border-bottom:1px solid var(--border);margin-bottom:14px;
    }
    .brand{display:flex;align-items:center;gap:12px;min-width:0}
    .brand img{height:44px;width:auto}
    .title{font-weight:900;letter-spacing:.02em}
    .sub{color:var(--muted);font-size:12px;margin-top:2px}
    .pill{
      display:inline-flex;align-items:center;gap:8px;
      font-size:12px;border:1px solid var(--border);
      background:var(--panel2);padding:8px 10px;border-radius:999px;
      white-space:nowrap;
    }
    .grid{display:grid;grid-template-columns:1fr;gap:12px}
    @media (min-width: 900px){ .grid{grid-template-columns:1fr 1fr} }
    .card{
      border:1px solid var(--border);
      border-radius:14px;
      background:var(--panel);
      padding:14px;
      box-shadow: 0 8px 22px rgba(0,0,0,.06);
    }
    .card h2{
      margin:0 0 10px 0;
      font-size:14px;
      font-weight:900;
      color:var(--ink);
    }
    .kv{display:flex;gap:8px;font-size:12px;line-height:1.4;margin:6px 0}
    .k{min-width:120px;color:var(--muted);font-weight:700}
    .v{flex:1}
    .table{width:100%;border-collapse:collapse}
    .table th,.table td{
      text-align:left;font-size:12px;padding:8px 8px;border-top:1px solid var(--border);
      vertical-align:top;
    }
    .table thead th{
      border-top:none;
      color:var(--muted);
      font-weight:900;
      font-size:11px;
      letter-spacing:.03em;
      text-transform:uppercase;
      background:var(--panel2);
    }
    .stop{
      border:1px solid var(--border);
      border-radius:12px;
      padding:10px;
      margin-top:10px;
      background:var(--panel2);
    }
    .stopHead{display:flex;justify-content:space-between;gap:10px}
    .stopTitle{font-weight:900}
    .stopMeta{font-size:12px;color:var(--muted);margin-top:2px}
    .stopDetails{font-size:12px;margin-top:6px;color:var(--ink)}
    .stopDetails div{margin-top:2px}
    .badge{
      display:inline-block;
      padding:2px 8px;
      border-radius:999px;
      border:1px solid var(--border);
      background:#fff;
      font-size:11px;
      color:var(--muted);
      white-space:nowrap;
    }
    .footer{
      margin-top:14px;
      color:var(--muted);
      font-size:11px;
      border-top:1px dashed var(--border);
      padding-top:12px;
    }
    @media print{
      .wrap{padding:0}
      .card{box-shadow:none}
      a{color:inherit;text-decoration:none}
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <div class="brand">
        <img src="${escapeHtml(logoUrl)}" alt="Certis Biologicals" onerror="this.style.display='none';" />
        <div style="min-width:0">
          <div class="title">CERTIS AgRoute Database — Trip Print</div>
          <div class="sub">Generated: ${escapeHtml(printPayload.dt)}</div>
        </div>
      </div>
      <div class="pill"><span style="font-weight:900;color:var(--accent)">Trip</span> <span>${escapeHtml(String(printPayload.stops.length))} stops</span></div>
    </div>

    <div class="grid">
      <div class="card">
        <h2>Trip Overview</h2>
        <div class="kv"><div class="k">Home</div><div class="v">${escapeHtml(printPayload.homeLine)}</div></div>
        <div class="kv"><div class="k">Stops</div><div class="v">${escapeHtml(String(printPayload.stops.length))}</div></div>
        <div class="kv"><div class="k">Total distance</div><div class="v">${escapeHtml(printPayload.totals ? printPayload.totals.dist : "—")}</div></div>
        <div class="kv"><div class="k">Total time</div><div class="v">${escapeHtml(printPayload.totals ? printPayload.totals.dur : "—")}</div></div>
        <div class="kv"><div class="k">Notes</div><div class="v">This print view omits the map for clean PDF output.</div></div>
      </div>

      <div class="card">
        <h2>Distances & Times</h2>
        ${
          printPayload.legs.length
            ? `<table class="table">
                <thead><tr><th>From → To</th><th>Distance</th><th>Time</th></tr></thead>
                <tbody>
                  ${printPayload.legs
                    .map(
                      (lg) => `<tr>
                        <td>${escapeHtml(lg.from)} → ${escapeHtml(lg.to)}</td>
                        <td>${escapeHtml(lg.dist)}</td>
                        <td>${escapeHtml(lg.dur)}</td>
                      </tr>`
                    )
                    .join("")}
                </tbody>
              </table>`
            : `<div style="font-size:12px;color:var(--muted)">No route legs available (set Home ZIP + stops, or token missing).</div>`
        }
      </div>
    </div>

    <div class="card" style="margin-top:12px">
      <h2>Stops (In Route Order)</h2>
      ${printPayload.stops
        .map((s) => {
          const head = `${s.n}. ${s.label}${s.retailer ? ` — ${s.retailer}` : ""}`;
          const details = s.details.length ? s.details.map((d) => `<div>${escapeHtml(d)}</div>`).join("") : `<div>—</div>`;
          return `<div class="stop">
            <div class="stopHead">
              <div>
                <div class="stopTitle">${escapeHtml(head)}</div>
                <div class="stopMeta">${escapeHtml(s.meta)}</div>
              </div>
              <div class="badge">Stop ${s.n}</div>
            </div>
            <div class="stopDetails">${details}</div>
          </div>`;
        })
        .join("")}
    </div>

    <div class="card" style="margin-top:12px">
      <h2>Trip Summary (By Retailer)</h2>
      ${
        printPayload.retailerRows.length
          ? `<table class="table">
              <thead>
                <tr>
                  <th>Retailer</th>
                  <th>Trip Stops</th>
                  <th>Total Locations</th>
                  <th>Agronomy</th>
                  <th>States</th>
                </tr>
              </thead>
              <tbody>
                ${printPayload.retailerRows
                  .map(
                    (r) => `<tr>
                      <td>
                        <div style="font-weight:900">${escapeHtml(r.retailer)}</div>
                        <div style="color:var(--muted);font-size:11px;margin-top:2px"><b>Suppliers:</b> ${escapeHtml(r.suppliers)}</div>
                        <div style="color:var(--muted);font-size:11px;margin-top:2px"><b>Categories:</b> ${escapeHtml(r.categories)}</div>
                      </td>
                      <td>${escapeHtml(String(r.tripStops))}</td>
                      <td>${escapeHtml(String(r.totalLocations))}</td>
                      <td>${escapeHtml(String(r.agronomyLocations))}</td>
                      <td>${escapeHtml(r.states)}</td>
                    </tr>`
                  )
                  .join("")}
              </tbody>
            </table>`
          : `<div style="font-size:12px;color:var(--muted)">No trip summary available.</div>`
      }
    </div>

    <div class="footer">
      Tip: In the browser print dialog, choose <b>Save as PDF</b>. Use A4/Letter, margins “Default”, and turn on “Background graphics” if you want card shading.
    </div>
  </div>

  <script>
    // give the document a moment to paint, then auto-open print dialog
    setTimeout(() => { try { window.focus(); window.print(); } catch(e){} }, 250);
  </script>
</body>
</html>`;

    try {
      w.document.open();
      w.document.write(html);
      w.document.close();
    } catch (e: any) {
      try {
        w.close();
      } catch {}
      setStatus(`Print view failed: ${String(e?.message || e)}`);
    }
  };

  const panelClass =
    "rounded-xl border ring-1 backdrop-blur-sm p-3 " +
    "bg-[linear-gradient(180deg,rgba(59,130,246,0.14),rgba(8,20,45,0.12))] " +
    "border-[color:rgba(165,243,252,0.16)] ring-[color:rgba(147,197,253,0.10)] " +
    "shadow-[0_14px_30px_rgba(0,0,0,0.45)]";

  return (
    <div className={panelClass}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-extrabold leading-tight text-yellow-300">Print Trip (PDF)</div>
        <div className="text-[11px] text-white/60 whitespace-nowrap">{canPrint ? "Ready" : "Add ≥ 1 stop"}</div>
      </div>

      <button
        type="button"
        onClick={openPrintView}
        disabled={!canPrint}
        className={[
          "mt-2 w-full rounded-xl px-3 py-2 text-sm font-extrabold",
          canPrint
            ? "bg-[#3b2a00] text-white border border-yellow-200/40 hover:bg-[#4a3500]"
            : "bg-white/10 text-white/40 border border-white/10 cursor-not-allowed",
        ].join(" ")}
        title={canPrint ? "Open print view" : "Add at least one stop to enable printing"}
      >
        Print / Save as PDF
      </button>

      <div className="mt-2 text-[11px] text-white/70">
        Opens a clean print view in a new tab. Choose <span className="font-extrabold text-white/90">Save as PDF</span>.
      </div>

      {status && <div className="mt-2 text-[11px] text-red-300">{status}</div>}
    </div>
  );
}
