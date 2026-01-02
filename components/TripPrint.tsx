"use client";

import React, { useCallback, useMemo } from "react";

type StopLike = {
  id: string;
  label: string;
  kind?: string;
  retailer?: string;
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  phoneOffice?: string;
  phoneCell?: string;
  email?: string;

  // optional coords (varies by source)
  lng?: number;
  lat?: number;
  lon?: number;
  longitude?: number;
  latitude?: number;
  lngLat?: [number, number];
  lnglat?: [number, number];
  coords?: [number, number];
  coordinates?: [number, number];
};

type RouteLegRow = {
  fromLabel: string;
  toLabel: string;
  distanceMeters: number;
  durationSeconds: number;
};

type RouteTotals = {
  distanceMeters: number;
  durationSeconds: number;
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

function escHtml(s: any) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fmtCityStateZip(st: StopLike) {
  const city = (st.city || "").trim();
  const state = (st.state || "").trim();
  const zip = (st.zip || "").trim();
  const left = [city, state].filter(Boolean).join(", ");
  return [left, zip].filter(Boolean).join(" ");
}

function getStopLngLat(st: StopLike): [number, number] | null {
  const anySt: any = st;

  const candidates: any[] = [
    anySt.lngLat,
    anySt.lnglat,
    anySt.coords,
    anySt.coordinates,
  ];

  for (const c of candidates) {
    if (Array.isArray(c) && c.length >= 2) {
      const lng = Number(c[0]);
      const lat = Number(c[1]);
      if (isFinite(lng) && isFinite(lat) && Math.abs(lng) <= 180 && Math.abs(lat) <= 90) return [lng, lat];
    }
  }

  const lng = Number(anySt.lng ?? anySt.lon ?? anySt.longitude);
  const lat = Number(anySt.lat ?? anySt.latitude);
  if (isFinite(lng) && isFinite(lat) && Math.abs(lng) <= 180 && Math.abs(lat) <= 90) return [lng, lat];

  return null;
}

function formatLatLng(ll: [number, number]) {
  return `${ll[1].toFixed(5)}, ${ll[0].toFixed(5)}`;
}

export default function TripPrint(props: {
  basePath: string;
  homeLabel: string;
  homeZip: string;
  homeCoords: [number, number] | null;
  tripStops: StopLike[];
  routeLegs: RouteLegRow[];
  routeTotals: RouteTotals | null;
  generatedAt: string;
}) {
  const {
    basePath,
    homeLabel,
    homeZip,
    homeCoords,
    tripStops,
    routeLegs,
    routeTotals,
    generatedAt,
  } = props;

  const canPrint = tripStops.length > 0;

  const prepared = useMemo(() => {
    const stops = tripStops.map((st, idx) => {
      const ll = getStopLngLat(st);
      return {
        idx: idx + 1,
        label: st.label || `Stop ${idx + 1}`,
        kind: (st.kind || "").trim(),
        name: (st.name || "").trim(),
        retailer: (st.retailer || "").trim(),
        address: (st.address || "").trim(),
        csz: fmtCityStateZip(st),
        phoneOffice: (st.phoneOffice || "").trim(),
        phoneCell: (st.phoneCell || "").trim(),
        email: (st.email || "").trim(),
        latlng: ll ? formatLatLng(ll) : "",
      };
    });

    const homeText = homeCoords
      ? `${homeLabel}${homeZip ? ` — ${homeZip}` : ""} • ${formatLatLng(homeCoords)}`
      : `${homeLabel}${homeZip ? ` — ${homeZip}` : ""}`;

    const totalsText = routeTotals
      ? `${formatMiles(routeTotals.distanceMeters)} • ${formatMinutes(routeTotals.durationSeconds)}`
      : "";

    const legs = routeLegs.map((lg) => ({
      fromLabel: lg.fromLabel,
      toLabel: lg.toLabel,
      dist: formatMiles(lg.distanceMeters),
      dur: formatMinutes(lg.durationSeconds),
    }));

    return { stops, homeText, totalsText, legs };
  }, [tripStops, homeCoords, homeLabel, homeZip, routeLegs, routeTotals]);

  const buildPrintHtml = useCallback(() => {
    const logoUrl = `${basePath}/icons/certis-logo.png`;

    const stopsHtml = prepared.stops
      .map((s) => {
        const metaParts: string[] = [];
        if (s.kind) metaParts.push(s.kind);
        if (s.retailer) metaParts.push(s.retailer);

        const meta = metaParts.length ? metaParts.join(" • ") : "";
        const lines: string[] = [];

        if (meta) lines.push(`<div class="sub">${escHtml(meta)}</div>`);
        if (s.name) lines.push(`<div class="line"><span class="k">Contact:</span> ${escHtml(s.name)}</div>`);
        if (s.address) lines.push(`<div class="line">${escHtml(s.address)}</div>`);
        if (s.csz) lines.push(`<div class="line">${escHtml(s.csz)}</div>`);

        const phones: string[] = [];
        if (s.phoneOffice) phones.push(`Office: ${escHtml(s.phoneOffice)}`);
        if (s.phoneCell) phones.push(`Cell: ${escHtml(s.phoneCell)}`);
        if (phones.length) lines.push(`<div class="line"><span class="k">Phone:</span> ${phones.join(" • ")}</div>`);

        if (s.email) lines.push(`<div class="line"><span class="k">Email:</span> ${escHtml(s.email)}</div>`);
        if (s.latlng) lines.push(`<div class="line faint"><span class="k">Lat/Lng:</span> ${escHtml(s.latlng)}</div>`);

        return `
          <div class="card">
            <div class="titleRow">
              <div class="stopNum">${s.idx}</div>
              <div class="title">${escHtml(s.label)}</div>
            </div>
            ${lines.join("")}
          </div>
        `;
      })
      .join("");

    const legsHtml =
      prepared.legs.length > 0
        ? `
      <div class="card">
        <div class="cardHead">Distances & Times</div>
        ${
          prepared.totalsText
            ? `<div class="sub">Total: <strong>${escHtml(prepared.totalsText)}</strong></div>`
            : `<div class="sub">Total: —</div>`
        }
        <div class="table">
          <div class="tHead">
            <div>Leg</div><div>Distance</div><div>Time</div>
          </div>
          ${prepared.legs
            .map(
              (lg, i) => `
            <div class="tRow">
              <div>${escHtml(lg.fromLabel)} → ${escHtml(lg.toLabel)}</div>
              <div>${escHtml(lg.dist)}</div>
              <div>${escHtml(lg.dur)}</div>
            </div>
          `
            )
            .join("")}
        </div>
      </div>
    `
        : "";

    const now = new Date(generatedAt || new Date().toISOString());
    const stamp = isFinite(now.getTime()) ? now.toLocaleString() : String(generatedAt || "");

    const homeBlock = `
      <div class="card">
        <div class="cardHead">Trip Details</div>
        <div class="line"><span class="k">Generated:</span> ${escHtml(stamp)}</div>
        <div class="line"><span class="k">Home:</span> ${escHtml(prepared.homeText)}</div>
        <div class="line"><span class="k">Stops:</span> ${prepared.stops.length}</div>
      </div>
    `;

    const header = `
      <div class="hdr">
        <div class="hdrLeft">
          <img class="logo" src="${escHtml(logoUrl)}" alt="Certis Biologicals" />
          <div class="hdrText">
            <div class="app">CERTIS AgRoute Database</div>
            <div class="doc">Trip Print (Save as PDF)</div>
          </div>
        </div>
        <div class="hdrRight">
          <div class="small">Use your browser print dialog</div>
          <div class="small"><strong>Destination:</strong> Save as PDF</div>
        </div>
      </div>
    `;

    const css = `
      :root {
        --ink: #0b1020;
        --muted: rgba(11,16,32,0.70);
        --card: #ffffff;
        --edge: rgba(15,23,42,0.12);
        --accent: #0ea5e9;
        --accent2: #f59e0b;
      }
      * { box-sizing: border-box; }
      html, body { height: 100%; }
      body {
        margin: 0;
        padding: 24px;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji";
        color: var(--ink);
        background: #f3f6fb;
      }
      .wrap { max-width: 980px; margin: 0 auto; }
      .hdr {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 18px;
        padding: 16px 18px;
        background: linear-gradient(180deg, rgba(14,165,233,0.10), rgba(2,6,23,0.02));
        border: 1px solid var(--edge);
        border-radius: 16px;
        box-shadow: 0 14px 30px rgba(0,0,0,0.08);
      }
      .hdrLeft { display: flex; align-items: center; gap: 14px; min-width: 0; }
      .logo { height: 54px; width: auto; display: block; }
      .hdrText { min-width: 0; }
      .app { font-weight: 900; letter-spacing: 0.2px; font-size: 16px; }
      .doc { font-weight: 900; font-size: 20px; margin-top: 2px; }
      .hdrRight { text-align: right; }
      .small { font-size: 12px; color: var(--muted); line-height: 1.25; }

      .grid {
        margin-top: 14px;
        display: grid;
        grid-template-columns: 1fr;
        gap: 12px;
      }

      .card {
        background: var(--card);
        border: 1px solid var(--edge);
        border-radius: 16px;
        padding: 14px 14px;
        box-shadow: 0 14px 30px rgba(0,0,0,0.06);
        break-inside: avoid;
        page-break-inside: avoid;
      }

      .cardHead {
        font-weight: 900;
        font-size: 14px;
        letter-spacing: 0.2px;
        margin-bottom: 8px;
        color: #0b1020;
      }

      .titleRow { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
      .stopNum {
        width: 28px; height: 28px;
        display: inline-flex; align-items: center; justify-content: center;
        border-radius: 999px;
        background: linear-gradient(180deg, rgba(245,158,11,0.95), rgba(245,158,11,0.75));
        color: #111827;
        font-weight: 900;
        border: 1px solid rgba(0,0,0,0.12);
      }
      .title { font-weight: 900; font-size: 16px; line-height: 1.15; }

      .sub { font-size: 12px; color: var(--muted); margin-bottom: 8px; }
      .line { font-size: 13px; line-height: 1.35; margin: 3px 0; }
      .k { color: var(--muted); font-weight: 800; }
      .faint { color: rgba(11,16,32,0.55); }

      .table { margin-top: 8px; border: 1px solid var(--edge); border-radius: 12px; overflow: hidden; }
      .tHead, .tRow {
        display: grid;
        grid-template-columns: 1fr 120px 120px;
        gap: 0;
        padding: 8px 10px;
        font-size: 12px;
      }
      .tHead { background: rgba(14,165,233,0.10); font-weight: 900; }
      .tRow { border-top: 1px solid var(--edge); }
      .tRow div:nth-child(2), .tRow div:nth-child(3),
      .tHead div:nth-child(2), .tHead div:nth-child(3) { text-align: right; }

      @media print {
        body { background: #ffffff; padding: 0; }
        .hdr { box-shadow: none; }
        .card { box-shadow: none; }
        .wrap { max-width: none; }
      }
    `;

    return `
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Trip Print (Save as PDF)</title>
        <style>${css}</style>
      </head>
      <body>
        <div class="wrap">
          ${header}
          <div class="grid">
            ${homeBlock}
            ${legsHtml}
            ${stopsHtml || `<div class="card"><div class="cardHead">Stops</div><div class="sub">No stops in trip.</div></div>`}
          </div>
        </div>
        <script>
          // Print automatically once the new tab is ready (user can cancel).
          // Delay helps Chrome finish layout and load the logo.
          window.addEventListener('load', () => {
            setTimeout(() => {
              try { window.focus(); window.print(); } catch (e) {}
            }, 250);
          });
        </script>
      </body>
      </html>
    `;
  }, [basePath, prepared, generatedAt]);

  const handlePrint = useCallback(() => {
    if (!canPrint) return;

    // IMPORTANT: open the window synchronously (no await) to avoid popup blocking.
    const w = window.open("", "_blank", "noopener,noreferrer");
    if (!w) {
      // Chrome popup blocked
      alert(
        "Popup blocked by browser.\n\nAllow popups for this site, then click Print / Save as PDF again."
      );
      return;
    }

    const html = buildPrintHtml();

    try {
      w.document.open();
      w.document.write(html);
      w.document.close();
    } catch (e) {
      try {
        w.location.href = "about:blank";
        w.document.open();
        w.document.write(html);
        w.document.close();
      } catch {
        alert("Unable to open print view. Please try again after allowing popups.");
      }
    }
  }, [canPrint, buildPrintHtml]);

  return (
    <div className="rounded-xl border ring-1 backdrop-blur-sm p-3 bg-[linear-gradient(180deg,rgba(59,130,246,0.14),rgba(8,20,45,0.12))] border-[color:rgba(165,243,252,0.16)] ring-[color:rgba(147,197,253,0.10)] shadow-[0_14px_30px_rgba(0,0,0,0.45)]">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-extrabold leading-tight text-yellow-300">Print Trip (PDF)</div>
        <div className="text-[11px] text-white/60 whitespace-nowrap">
          {canPrint ? "Ready" : "Add ≥ 1 stop"}
        </div>
      </div>

      <button
        type="button"
        onClick={handlePrint}
        disabled={!canPrint}
        className="mt-2 w-full rounded-xl px-3 py-2 font-extrabold border border-yellow-300/70 bg-[#3a2f00] text-white hover:bg-[#4a3b00] disabled:opacity-40 disabled:cursor-not-allowed"
        title="Opens a clean print view (new tab). Use browser 'Save as PDF'."
      >
        Print / Save as PDF
      </button>

      <div className="mt-2 text-[12px] text-white/70 leading-snug">
        Opens a clean print view in a new tab. Choose <span className="font-semibold text-white/85">Save as PDF</span>.
        <br />
        If blocked, allow popups for this site and try again.
      </div>
    </div>
  );
}
