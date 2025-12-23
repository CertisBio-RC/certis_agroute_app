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
  const s = String(raw || "").trim();
  if (!s) return "";
  return s;
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

const UI_THEME_STAMP = "BLUE GLASS v2";

function CaretIcon({ open }: { open: boolean }) {
  return (
    <span aria-hidden className={`inline-flex items-center justify-center transition-transform duration-150 ${open ? "rotate-180" : "rotate-0"}`}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export default function Page() {
  const [states, setStates] = useState<string[]>([]);
  const [retailers, setRetailers] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [suppliers, setSuppliers] = useState<string[]>([]);

  const [retailerNetworkSummary, setRetailerNetworkSummary] = useState<RetailerNetworkSummaryRow[]>([]);
  const [networkRetailerSearch, setNetworkRetailerSearch] = useState<string>("");

  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedRetailers, setSelectedRetailers] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);

  const [homeZip, setHomeZip] = useState<string>("");
  const [homeCoords, setHomeCoords] = useState<[number, number] | null>(null);
  const [homeStatus, setHomeStatus] = useState<string>("");

  const [allStops, setAllStops] = useState<Stop[]>([]);
  const [tripStops, setTripStops] = useState<Stop[]>([]);
  const [zoomToStop, setZoomToStop] = useState<Stop | null>(null);

  const [stateSearch, setStateSearch] = useState("");
  const [retailerSearch, setRetailerSearch] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [stopSearch, setStopSearch] = useState("");

  const [mobileView, setMobileView] = useState<"sidebar" | "map">("sidebar");

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    [sectionKey("Home ZIP")]: true,
    [sectionKey("Find a Stop")]: true,
    [sectionKey("Filters")]: true,
    [sectionKey("State")]: true,
    [sectionKey("Retailer")]: true,
    [sectionKey("Category")]: true,
    [sectionKey("Supplier")]: true,
    [sectionKey("Trip Builder")]: true,
    [sectionKey("Retailer Summary (Trip Stops)")]: true,
    [sectionKey("Retailer Network Summary (All Locations)")]: true,
  });

  const token = useMemo(() => (process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "").trim(), []);
  const basePath = useMemo(() => {
    const bp = (process.env.NEXT_PUBLIC_BASE_PATH || "/certis_agroute_app").trim();
    return bp || "/certis_agroute_app";
  }, []);

  const hasAnyFilters =
    selectedStates.length || selectedRetailers.length || selectedCategories.length || selectedSuppliers.length;

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

  const setHomeFromZip = async () => {
    const z = homeZip.trim();
    if (!z) return;

    try {
      const url =
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(z)}.json` +
        `?country=US&types=postcode&limit=1&access_token=${encodeURIComponent(token)}`;

      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Geocoding failed: ${resp.status}`);
      const json: any = await resp.json();
      const center = json?.features?.[0]?.center;

      if (!Array.isArray(center) || center.length !== 2) throw new Error("No coords returned for ZIP");

      const lng = Number(center[0]);
      const lat = Number(center[1]);

      setHomeCoords([lng, lat]);
      setHomeStatus(`Home Zip Code set to ${z}`);
    } catch (e) {
      console.error("[Page] Home ZIP geocode failed:", e);
      setHomeCoords(null);
      setHomeStatus("Home Zip Code could not be set (geocode failed).");
    }
  };

  const clearHome = () => {
    setHomeZip("");
    setHomeCoords(null);
    setHomeStatus("");
  };

  const toggleSection = (key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

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

  const visibleNetworkRows = useMemo(() => {
    const q = networkRetailerSearch.trim().toLowerCase();
    if (!q) return retailerNetworkSummary.slice(0, 120);
    return retailerNetworkSummary.filter((r) => (r.retailer || "").toLowerCase().includes(q)).slice(0, 120);
  }, [retailerNetworkSummary, networkRetailerSearch]);

  // ===========================
  // ✅ BLUE GLASS v2 (muted)
  // ===========================
  const appBg =
    "bg-[#060b18] " +
    "bg-[radial-gradient(1100px_700px_at_12%_0%,rgba(35,110,255,0.18),transparent_62%)," +
    "radial-gradient(900px_650px_at_92%_18%,rgba(90,80,255,0.10),transparent_60%)," +
    "radial-gradient(850px_600px_at_45%_120%,rgba(0,180,255,0.06),transparent_62%)]";

  const panelClass =
    "rounded-2xl border border-white/10 ring-1 ring-white/5 " +
    "bg-[rgba(7,12,22,0.70)] backdrop-blur-md shadow-[0_22px_55px_rgba(0,0,0,0.70)]";

  const innerTileClass =
    "rounded-xl border border-white/10 ring-1 ring-white/5 " +
    "bg-[linear-gradient(180deg,rgba(18,40,92,0.55),rgba(10,18,34,0.60))] backdrop-blur-sm p-3 " +
    "shadow-[0_12px_26px_rgba(0,0,0,0.55)]";

  const listClass =
    "max-h-52 overflow-y-auto pr-1 space-y-1 rounded-xl border border-white/10 ring-1 ring-white/5 " +
    "bg-[rgba(10,16,28,0.45)] backdrop-blur-sm p-2";

  const stopListClass =
    "max-h-64 overflow-y-auto space-y-2 rounded-xl border border-white/10 ring-1 ring-white/5 " +
    "bg-[rgba(10,16,28,0.45)] backdrop-blur-sm p-2";

  const sectionTitleClass = "text-sm font-extrabold tracking-wide text-yellow-400";
  const tileTitleClass = "text-sm font-extrabold leading-tight text-yellow-400";
  const subTextClass = "text-xs text-[#d2b48c]";

  const clearBtnClass =
    "text-xs px-2 py-1 rounded-lg border border-white/15 hover:border-white/30 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed";

  const smallInputClass =
    "w-full rounded-xl bg-[rgba(255,255,255,0.06)] border border-white/15 ring-1 ring-white/5 " +
    "px-3 py-2 text-sm outline-none focus:border-white/30 focus:ring-white/10 text-white placeholder:text-white/55";

  const sectionShellClass =
    "rounded-2xl border border-white/10 ring-1 ring-white/5 bg-[rgba(10,16,28,0.40)] backdrop-blur-sm px-3 py-3";

  const sectionHeaderRowClass = "flex items-center justify-between gap-2";

  const collapseBtnClass =
    "text-xs px-3 py-1.5 rounded-xl border border-white/15 bg-[rgba(255,255,255,0.05)] hover:bg-white/10 hover:border-white/30";

  const caretClass = "text-yellow-400/90 text-xs";

  const SectionHeader = ({ title, right, k }: { title: string; right?: React.ReactNode; k: string }) => {
    const isCollapsed = !!collapsed[k];
    return (
      <div className={sectionHeaderRowClass}>
        <button type="button" onClick={() => toggleSection(k)} className="flex items-center gap-2" title={isCollapsed ? "Expand" : "Collapse"}>
          <span className={sectionTitleClass}>{title}</span>
          <span className={caretClass}>
            <CaretIcon open={!isCollapsed} />
          </span>
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

  return (
    <div className={`min-h-screen w-full text-white flex flex-col ${appBg}`}>
      <header className="w-full border-b border-white/10 bg-[rgba(7,12,22,0.72)] backdrop-blur-md flex-shrink-0">
        <div className="px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img
              src={`${basePath}/icons/certis-logo.png`}
              alt="Certis Biologicals"
              className="h-14 sm:h-16 w-auto drop-shadow-[0_10px_18px_rgba(0,0,0,0.70)]"
              draggable={false}
            />
          </div>

          <div className="flex items-center gap-4 ml-auto">
            <div className="text-yellow-400 font-extrabold tracking-wide text-lg sm:text-xl text-right">
              CERTIS AgRoute Database
              <div className="text-[11px] font-semibold text-[#d2b48c] tracking-normal">THEME: {UI_THEME_STAMP}</div>
            </div>

            <div className="text-xs text-white/70 whitespace-nowrap">
              Token:{" "}
              <span className={token ? "text-green-300 font-semibold" : "text-red-300 font-semibold"}>
                {token ? "OK" : "MISSING"}
              </span>
            </div>
          </div>
        </div>

        <div className="px-4 pb-3 md:hidden">
          <div className="flex gap-2">
            <button
              type="button"
              className={`flex-1 rounded-xl px-3 py-2 text-sm font-extrabold border ${
                mobileView === "sidebar" ? "bg-yellow-400 text-black border-yellow-300" : "bg-[rgba(255,255,255,0.06)] text-white border-white/15"
              }`}
              onClick={() => setMobileView("sidebar")}
            >
              Sidebar
            </button>
            <button
              type="button"
              className={`flex-1 rounded-xl px-3 py-2 text-sm font-extrabold border ${
                mobileView === "map" ? "bg-yellow-400 text-black border-yellow-300" : "bg-[rgba(255,255,255,0.06)] text-white border-white/15"
              }`}
              onClick={() => setMobileView("map")}
            >
              Map
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 p-3">
        <div className="h-full min-h-0 flex flex-col md:grid md:grid-cols-[380px_1fr] gap-3">
          <aside className={`${panelClass} sidebar min-h-0 md:h-full ${mobileView === "map" ? "hidden md:block" : ""}`}>
            <div className="overflow-y-auto px-4 py-3 space-y-4">
              <div className={sectionShellClass}>
                <SectionHeader title="Home ZIP" k={sectionKey("Home ZIP")} />
                {!collapsed[sectionKey("Home ZIP")] && (
                  <div className="space-y-2 mt-3">
                    <div className="flex gap-2">
                      <input value={homeZip} onChange={(e) => setHomeZip(e.target.value)} placeholder="e.g., 50010" className={smallInputClass} />
                      <button
                        onClick={setHomeFromZip}
                        className="rounded-xl px-3 py-2 text-sm font-extrabold bg-[#facc15] text-black hover:bg-[#facc15]/90 disabled:opacity-60"
                        disabled={!homeZip.trim() || !token}
                        title={!token ? "Missing NEXT_PUBLIC_MAPBOX_TOKEN" : ""}
                      >
                        Set
                      </button>
                      <button onClick={clearHome} className={clearBtnClass} disabled={!homeZip && !homeCoords}>
                        Clear
                      </button>
                    </div>

                    {homeStatus && <div className="text-xs text-yellow-400 font-semibold">{homeStatus}</div>}
                    <div className="text-xs text-white/80">Home marker (Blue_Home.png). ZIP geocoded via Mapbox.</div>
                  </div>
                )}
              </div>

              <div className={sectionShellClass}>
                <SectionHeader
                  title="Find a Stop"
                  k={sectionKey("Find a Stop")}
                  right={<div className="text-[11px] text-white/75 whitespace-nowrap">Loaded: {allStops.length}</div>}
                />
                {!collapsed[sectionKey("Find a Stop")] && (
                  <div className="space-y-2 mt-3">
                    <input
                      value={stopSearch}
                      onChange={(e) => setStopSearch(e.target.value)}
                      placeholder="Search by retailer, city, state, name, contact…"
                      className={smallInputClass}
                    />
                    <div className="text-xs text-white/80">{strictHint}</div>

                    <div className={stopListClass}>
                      {stopResults.map((st) => {
                        const inTrip = tripStops.some((x) => x.id === st.id);
                        return (
                          <div key={st.id} className={innerTileClass}>
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className={tileTitleClass}>{st.label}</div>
                                <div className={subTextClass}>
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
                                  className="text-xs px-2 py-1 rounded-lg bg-[#facc15] text-black font-extrabold hover:bg-[#facc15]/90 disabled:opacity-50"
                                  disabled={inTrip}
                                >
                                  {inTrip ? "Added" : "Add"}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {stopResults.length === 0 && <div className="text-xs text-white/80">No matches.</div>}
                    </div>
                  </div>
                )}
              </div>

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
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className={sectionTitleClass}>State</div>
                        <button onClick={() => setSelectedStates([])} className={clearBtnClass} disabled={selectedStates.length === 0}>
                          Clear
                        </button>
                      </div>
                      <input value={stateSearch} onChange={(e) => setStateSearch(e.target.value)} placeholder="Search states…" className={smallInputClass} />
                      <div className={listClass}>
                        {visibleStates.map((st) => (
                          <label key={st} className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={selectedStates.includes(st)} onChange={() => toggle(st, selectedStates, setSelectedStates)} />
                            <span>{st}</span>
                          </label>
                        ))}
                        {visibleStates.length === 0 && <div className="text-xs text-white/80">Loading…</div>}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className={sectionTitleClass}>Retailer</div>
                        <button onClick={() => setSelectedRetailers([])} className={clearBtnClass} disabled={selectedRetailers.length === 0}>
                          Clear
                        </button>
                      </div>
                      <input value={retailerSearch} onChange={(e) => setRetailerSearch(e.target.value)} placeholder="Search retailers…" className={smallInputClass} />
                      <div className={listClass}>
                        {visibleRetailers.map((r) => (
                          <label key={r} className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={selectedRetailers.includes(r)} onChange={() => toggle(r, selectedRetailers, setSelectedRetailers)} />
                            <span>{r}</span>
                          </label>
                        ))}
                        {visibleRetailers.length === 0 && <div className="text-xs text-white/80">Loading…</div>}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className={sectionTitleClass}>Category</div>
                        <button onClick={() => setSelectedCategories([])} className={clearBtnClass} disabled={selectedCategories.length === 0}>
                          Clear
                        </button>
                      </div>
                      <input value={categorySearch} onChange={(e) => setCategorySearch(e.target.value)} placeholder="Search categories…" className={smallInputClass} />
                      <div className={listClass}>
                        {visibleCategories.map((c) => (
                          <label key={c} className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={selectedCategories.includes(c)} onChange={() => toggle(c, selectedCategories, setSelectedCategories)} />
                            <span>{c}</span>
                          </label>
                        ))}
                        {visibleCategories.length === 0 && <div className="text-xs text-white/80">Loading…</div>}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className={sectionTitleClass}>Supplier</div>
                        <button onClick={() => setSelectedSuppliers([])} className={clearBtnClass} disabled={selectedSuppliers.length === 0}>
                          Clear
                        </button>
                      </div>
                      <input value={supplierSearch} onChange={(e) => setSupplierSearch(e.target.value)} placeholder="Search suppliers…" className={smallInputClass} />
                      <div className={listClass}>
                        {visibleSuppliers.map((sp) => (
                          <label key={sp} className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={selectedSuppliers.includes(sp)} onChange={() => toggle(sp, selectedSuppliers, setSelectedSuppliers)} />
                            <span>{sp}</span>
                          </label>
                        ))}
                        {visibleSuppliers.length === 0 && <div className="text-xs text-white/80">Loading…</div>}
                      </div>
                    </div>
                  </div>
                )}
              </div>

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
                            <div className={subTextClass}>
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
                              <button onClick={() => moveStop(idx, -1)} className={clearBtnClass} disabled={idx === 0} title="Move up">
                                ↑
                              </button>
                              <button onClick={() => moveStop(idx, 1)} className={clearBtnClass} disabled={idx === tripStops.length - 1} title="Move down">
                                ↓
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    {tripStops.length === 0 && <div className="text-xs text-white/85">Add stops from map popups (“Add to Trip”) or from “Find a Stop”.</div>}
                  </div>
                )}
              </div>

              <div className={sectionShellClass}>
                <SectionHeader title="Retailer Summary (Trip Stops)" k={sectionKey("Retailer Summary (Trip Stops)")} />
                {!collapsed[sectionKey("Retailer Summary (Trip Stops)")] && (
                  <div className="space-y-2 mt-3">
                    {tripRetailerSummary.slice(0, 80).map((row) => (
                      <div key={row.retailer} className={innerTileClass}>
                        <div className="flex items-center justify-between gap-2">
                          <div className={tileTitleClass}>{row.retailer}</div>
                          <div className="text-xs text-white/85 whitespace-nowrap">
                            Trip: {row.tripStops} • Total: {row.totalLocations}
                          </div>
                        </div>
                        <div className="text-xs text-white/90 mt-2 space-y-1">
                          <div>
                            <span className="font-extrabold text-white">Agronomy locations:</span> {row.agronomyLocations}
                          </div>
                          <div>
                            <span className="font-extrabold text-white">States:</span> {row.states.join(", ") || "—"}
                          </div>
                          <div>
                            <span className="font-extrabold text-white">Category breakdown:</span> {row.categoryBreakdown.join(", ") || "—"}
                          </div>
                          <div>
                            <span className="font-extrabold text-white">Suppliers:</span> {row.suppliers.join(", ") || "—"}
                          </div>
                        </div>
                      </div>
                    ))}
                    {tripRetailerSummary.length === 0 && <div className="text-xs text-white/85">No trip stops yet.</div>}
                  </div>
                )}
              </div>

              <div className={sectionShellClass}>
                <SectionHeader
                  title="Retailer Network Summary (All Locations)"
                  k={sectionKey("Retailer Network Summary (All Locations)")}
                  right={<div className="text-[11px] text-white/75 whitespace-nowrap">Rows: {retailerNetworkSummary.length}</div>}
                />
                {!collapsed[sectionKey("Retailer Network Summary (All Locations)")] && (
                  <div className="space-y-2 mt-3">
                    <input value={networkRetailerSearch} onChange={(e) => setNetworkRetailerSearch(e.target.value)} placeholder="Search retailer name (network)…" className={smallInputClass} />
                    <div className="text-xs text-white/85">
                      Computed from <span className="text-white font-semibold">retailers.geojson</span> (true footprint).
                    </div>

                    <div className="space-y-2">
                      {visibleNetworkRows.map((r) => (
                        <div key={r.retailer} className={innerTileClass}>
                          <div className="flex items-center justify-between gap-2">
                            <div className={tileTitleClass}>{r.retailer}</div>
                            <div className="text-xs text-white/85 whitespace-nowrap">
                              Total: {r.totalLocations} • Agronomy: {r.agronomyLocations}
                            </div>
                          </div>
                          <div className="text-xs text-white/90 mt-2 space-y-1">
                            <div>
                              <span className="font-extrabold text-white">States:</span> {r.states.join(", ") || "—"}
                            </div>
                            <div>
                              <span className="font-extrabold text-white">Category breakdown:</span>{" "}
                              {r.categoryCounts?.length ? r.categoryCounts.map((c) => `${c.category} (${c.count})`).join(", ") : "—"}
                            </div>
                          </div>
                        </div>
                      ))}

                      {retailerNetworkSummary.length === 0 && <div className="text-xs text-white/85">Network summary not loaded yet.</div>}
                      {retailerNetworkSummary.length > 0 && visibleNetworkRows.length === 0 && <div className="text-xs text-white/85">No retailer matches that search.</div>}
                    </div>
                  </div>
                )}
              </div>

              <div className="text-[11px] text-white/75">
                Loaded: {allStops.length} stops • Trip: {tripStops.length}
              </div>
            </div>
          </aside>

          <main className={`${panelClass} overflow-hidden map-container min-h-[60vh] md:min-h-0 md:h-full ${mobileView === "sidebar" ? "hidden md:block" : ""}`}>
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
        </div>
      </div>
    </div>
  );
}
