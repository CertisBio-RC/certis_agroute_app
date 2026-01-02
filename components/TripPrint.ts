// components/TripPrint.ts
"use client";

export type PrintRouteTotals = { distanceMeters: number; durationSeconds: number } | null;

export type PrintRouteLegRow = {
  fromLabel: string;
  toLabel: string;
  distanceMeters: number;
  durationSeconds: number;
};

export type PrintRetailerSummaryRow = {
  retailer: string;
  tripStops: number;
  totalLocations: number;
  agronomyLocations: number;
  suppliers: string[];
  categoryBreakdown: string[];
  states: string[];
};

export type PrintStop = {
  id: string;
  label?: string;
  retailer?: string;
  name?: string;
  kind?: string;

  address?: string;
  city?: string;
  state?: string;
  zip?: string;

  email?: string;
  phoneOffice?: string;
  phoneCell?: string;

  // Optional fields that may exist on some stop objects
  category?: any;
  suppliers?: any;
};

function escapeHtml(input: any) {
  const s = String(input ?? "");
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeJoin(arr: any, sep = ", ") {
  if (!arr) return "";
  if (Array.isArray(arr)) return arr.filter(Boolean).map(String).join(sep);
  return String(arr);
}

function splitMulti(raw: any) {
  const str = String(raw ?? "").trim();
  if (!str) return [];
  return str
    .split(/[;,|]/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

function splitCategories(raw: any) {
  const str = String(raw ?? "").trim();
  if (!str) return [];
  return str
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function metersToMiles(m: number) {
  return m / 1609.344;
}

function formatMiles(meters: number) {
  const mi = metersToMiles(Number(meters || 0));
  if (!isFinite(mi)) return "—";
  if (mi < 0.1) return "<0.1 mi";
  if (mi < 10) return `${mi.toFixed(1)} mi`;
  return `${mi.toFixed(0)} mi`;
}

function formatMinutes(seconds: number) {
  const min = Number(seconds || 0) / 60;
  if (!isFinite(min)) return "—";
  if (min < 1) return "<1 min";
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const r = Math.round(min - h * 60);
  return `${h}h ${r}m`;
}

function fmtTimestamp(d = new Date()) {
  // Local timestamp, readable
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function buildStopAddress(st: PrintStop) {
  const parts: string[] = [];
  const a = String(st.address ?? "").trim();
  const c = String(st.city ?? "").trim();
  const s = String(st.state ?? "").trim();
  const z = String(st.zip ?? "").trim();

  if (a) parts.push(a);
  const line2 = [c, s, z].filter(Boolean).join(" ");
  if (line2) parts.push(line2);

  return parts.join("\n");
}

function normalizeCategoryLabel(raw: string) {
  const s0 = String(raw || "").trim();
  if (!s0) return "";
  return s0;
}

function sortRetailerSummaryInTripOrder(rows: PrintRetailerSummaryRow[], tripStops: PrintStop[]) {
  // Order retailers by first occurrence in tripStops (route order), then by tripStops desc, then name.
  const firstIdx: Record<string, number> = {};
  for (let i = 0; i < tripStops.length; i++) {
    const r = (tripStops[i]?.retailer || "").trim() || "Unknown Retailer";
    if (firstIdx[r] === undefined) firstIdx[r] = i;
  }

  const copy = [...rows];
  copy.sort((a, b) => {
    const ai = firstIdx[a.retailer] ?? 999999;
    const bi = firstIdx[b.retailer] ?? 999999;
    if (ai !== bi) return ai - bi;
    if (b.tripStops !== a.tripStops) return b.tripStops - a.tripStops;
    return a.retailer.localeCompare(b.retailer);
  });
  return copy;
}

function makeCategoryString(st: PrintStop) {
  const cats = splitCategories((st as any).category);
  if (!cats.length) return "";
  return cats.map(normalizeCategoryLabel).filter(Boolean).join(", ");
}

function makeSuppliersString(st: PrintStop) {
  const sups = splitMulti((st as any).suppliers);
  if (!sups.length) return "";
  return sups.join(", ");
}

export function openTripPrintWindow(args: {
  basePath: string;
  appTitle?: string;

  homeLabel?: string;
  homeZipApplied?: string;

  tripStops: PrintStop[];

  routeLegs: PrintRouteLegRow[];
  routeTotals: PrintRouteTotals;

  tripRetailerSummary: PrintRetailerSummaryRow[];
}) {
  const {
    basePath,
    appTitle = "CERTIS AgRoute Database — Trip Print",
    homeLabel = "Home",
    homeZipApplied = "",
    tripStops,
    routeLegs,
    routeTotals,
    tripRetailerSummary,
  } = args;

  if (!tripStops || tripStops.length === 0) {
    alert("Add at least 1 stop to print.");
    return;
  }

  const ts = fmtTimestamp(new Date());

  const safeBase = String(basePath || "").trim() || "/certis_agroute_app";
  const logoUrl = `${safeBase}/icons/certis-logo.png`;

  const totalsLine =
    routeTotals && isFinite(routeTotals.distanceMeters) && isFinite(routeTotals.durationSeconds)
      ? `Total: ${formatMiles(routeTotals.distanceMeters)} • ${formatMinutes(routeTotals.durationSeconds)}`
      : "Total: —";

  const homeLine = homeZipApplied ? `${homeLabel} • ${homeZipApplied}` : `${homeLabel}`;

  const orderedRetailerSummary = sortRetailerSummaryInTripOrder(tripRetailerSummary || [], tripStops);

  const stopCardsHtml = tripStops
    .map((st, idx) => {
      const label = st.label || "Stop";
      const retailer = (st.retailer || "").trim();
      const name = (st.name || "").trim();
      const kind = (st.kind || "").trim();
      const address = buildStopAddress(st);
      const email = (st.email || "").trim();
      const office = (st.phoneOffice || "").trim();
      const cell = (st.phoneCell || "").trim();

      const category = makeCategoryString(st);
      const suppliers = makeSuppliersString(st);

      const metaLeft: string[] = [];
      if (retailer) metaLeft.push(`<div><span class="k">Retailer:</span> ${escapeHtml(retailer)}</div>`);
      if (kind) metaLeft.push(`<div><span class="k">Kind:</span> ${escapeHtml(kind)}</div>`);
      if (category) metaLeft.push(`<div><span class="k">Category:</span> ${escapeHtml(category)}</div>`);
      if (suppliers) metaLeft.push(`<div><span class="k">Suppliers:</span> ${escapeHtml(suppliers)}</div>`);

      const contactBits: string[] = [];
      if (name) contactBits.push(`<div><span class="k">Contact:</span> ${escapeHtml(name)}</div>`);
      if (email) contactBits.push(`<div><span class="k">Email:</span> ${escapeHtml(email)}</div>`);
      if (office) contactBits.push(`<div><span class="k">Office:</span> ${escapeHtml(office)}</div>`);
      if (cell) contactBits.push(`<div><span class="k">Cell:</span> ${escapeHtml(cell)}</div>`);

      const addrBlock = address ? `<pre class="addr">${escapeHtml(address)}</pre>` : `<div class="muted">—</div>`;

      return `
        <div class="card">
          <div class="cardTop">
            <div class="stopNum">${idx + 1}</div>
            <div class="stopTitle">
              <div class="h2">${escapeHtml(label)}</div>
              <div class="muted">${retailer ? escapeHtml(retailer) : "—"}</div>
            </div>
          </div>

          <div class="grid2">
            <div>
              <div class="h3">Address</div>
              ${addrBlock}
            </div>
            <div>
              <div class="h3">Details</div>
              <div class="lines">
                ${metaLeft.length ? metaLeft.join("") : `<div class="muted">—</div>`}
              </div>
            </div>
          </div>

          <div class="grid2 mt">
            <div>
              <div class="h3">Contact</div>
              <div class="lines">
                ${contactBits.length ? contactBits.join("") : `<div class="muted">—</div>`}
              </div>
            </div>
            <div>
              <div class="h3">Notes</div>
              <div class="notesLine"></div>
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  const legsHtml =
    routeLegs && routeLegs.length
      ? `
        <table class="tbl">
          <thead>
            <tr>
              <th style="width:42%;">From</th>
              <th style="width:42%;">To</th>
              <th style="width:8%;">Dist</th>
              <th style="width:8%;">Time</th>
            </tr>
          </thead>
          <tbody>
            ${routeLegs
              .map(
                (lg) => `
              <tr>
                <td>${escapeHtml(lg.fromLabel || "—")}</td>
                <td>${escapeHtml(lg.toLabel || "—")}</td>
                <td class="r">${escapeHtml(formatMiles(lg.distanceMeters))}</td>
                <td class="r">${escapeHtml(formatMinutes(lg.durationSeconds))}</td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      `
      : `<div class="muted">No route legs computed (set Home ZIP and/or add enough stops).</div>`;

  const retailerSummaryHtml =
    orderedRetailerSummary && orderedRetailerSummary.length
      ? orderedRetailerSummary
          .map((row) => {
            return `
            <div class="card compact">
              <div class="row">
                <div class="h2">${escapeHtml(row.retailer)}</div>
                <div class="pill">Trip: ${escapeHtml(row.tripStops)} • Total: ${escapeHtml(row.totalLocations)}</div>
              </div>

              <div class="lines mtSmall">
                <div><span class="k">Agronomy locations:</span> ${escapeHtml(row.agronomyLocations)}</div>
                <div><span class="k">States:</span> ${escapeHtml(safeJoin(row.states) || "—")}</div>
                <div><span class="k">Category breakdown:</span> ${escapeHtml(safeJoin(row.categoryBreakdown) || "—")}</div>
                <div><span class="k">Suppliers:</span> ${escapeHtml(safeJoin(row.suppliers) || "—")}</div>
              </div>
            </div>
          `;
          })
          .join("")
      : `<div class="muted">No trip stops yet.</div>`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(appTitle)}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root {
      --ink: #0b1220;
      --muted: #334155;
      --line: rgba(15, 23, 42, 0.18);
      --card: #ffffff;
      --accent: #f59e0b;
      --accent2: #0ea5e9;
      --bg: #f8fafc;
    }

    @page { margin: 0.55in; }

    html, body {
      padding: 0;
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji";
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .wrap { max-width: 920px; margin: 0 auto; padding: 0; }

    .top {
      display: flex;
      align-items: center;
      gap: 14px;
      border-bottom: 2px solid var(--line);
      padding-bottom: 12px;
      margin-bottom: 12px;
    }

    .logo {
      height: 54px;
      width: auto;
    }

    .titleBlock { flex: 1; min-width: 0; }
    .h1 {
      font-size: 18px;
      font-weight: 900;
      letter-spacing: 0.4px;
      margin: 0;
      line-height: 1.2;
    }
    .sub {
      margin-top: 4px;
      font-size: 12px;
      color: var(--muted);
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
    .dot { opacity: 0.4; }

    .section {
      margin: 14px 0 10px 0;
      page-break-inside: avoid;
    }

    .sectionTitle {
      font-size: 14px;
      font-weight: 900;
      margin: 0 0 8px 0;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .bar {
      height: 10px;
      width: 10px;
      background: var(--accent);
      border-radius: 2px;
      box-shadow: 0 0 0 2px rgba(245,158,11,0.25);
    }

    .summaryRow {
      display: flex;
      gap: 10px;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px;
      border: 1px solid var(--line);
      border-radius: 12px;
      background: linear-gradient(180deg, #fff, #fbfdff);
    }

    .summaryLeft .big {
      font-weight: 900;
      font-size: 13px;
      margin-bottom: 2px;
    }
    .summaryLeft .small {
      font-size: 12px;
      color: var(--muted);
    }
    .summaryRight {
      font-size: 12px;
      font-weight: 800;
      color: var(--ink);
      white-space: nowrap;
    }

    .card {
      border: 1px solid var(--line);
      border-radius: 14px;
      background: var(--card);
      padding: 12px;
      box-shadow: 0 10px 20px rgba(2, 8, 23, 0.06);
      margin: 10px 0;
      page-break-inside: avoid;
    }

    .card.compact { padding: 10px 12px; }

    .cardTop {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      margin-bottom: 10px;
    }

    .stopNum {
      height: 26px;
      min-width: 26px;
      border-radius: 8px;
      background: rgba(14,165,233,0.14);
      border: 1px solid rgba(14,165,233,0.35);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 900;
      font-size: 12px;
      color: var(--ink);
    }

    .stopTitle .h2 {
      font-size: 14px;
      font-weight: 900;
      margin: 0;
      line-height: 1.2;
    }
    .muted { color: var(--muted); font-size: 12px; }

    .grid2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .h3 {
      font-size: 12px;
      font-weight: 900;
      margin: 0 0 6px 0;
      color: #0f172a;
    }

    .addr {
      margin: 0;
      font-size: 12px;
      line-height: 1.35;
      white-space: pre-wrap;
      background: rgba(15, 23, 42, 0.03);
      border: 1px dashed rgba(15, 23, 42, 0.18);
      border-radius: 10px;
      padding: 8px;
    }

    .lines { font-size: 12px; line-height: 1.45; }
    .lines .k { font-weight: 900; color: #0f172a; }
    .mt { margin-top: 10px; }
    .mtSmall { margin-top: 6px; }

    .notesLine {
      height: 44px;
      border-radius: 10px;
      background: rgba(15, 23, 42, 0.02);
      border: 1px dashed rgba(15, 23, 42, 0.22);
    }

    .tbl {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid var(--line);
      border-radius: 12px;
      overflow: hidden;
      background: #fff;
    }

    .tbl th, .tbl td {
      border-bottom: 1px solid var(--line);
      padding: 8px 10px;
      font-size: 12px;
      vertical-align: top;
    }

    .tbl th {
      text-align: left;
      font-weight: 900;
      background: rgba(245,158,11,0.10);
    }

    .tbl tr:last-child td { border-bottom: none; }
    .r { text-align: right; white-space: nowrap; }

    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .pill {
      font-size: 12px;
      font-weight: 900;
      color: #0f172a;
      background: rgba(245,158,11,0.12);
      border: 1px solid rgba(245,158,11,0.25);
      padding: 4px 8px;
      border-radius: 999px;
      white-space: nowrap;
    }

    .foot {
      margin-top: 14px;
      font-size: 11px;
      color: var(--muted);
      border-top: 1px solid var(--line);
      padding-top: 10px;
    }

    /* Print tweaks */
    @media print {
      body { background: #fff; }
      .card { box-shadow: none; }
      .summaryRow { background: #fff; }
      a { color: inherit; text-decoration: none; }
    }

    /* Mobile preview in print window */
    @media (max-width: 720px) {
      .grid2 { grid-template-columns: 1fr; }
      .logo { height: 46px; }
      .h1 { font-size: 16px; }
    }
  </style>
</head>

<body>
  <div class="wrap">
    <div class="top">
      <img class="logo" src="${escapeHtml(logoUrl)}" alt="Certis Biologicals" />
      <div class="titleBlock">
        <h1 class="h1">${escapeHtml(appTitle)}</h1>
        <div class="sub">
          <span><strong>Generated:</strong> ${escapeHtml(ts)}</span>
          <span class="dot">•</span>
          <span><strong>Home:</strong> ${escapeHtml(homeLine)}</span>
          <span class="dot">•</span>
          <span><strong>Stops:</strong> ${escapeHtml(tripStops.length)}</span>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="sectionTitle"><span class="bar"></span>Route Summary</div>
      <div class="summaryRow">
        <div class="summaryLeft">
          <div class="big">${escapeHtml(totalsLine)}</div>
          <div class="small">Based on Mapbox Directions legs (when available).</div>
        </div>
        <div class="summaryRight">${escapeHtml(tripStops.length)} stops</div>
      </div>
    </div>

    <div class="section">
      <div class="sectionTitle"><span class="bar"></span>Stops (Route Order)</div>
      ${stopCardsHtml}
    </div>

    <div class="section">
      <div class="sectionTitle"><span class="bar"></span>Distances & Times (Legs)</div>
      ${legsHtml}
    </div>

    <div class="section">
      <div class="sectionTitle"><span class="bar"></span>Trip Summary by Retailer (Route Order)</div>
      ${retailerSummaryHtml}
    </div>

    <div class="foot">
      CERTIS AgRoute Database • Print view (use browser “Save as PDF”).
    </div>
  </div>

  <script>
    // Let images/layout settle before print
    window.onload = function() {
      setTimeout(function() { window.print(); }, 350);
    };
  </script>
</body>
</html>
  `.trim();

  // Open window from user interaction (button click) to avoid popup blockers.
  const w = window.open("", "_blank", "noopener,noreferrer");
  if (!w) {
    alert("Popup blocked. Allow popups to print.");
    return;
  }

  w.document.open();
  w.document.write(html);
  w.document.close();
}
