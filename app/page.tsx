"use client";

import React, { useMemo, useState } from "react";
import CertisMap, { Stop, RetailerNetworkSummaryRow } from "../components/CertisMap";

function uniqSorted(arr: string[]) {
  return Array.from(new Set(arr.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}
function normUpper(v: string) {
  return (v || "").trim().toUpperCase();
}
function includesLoose(hay: string, needle: string) {
  return hay.toLowerCase().includes(needle.toLowerCase());
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

function sectionKey(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function safeLower(v: any) {
  return String(v ?? "").toLowerCase();
}

function digitsOnly(v: string) {
  return v.replace(/[^0-9]/g, "");
}

function tokenizeQuery(q: string) {
  return q
    .trim()
    .toLowerCase()
    .split(/\s+/g)
    .map((t) => t.trim())
    .filter(Boolean);
}

function allTokensPresent(haystackLower: string, tokens: string[]) {
  return tokens.every((t) => haystackLower.includes(t));
}

type RetailerSummaryRow = {
  retailer: string;
  tripStops: number;
  totalLocations: number;
  agronomyLocations: number;
  suppliers: string[];
  categoryBreakdown: string[];
  states: string[];
};

type RetailerTotals = {
  totalLocations: number;
  agronomyLocations: number;
  suppliers: Set<string>;
  states: Set<string>;
  categoryCounts: Record<string, number>;
};

function normalizeCategoryLabel(raw: string) {
  const s0 = String(raw || "").trim();
  if (!s0) return "";
  return s0;
}

function isAgronomyCategory(cat: string) {
  const c = cat.toLowerCase();
  if (!c) return false;
  if (c.includes("hq")) return false;
  return c.includes("agronomy");
}

function formatCategoryCounts(counts: Record<string, number>) {
  const entries = Object.entries(counts).filter(([, n]) => n > 0);

  const preferred = [
    "Agronomy",
    "Grain",
    "Distribution",
    "Energy",
    "Service",
    "C-Store",
    "Corporate HQ",
    "Regional HQ",
    "HQ",
    "Kingpin",
  ].map((x) => x.toLowerCase());

  entries.sort((a, b) => {
    const ak = a[0].toLowerCase();
    const bk = b[0].toLowerCase();
    const ai = preferred.indexOf(ak);
    const bi = preferred.indexOf(bk);

    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return ak.localeCompare(bk);
  });

  return entries.map(([k, n]) => `${k} (${n})`);
}

export default function Page() {
  // Options loaded from map
  const [states, setStates] = useState<string[]>([]);
  const [retailers, setRetailers] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [suppliers, setSuppliers] = useState<string[]>([]);

  // Network summary from retailers.geojson (computed inside CertisMap)
  const [retailerNetworkSummary, setRetailerNetworkSummary] = useState<RetailerNetworkSummaryRow[]>([]);
  const [networkRetailerSearch, setNetworkRetailerSearch] = useState<string>("");

  // Selection state
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedRetailers, setSelectedRetailers] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);

  // Home (UI removed; keep coords for future optional round-trip)
  const [homeCoords, setHomeCoords] = useState<[number, number] | null>(null);

  // Stops + Trip
  const [allStops, setAllStops] = useState<Stop[]>([]);
  const [tripStops, setTripStops] = useState<Stop[]>([]);
  const [zoomToStop, setZoomToStop] = useState<Stop | null>(null);

  // Local sidebar search fields
  const [stateSearch, setStateSearch] = useState("");
  const [retailerSearch, setRetailerSearch] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [stopSearch, setStopSearch] = useState("");

  // Default collapse behavior
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    [sectionKey("Legend")]: false,
    [sectionKey("Find a Stop")]: true,
    [sectionKey("Filters")]: true,
    [sectionKey("State")]: true,
    [sectionKey("Retailer")]: true,
    [sectionKey("Category")]: true,
    [sectionKey("Supplier")]: true,
    [sectionKey("Trip Builder")]: true,
    [sectionKey("Retail Summary - Trip Stops")]: true,
    [sectionKey("Retail Summary - Network")]: true,
  });

  const token = useMemo(() => (process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "").trim(), []);

  const basePath = useMemo(() => {
    const bp = (process.env.NEXT_PUBLIC_BASE_PATH || "/certis_agroute_app").trim();
    return bp || "/certis_agroute_app";
  }, []);

  const hasAnyFilters =
    selectedStates.length ||
    selectedRetailers.length ||
    selectedCategories.length ||
    selectedSuppliers.length;

  const clearAllFilters = () => {
    setSelectedStates([]);
    setSelectedRetailers([]);
    setSelectedCategories([]);
    setSelectedSuppliers([]);
  };

  const toggle = (value: string, current: string[], setter: (v: string[]) => void) => {
    if (current.includes(value)) setter(current.filter((x) => x !== value));
    else setter([...current, value]);
  };

  const clearTrip = () => {
    setTripStops([]);
    setZoomToStop(null);
  };

  const addStopToTrip = (stop: Stop) => {
    setTripStops((prev) => {
      if (prev.some((s) => s.id === stop.id)) return prev;
      return [...prev, stop];
    });
  };

  const removeStop = (id: string) => setTripStops((prev) => prev.filter((s) => s.id !== id));

  const moveStop = (idx: number, dir: -1 | 1) => {
    setTripStops((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      const tmp = next[idx];
      next[idx] = next[j];
      next[j] = tmp;
      return next;
    });
  };

  const zoomStop = (stop: Stop) => setZoomToStop(stop);

  const toggleSection = (key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Filtered option lists (sidebar search)
  const visibleStates = useMemo(() => {
    const list = states.map(normUpper);
    const q = stateSearch.trim();
    return uniqSorted(q ? list.filter((x) => includesLoose(x, q)) : list);
  }, [states, stateSearch]);

  const visibleRetailers = useMemo(() => {
    const q = retailerSearch.trim();
    return q ? retailers.filter((x) => includesLoose(x, q)) : retailers;
  }, [retailers, retailerSearch]);

  const visibleCategories = useMemo(() => {
    const q = categorySearch.trim();
    return q ? categories.filter((x) => includesLoose(x, q)) : categories;
  }, [categories, categorySearch]);

  const visibleSuppliers = useMemo(() => {
    const q = supplierSearch.trim();
    return q ? suppliers.filter((x) => includesLoose(x, q)) : suppliers;
  }, [suppliers, supplierSearch]);

  // STOP SEARCH
  const stopResults = useMemo(() => {
    const qRaw = stopSearch.trim();
    if (!qRaw) return allStops.slice(0, 30);

    const tokens = tokenizeQuery(qRaw);
    if (!tokens.length) return allStops.slice(0, 30);

    const qLower = qRaw.toLowerCase();
    const qDigits = digitsOnly(qLower);

    const personMode = tokens.length >= 2 && qDigits.length === 0;

    const buildSearchBlob = (st: Stop) => {
      const fields = [
        st.label,
        st.retailer,
        st.name,
        st.city,
        st.state,
        st.zip,
        st.address,
        st.email,
        st.phoneOffice,
        st.phoneCell,
        st.kind,
      ]
        .filter(Boolean)
        .map((x) => String(x));
      return fields.join(" ").toLowerCase();
    };

    const buildPersonBlob = (st: Stop) => {
      const fields = [st.name, st.email, st.label].filter(Boolean).map((x) => String(x));
      return fields.join(" ").toLowerCase();
    };

    const scoreField = (value: string | undefined, weight: number) => {
      const v = safeLower(value).trim();
      if (!v) return 0;

      let s0 = 0;

      if (v === qLower) s0 += 50 * weight;
      if (v.startsWith(qLower)) s0 += 28 * weight;
      if (v.includes(qLower)) s0 += 10 * weight;

      if (tokens.length >= 2) {
        const hits = tokens.filter((t) => t && v.includes(t)).length;
        if (hits > 0) s0 += hits * 6 * weight;
        if (hits === tokens.length) s0 += 22 * weight;
      }

      return s0;
    };

    const scorePhone = (value: string | undefined, weight: number) => {
      if (qDigits.length < 3) return 0;
      const digitsV = digitsOnly(String(value || ""));
      if (!digitsV) return 0;

      if (digitsV === qDigits) return 40 * weight;
      if (digitsV.startsWith(qDigits)) return 26 * weight;
      if (digitsV.includes(qDigits)) return 14 * weight;
      return 0;
    };

    const scored = allStops
      .map((st) => {
        const blob = buildSearchBlob(st);
        if (!allTokensPresent(blob, tokens) && qDigits.length === 0) return null;

        if (personMode) {
          const pblob = buildPersonBlob(st);
          if (!allTokensPresent(pblob, tokens)) return null;
        }

        const labelScore = scoreField(st.label, 4);
        const retailerScore = personMode ? 0 : scoreField(st.retailer || "", 3);
        const nameScore = scoreField(st.name || "", 4);
        const cityScore = personMode ? 0 : scoreField(st.city || "", 2);
        const stateScore = personMode ? 0 : scoreField(st.state || "", 2);
        const zipScore = personMode ? 0 : scoreField(st.zip || "", 3);
        const addressScore = personMode ? 0 : scoreField(st.address || "", 1);

        const emailScore = scoreField(st.email || "", 4);
        const officeScore = scorePhone(st.phoneOffice || "", 3);
        const cellScore = scorePhone(st.phoneCell || "", 3);

        let total =
          labelScore +
          retailerScore +
          nameScore +
          cityScore +
          stateScore +
          zipScore +
          addressScore +
          emailScore +
          officeScore +
          cellScore;

        if (personMode && st.kind === "kingpin") total += 18;

        if (total <= 0) return null;

        const inTrip = tripStops.some((x) => x.id === st.id);
        const tripPenalty = inTrip ? -2 : 0;

        return { st, score: total + tripPenalty };
      })
      .filter(Boolean) as { st: Stop; score: number }[];

    scored.sort((a, b) => b.score - a.score);
    return scored.map((x) => x.st).slice(0, 50);
  }, [allStops, stopSearch, tripStops]);

  // MASTER RETAILER TOTALS (FULL FOOTPRINT)
  const retailerTotalsIndex = useMemo(() => {
    const acc: Record<string, RetailerTotals> = {};

    for (const st of allStops) {
      if (!st) continue;
      if (st.kind === "kingpin") continue;

      const retailer = (st.retailer || "").trim() || "Unknown Retailer";
      if (!acc[retailer]) {
        acc[retailer] = {
          totalLocations: 0,
          agronomyLocations: 0,
          suppliers: new Set<string>(),
          states: new Set<string>(),
          categoryCounts: {},
        };
      }

      acc[retailer].totalLocations += 1;

      if (st.state) acc[retailer].states.add(st.state);

      splitMulti(st.suppliers).forEach((x) => acc[retailer].suppliers.add(x));

      const cats = splitCategories(st.category);
      if (cats.length === 0) {
        const k = "Uncategorized";
        acc[retailer].categoryCounts[k] = (acc[retailer].categoryCounts[k] || 0) + 1;
      } else {
        for (const c0 of cats) {
          const c = normalizeCategoryLabel(c0);
          if (!c) continue;
          acc[retailer].categoryCounts[c] = (acc[retailer].categoryCounts[c] || 0) + 1;
          if (isAgronomyCategory(c)) acc[retailer].agronomyLocations += 1;
        }
      }
    }

    return acc;
  }, [allStops]);

  // RETAILER SUMMARY (TRIP-FOCUSED, BUT USING FULL TOTALS)
  const tripRetailerSummary = useMemo<RetailerSummaryRow[]>(() => {
    const tripCounts: Record<string, number> = {};

    for (const st of tripStops) {
      const retailer = (st.retailer || "").trim() || "Unknown Retailer";
      tripCounts[retailer] = (tripCounts[retailer] || 0) + 1;
    }

    const rows: RetailerSummaryRow[] = Object.entries(tripCounts).map(([retailer, tripCount]) => {
      const totals = retailerTotalsIndex[retailer];

      const totalLocations = totals?.totalLocations ?? 0;
      const agronomyLocations = totals?.agronomyLocations ?? 0;
      const suppliers = totals ? Array.from(totals.suppliers).sort() : [];
      const states = totals ? Array.from(totals.states).sort() : [];

      const categoryBreakdown = totals ? formatCategoryCounts(totals.categoryCounts) : [];

      return {
        retailer,
        tripStops: tripCount,
        totalLocations,
        agronomyLocations,
        suppliers,
        categoryBreakdown,
        states,
      };
    });

    rows.sort((a, b) => {
      if (b.tripStops !== a.tripStops) return b.tripStops - a.tripStops;
      return a.retailer.localeCompare(b.retailer);
    });

    return rows;
  }, [tripStops, retailerTotalsIndex]);

  // TRUE RETAILER NETWORK SUMMARY (ALL LOCATIONS)
  const visibleNetworkRows = useMemo(() => {
    const q = networkRetailerSearch.trim().toLowerCase();
    if (!q) return retailerNetworkSummary.slice(0, 120);

    return retailerNetworkSummary
      .filter((r) => (r.retailer || "").toLowerCase().includes(q))
      .slice(0, 120);
  }, [retailerNetworkSummary, networkRetailerSearch]);

  // VISUAL SYSTEM
  const appBg =
    "bg-[#050914] " +
    "bg-[radial-gradient(1200px_720px_at_10%_0%,rgba(37,99,235,0.12),transparent_60%)," +
    "radial-gradient(900px_600px_at_88%_18%,rgba(14,165,233,0.10),transparent_60%)," +
    "radial-gradient(900px_600px_at_40%_120%,rgba(34,197,94,0.05),transparent_60%)]";

  const mapPanelClass =
    "rounded-2xl border border-slate-200/15 ring-1 ring-white/10 bg-slate-950/20 backdrop-blur-md shadow-[0_22px_50px_rgba(0,0,0,0.55)]";

  const sidebarVars = useMemo(() => {
    return {
      ["--cad-sb-top" as any]: "rgba(10, 32, 84, 0.72)",
      ["--cad-sb-bot" as any]: "rgba(5, 10, 24, 0.72)",
      ["--cad-sb-border" as any]: "rgba(165, 243, 252, 0.22)",
      ["--cad-sb-ring" as any]: "rgba(56, 189, 248, 0.18)",

      ["--cad-sec-top" as any]: "rgba(18, 66, 170, 0.22)",
      ["--cad-sec-bot" as any]: "rgba(4, 10, 24, 0.20)",
      ["--cad-sec-border" as any]: "rgba(165, 243, 252, 0.18)",
      ["--cad-sec-ring" as any]: "rgba(59, 130, 246, 0.12)",

      ["--cad-tile-top" as any]: "rgba(59, 130, 246, 0.14)",
      ["--cad-tile-bot" as any]: "rgba(8, 20, 45, 0.12)",
      ["--cad-tile-border" as any]: "rgba(165, 243, 252, 0.16)",
      ["--cad-tile-ring" as any]: "rgba(147, 197, 253, 0.10)",

      ["--cad-list-top" as any]: "rgba(10, 30, 80, 0.16)",
      ["--cad-list-bot" as any]: "rgba(6, 12, 28, 0.14)",
    };
  }, []);

  const sidebarPanelClass =
    "rounded-2xl border ring-1 backdrop-blur-md " +
    "bg-[linear-gradient(180deg,var(--cad-sb-top),var(--cad-sb-bot))] " +
    "border-[color:var(--cad-sb-border)] ring-[color:var(--cad-sb-ring)] " +
    "shadow-[0_26px_60px_rgba(0,0,0,0.65)]";

  const sectionShellClass =
    "rounded-2xl border ring-1 backdrop-blur-sm px-3 py-3 " +
    "bg-[linear-gradient(180deg,var(--cad-sec-top),var(--cad-sec-bot))] " +
    "border-[color:var(--cad-sec-border)] ring-[color:var(--cad-sec-ring)]";

  const innerTileClass =
    "rounded-xl border ring-1 backdrop-blur-sm p-3 " +
    "bg-[linear-gradient(180deg,var(--cad-tile-top),var(--cad-tile-bot))] " +
    "border-[color:var(--cad-tile-border)] ring-[color:var(--cad-tile-ring)] " +
    "shadow-[0_14px_30px_rgba(0,0,0,0.45)]";

  const listClass =
    "max-h-52 overflow-y-auto pr-1 space-y-1 rounded-xl border ring-1 backdrop-blur-sm p-2 " +
    "bg-[linear-gradient(180deg,var(--cad-list-top),var(--cad-list-bot))] " +
    "border-[color:var(--cad-tile-border)] ring-[color:var(--cad-tile-ring)]";

  const stopListClass =
    "max-h-64 overflow-y-auto space-y-2 rounded-xl border ring-1 backdrop-blur-sm p-2 " +
    "bg-[linear-gradient(180deg,var(--cad-list-top),var(--cad-list-bot))] " +
    "border-[color:var(--cad-tile-border)] ring-[color:var(--cad-tile-ring)]";

  const sectionTitleClass = "text-sm font-extrabold tracking-wide text-yellow-300";
  const tileTitleClass = "text-sm font-extrabold leading-tight text-yellow-300";
  const tanSubTextClass = "text-xs text-[#d7c3a1]";
  const subTextClass = "text-xs text-white/75";

  const clearBtnClass =
    "text-xs px-2 py-1 rounded-lg border border-cyan-200/20 " +
    "hover:border-cyan-200/40 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed";

  const smallInputClass =
    "w-full rounded-xl bg-[#061126]/55 border border-cyan-200/20 ring-1 ring-blue-200/10 " +
    "px-3 py-2 text-sm outline-none focus:border-cyan-200/45 focus:ring-cyan-200/20";

  const sectionHeaderRowClass = "flex items-center justify-between gap-2";

  const collapseBtnClass =
    "text-xs px-3 py-1.5 rounded-xl border border-cyan-200/20 bg-[#061126]/45 " +
    "hover:bg-white/10 hover:border-cyan-200/40";

  const Caret = ({ up }: { up: boolean }) => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="inline-block"
      style={{ transform: up ? "rotate(180deg)" : "rotate(0deg)" }}
    >
      <path
        d="M6 9l6 6 6-6"
        fill="none"
        stroke="rgba(253,224,71,0.95)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  const SectionHeader = ({
    title,
    right,
    k,
  }: {
    title: string;
    right?: React.ReactNode;
    k: string;
  }) => {
    const isCollapsed = !!collapsed[k];
    return (
      <div className={sectionHeaderRowClass}>
        <button
          type="button"
          onClick={() => toggleSection(k)}
          className="flex items-center gap-2"
          title={isCollapsed ? "Expand" : "Collapse"}
        >
          <span className={sectionTitleClass}>{title}</span>
          <span className="opacity-90">{isCollapsed ? <Caret up={false} /> : <Caret up={true} />}</span>
        </button>
        <div className="flex items-center gap-2">
          {right}
          <button type="button" onClick={() => toggleSection(k)} className={collapseBtnClass}>
            {isCollapsed ? "Expand" : "Collapse"}
          </button>
        </div>
      </div>
    );
  };

  const strictHint =
    stopSearch.trim().split(/\s+/g).filter(Boolean).length >= 2
      ? `Strict person search: multi-word queries must match name/email (e.g., "James Klein").`
      : `Search tip: multi-word queries act like a strict name search (e.g., "James Klein").`;

  // MOBILE: Map comes first so it’s always visible
  const mapFirstMobileClass = "order-1 lg:order-2";
  const sidebarSecondMobileClass = "order-2 lg:order-1";

  // LEGEND (sidebar card) — Option A: compact list
  const legendItems = useMemo(() => {
    const has = (x: string) => categories.includes(x);

    // prefer canonical names from CertisMap; if not present, just show whatever categories list has
    const cAgronomy = has("Agronomy") ? "Agronomy" : categories.find((x) => x.toLowerCase().includes("agronomy")) || "Agronomy";
    const cGrain = has("Grain/Feed") ? "Grain/Feed" : categories.find((x) => x.toLowerCase().includes("grain")) || "Grain/Feed";
    const cCstore =
      has("C-Store/Service/Energy")
        ? "C-Store/Service/Energy"
        : categories.find((x) => x.toLowerCase().includes("c-store") || x.toLowerCase().includes("service") || x.toLowerCase().includes("energy")) ||
          "C-Store/Service/Energy";
    const cDist = has("Distribution") ? "Distribution" : categories.find((x) => x.toLowerCase().includes("distribution")) || "Distribution";
    const cHQ = has("Regional HQ") ? "Regional HQ" : categories.find((x) => x.toLowerCase().includes("hq")) || "Regional HQ";

    return [
      { label: cAgronomy, swatch: "#22c55e", kind: "dot" as const },
      { label: cGrain, swatch: "#f97316", kind: "dot" as const },
      { label: cCstore, swatch: "#0ea5e9", kind: "dot" as const },
      { label: cDist, swatch: "#a855f7", kind: "dot" as const },
      { label: cHQ, swatch: "#ff0000", kind: "hq" as const },
      { label: "Kingpin", swatch: "#2563eb", kind: "kingpin" as const },
    ];
  }, [categories]);

  return (
    <div className={`min-h-screen w-full text-white flex flex-col ${appBg}`}>
      {/* HEADER (clean — no theme/token up here) */}
      <header className="w-full border-b border-slate-200/15 bg-slate-950/30 backdrop-blur-md flex-shrink-0">
        <div className="px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img
              src={`${basePath}/icons/certis-logo.png`}
              alt="Certis Biologicals"
              className="h-14 sm:h-16 w-auto drop-shadow-[0_10px_18px_rgba(0,0,0,0.65)]"
              draggable={false}
            />
          </div>

          <div className="ml-auto text-yellow-400 font-extrabold tracking-wide text-lg sm:text-xl text-right">
            CERTIS AgRoute Database
          </div>
        </div>
      </header>

      {/* BODY */}
      <div className="flex-1 min-h-0 p-3">
        <div className="h-full min-h-0 flex flex-col lg:grid lg:grid-cols-[380px_1fr] gap-3">
          {/* MAP FIRST ON MOBILE — force a real height so it cannot disappear */}
          <main
            className={[
              mapPanelClass,
              "overflow-hidden map-container w-full",
              "h-[60vh] min-h-[420px] sm:h-[65vh] md:h-[70vh]",
              "lg:h-full lg:min-h-0",
              mapFirstMobileClass,
            ].join(" ")}
          >
            <CertisMap
              selectedStates={selectedStates.map(normUpper)}
              selectedRetailers={selectedRetailers}
              selectedCategories={selectedCategories}
              selectedSuppliers={selectedSuppliers}
              homeCoords={homeCoords}
              tripStops={tripStops}
              zoomToStop={zoomToStop}
              onStatesLoaded={(s0) => setStates(uniqSorted(s0.map(normUpper)))}
              onRetailersLoaded={(r0) => setRetailers(uniqSorted(r0))}
              onCategoriesLoaded={(c0) => setCategories(uniqSorted(c0))}
              onSuppliersLoaded={(s0) => setSuppliers(uniqSorted(s0))}
              onAllStopsLoaded={(stops) => setAllStops(stops)}
              onAddStop={addStopToTrip}
              onRetailerNetworkSummaryLoaded={(rows) => setRetailerNetworkSummary(rows)}
            />
          </main>

          {/* SIDEBAR SECOND ON MOBILE */}
          <aside style={sidebarVars} className={`${sidebarPanelClass} sidebar min-h-0 lg:h-full ${sidebarSecondMobileClass}`}>
            <div className="overflow-y-auto px-4 py-3 space-y-4">
              {/* LEGEND (replaces Home ZIP) — Option A */}
              <div className={sectionShellClass}>
                <SectionHeader title="Legend" k={sectionKey("Legend")} />
                {!collapsed[sectionKey("Legend")] && (
                  <div className="mt-3">
                    <div className="rounded-xl border ring-1 backdrop-blur-sm px-3 py-2 space-y-2 bg-[linear-gradient(180deg,var(--cad-list-top),var(--cad-list-bot))] border-[color:var(--cad-tile-border)] ring-[color:var(--cad-tile-ring)]">
                      {legendItems.map((it) => (
                        <div key={it.label} className="flex items-center gap-3">
                          {it.kind === "dot" && (
                            <span
                              className="inline-block h-3 w-3 rounded-full border border-black/40 flex-shrink-0"
                              style={{ background: it.swatch }}
                              aria-hidden="true"
                            />
                          )}

                          {it.kind === "hq" && (
                            <span
                              className="inline-block h-3 w-3 rounded-full border border-black/40 flex-shrink-0"
                              style={{ background: it.swatch, boxShadow: "0 0 0 2px rgba(250,204,21,0.85) inset" }}
                              aria-hidden="true"
                            />
                          )}

                          {it.kind === "kingpin" && (
                            <span className="inline-flex items-center justify-center h-4 w-4 flex-shrink-0" aria-hidden="true">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="16" height="16">
                                <path
                                  d="M64 14
                                     L78.6 47.5
                                     L115 52.2
                                     L88 75.1
                                     L96.1 110
                                     L64 92
                                     L31.9 110
                                     L40 75.1
                                     L13 52.2
                                     L49.4 47.5
                                     Z"
                                  fill={it.swatch}
                                  stroke="#0b1220"
                                  strokeWidth="6"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </span>
                          )}

                          <div className="flex-1 text-sm font-extrabold text-white/90 leading-tight">{it.label}</div>

                          {it.kind === "hq" && <div className="text-[11px] text-white/60 whitespace-nowrap">red + ring</div>}
                        </div>
                      ))}
                    </div>

                    <div className="mt-2 text-[11px] text-white/60">
                      Kingpins are always visible (offset slightly to avoid overlap).
                    </div>
                  </div>
                )}
              </div>

              {/* STOP SEARCH */}
              <div className={sectionShellClass}>
                <SectionHeader
                  title="Find a Stop"
                  k={sectionKey("Find a Stop")}
                  right={<div className="text-[11px] text-white/65 whitespace-nowrap">Loaded: {allStops.length}</div>}
                />
                {!collapsed[sectionKey("Find a Stop")] && (
                  <div className="space-y-2 mt-3">
                    <input
                      value={stopSearch}
                      onChange={(e) => setStopSearch(e.target.value)}
                      placeholder="Search by retailer, city, state, name, contact…"
                      className={smallInputClass}
                    />
                    <div className={tanSubTextClass}>{strictHint}</div>

                    <div className={stopListClass}>
                      {stopResults.map((st) => {
                        const inTrip = tripStops.some((x) => x.id === st.id);
                        return (
                          <div key={st.id} className={innerTileClass}>
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className={tileTitleClass}>{st.label}</div>
                                <div className={tanSubTextClass}>
                                  {(st.city || "") + (st.city ? ", " : "")}
                                  {st.state || ""}
                                  {st.zip ? ` ${st.zip}` : ""}
                                  {st.kind ? ` • ${st.kind}` : ""}
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <button onClick={() => zoomStop(st)} className={clearBtnClass}>
                                  Zoom
                                </button>
                                <button
                                  onClick={() => addStopToTrip(st)}
                                  className="text-xs px-2 py-1 rounded-lg bg-[#fde047] text-black font-extrabold hover:bg-[#fde047]/90 disabled:opacity-50"
                                  disabled={inTrip}
                                >
                                  {inTrip ? "Added" : "Add"}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {stopResults.length === 0 && <div className={subTextClass}>No matches.</div>}
                    </div>
                  </div>
                )}
              </div>

              {/* FILTERS */}
              <div className={sectionShellClass}>
                <SectionHeader
                  title="Filters"
                  k={sectionKey("Filters")}
                  right={
                    <button onClick={clearAllFilters} className={clearBtnClass} disabled={!hasAnyFilters}>
                      Clear All
                    </button>
                  }
                />
                {!collapsed[sectionKey("Filters")] && (
                  <div className="space-y-4 mt-3">
                    {/* State */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className={sectionTitleClass}>State</div>
                        <button
                          onClick={() => setSelectedStates([])}
                          className={clearBtnClass}
                          disabled={selectedStates.length === 0}
                        >
                          Clear
                        </button>
                      </div>
                      <input
                        value={stateSearch}
                        onChange={(e) => setStateSearch(e.target.value)}
                        placeholder="Search states…"
                        className={smallInputClass}
                      />
                      <div className={listClass}>
                        {visibleStates.map((st) => (
                          <label key={st} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={selectedStates.includes(st)}
                              onChange={() => toggle(st, selectedStates, setSelectedStates)}
                            />
                            <span>{st}</span>
                          </label>
                        ))}
                        {visibleStates.length === 0 && <div className={subTextClass}>Loading…</div>}
                      </div>
                    </div>

                    {/* Retailer */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className={sectionTitleClass}>Retailer</div>
                        <button
                          onClick={() => setSelectedRetailers([])}
                          className={clearBtnClass}
                          disabled={selectedRetailers.length === 0}
                        >
                          Clear
                        </button>
                      </div>
                      <input
                        value={retailerSearch}
                        onChange={(e) => setRetailerSearch(e.target.value)}
                        placeholder="Search retailers…"
                        className={smallInputClass}
                      />
                      <div className={listClass}>
                        {visibleRetailers.map((r) => (
                          <label key={r} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={selectedRetailers.includes(r)}
                              onChange={() => toggle(r, selectedRetailers, setSelectedRetailers)}
                            />
                            <span>{r}</span>
                          </label>
                        ))}
                        {visibleRetailers.length === 0 && <div className={subTextClass}>Loading…</div>}
                      </div>
                    </div>

                    {/* Category */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className={sectionTitleClass}>Category</div>
                        <button
                          onClick={() => setSelectedCategories([])}
                          className={clearBtnClass}
                          disabled={selectedCategories.length === 0}
                        >
                          Clear
                        </button>
                      </div>
                      <input
                        value={categorySearch}
                        onChange={(e) => setCategorySearch(e.target.value)}
                        placeholder="Search categories…"
                        className={smallInputClass}
                      />
                      <div className={listClass}>
                        {visibleCategories.map((c) => (
                          <label key={c} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={selectedCategories.includes(c)}
                              onChange={() => toggle(c, selectedCategories, setSelectedCategories)}
                            />
                            <span>{c}</span>
                          </label>
                        ))}
                        {visibleCategories.length === 0 && <div className={subTextClass}>Loading…</div>}
                      </div>
                    </div>

                    {/* Supplier */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className={sectionTitleClass}>Supplier</div>
                        <button
                          onClick={() => setSelectedSuppliers([])}
                          className={clearBtnClass}
                          disabled={selectedSuppliers.length === 0}
                        >
                          Clear
                        </button>
                      </div>
                      <input
                        value={supplierSearch}
                        onChange={(e) => setSupplierSearch(e.target.value)}
                        placeholder="Search suppliers…"
                        className={smallInputClass}
                      />
                      <div className={listClass}>
                        {visibleSuppliers.map((sp) => (
                          <label key={sp} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={selectedSuppliers.includes(sp)}
                              onChange={() => toggle(sp, selectedSuppliers, setSelectedSuppliers)}
                            />
                            <span>{sp}</span>
                          </label>
                        ))}
                        {visibleSuppliers.length === 0 && <div className={subTextClass}>Loading…</div>}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* TRIP BUILDER */}
              <div className={sectionShellClass}>
                <SectionHeader
                  title="Trip Builder"
                  k={sectionKey("Trip Builder")}
                  right={
                    <button onClick={clearTrip} className={clearBtnClass} disabled={tripStops.length === 0}>
                      Clear Trip
                    </button>
                  }
                />
                {!collapsed[sectionKey("Trip Builder")] && (
                  <div className="space-y-2 mt-3">
                    {tripStops.map((st, idx) => (
                      <div key={st.id} className={innerTileClass}>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className={`${tileTitleClass} !text-sm`}>
                              {idx + 1}. {st.label}
                            </div>
                            <div className={tanSubTextClass}>
                              {(st.city || "") + (st.city ? ", " : "")}
                              {st.state || ""}
                              {st.zip ? ` ${st.zip}` : ""}
                              {st.kind ? ` • ${st.kind}` : ""}
                            </div>
                          </div>
                          <div className="flex flex-col gap-2">
                            <div className="flex gap-2 justify-end">
                              <button onClick={() => zoomStop(st)} className={clearBtnClass}>
                                Zoom
                              </button>
                              <button onClick={() => removeStop(st.id)} className={clearBtnClass}>
                                Remove
                              </button>
                            </div>
                            <div className="flex gap-2 justify-end">
                              <button
                                onClick={() => moveStop(idx, -1)}
                                className={clearBtnClass}
                                disabled={idx === 0}
                                title="Move up"
                              >
                                ↑
                              </button>
                              <button
                                onClick={() => moveStop(idx, 1)}
                                className={clearBtnClass}
                                disabled={idx === tripStops.length - 1}
                                title="Move down"
                              >
                                ↓
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}

                    {tripStops.length === 0 && (
                      <div className={tanSubTextClass}>
                        Add stops from map popups (“Add to Trip”) or from “Find a Stop”.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* RETAIL SUMMARY - TRIP STOPS */}
              <div className={sectionShellClass}>
                <SectionHeader title="Retail Summary - Trip Stops" k={sectionKey("Retail Summary - Trip Stops")} />
                {!collapsed[sectionKey("Retail Summary - Trip Stops")] && (
                  <div className="space-y-2 mt-3">
                    {tripRetailerSummary.slice(0, 80).map((row) => (
                      <div key={row.retailer} className={innerTileClass}>
                        <div className="flex items-center justify-between gap-2">
                          <div className={tileTitleClass}>{row.retailer}</div>
                          <div className="text-xs text-white/75 whitespace-nowrap">
                            Trip: {row.tripStops} • Total: {row.totalLocations}
                          </div>
                        </div>

                        <div className="text-xs text-white/80 mt-2 space-y-1">
                          <div>
                            <span className="font-extrabold text-white/90">Agronomy locations:</span>{" "}
                            {row.agronomyLocations}
                          </div>
                          <div>
                            <span className="font-extrabold text-white/90">States:</span> {row.states.join(", ") || "—"}
                          </div>
                          <div>
                            <span className="font-extrabold text-white/90">Category breakdown:</span>{" "}
                            {row.categoryBreakdown.join(", ") || "—"}
                          </div>
                          <div>
                            <span className="font-extrabold text-white/90">Suppliers:</span>{" "}
                            {row.suppliers.join(", ") || "—"}
                          </div>
                        </div>
                      </div>
                    ))}
                    {tripRetailerSummary.length === 0 && <div className={subTextClass}>No trip stops yet.</div>}
                  </div>
                )}
              </div>

              {/* RETAIL SUMMARY - NETWORK */}
              <div className={sectionShellClass}>
                <SectionHeader title="Retail Summary - Network" k={sectionKey("Retail Summary - Network")} />
                {!collapsed[sectionKey("Retail Summary - Network")] && (
                  <div className="space-y-2 mt-3">
                    <input
                      value={networkRetailerSearch}
                      onChange={(e) => setNetworkRetailerSearch(e.target.value)}
                      placeholder="Search retailer name (network)…"
                      className={smallInputClass}
                    />

                    <div className={tanSubTextClass}>
                      Computed from <span className="text-white/90 font-semibold">retailers.geojson</span> (true
                      location footprint).
                    </div>

                    <div className="space-y-2">
                      {visibleNetworkRows.map((r) => (
                        <div key={r.retailer} className={innerTileClass}>
                          <div className="flex items-center justify-between gap-2">
                            <div className={tileTitleClass}>{r.retailer}</div>
                            <div className="text-xs text-white/75 whitespace-nowrap">
                              Total: {r.totalLocations} • Agronomy: {r.agronomyLocations}
                            </div>
                          </div>

                          <div className="text-xs text-white/80 mt-2 space-y-1">
                            <div>
                              <span className="font-extrabold text-white/90">States:</span> {r.states.join(", ") || "—"}
                            </div>
                            <div>
                              <span className="font-extrabold text-white/90">Category breakdown:</span>{" "}
                              {r.categoryCounts?.length
                                ? r.categoryCounts.map((c) => `${c.category} (${c.count})`).join(", ")
                                : "—"}
                            </div>
                          </div>
                        </div>
                      ))}

                      {retailerNetworkSummary.length === 0 && <div className={subTextClass}>Network summary not loaded yet.</div>}
                      {retailerNetworkSummary.length > 0 && visibleNetworkRows.length === 0 && (
                        <div className={subTextClass}>No retailer matches that search.</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Diagnostics (theme/token moved here) */}
              <div className="text-[11px] text-white/65">
                Loaded: {allStops.length} stops • Trip: {tripStops.length} • Theme: SIDEBAR BLUE GLASS • Token:{" "}
                <span className={token ? "text-green-400 font-semibold" : "text-red-400 font-semibold"}>
                  {token ? "OK" : "MISSING"}
                </span>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
