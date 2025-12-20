"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import CertisMap, { Stop, RetailerSummaryRow } from "../components/CertisMap";

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

type CollapsibleSectionProps = {
  title: string;
  defaultOpen?: boolean;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
};

function CollapsibleSection({ title, defaultOpen = true, rightSlot, children }: CollapsibleSectionProps) {
  const [open, setOpen] = useState<boolean>(defaultOpen);

  const headerTextClass =
    "font-extrabold tracking-wide text-sm md:text-[13px] " +
    "text-black dark:text-yellow-400";

  const borderClass = "border border-black/10 dark:border-white/15";
  const bgClass = "bg-white/70 dark:bg-black/20 backdrop-blur-md";
  const panelShadow = "shadow-[0_18px_36px_rgba(0,0,0,0.25)]";

  return (
    <section className={`rounded-2xl ${borderClass} ${bgClass} ${panelShadow}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <span className={headerTextClass}>{title}</span>
          <span className="text-xs text-black/50 dark:text-white/50">{open ? "▾" : "▸"}</span>
        </div>

        <div className="flex items-center gap-2">
          {rightSlot}
          <span className="text-[11px] px-2 py-1 rounded-lg border border-black/10 dark:border-white/15 text-black/60 dark:text-white/60">
            {open ? "Collapse" : "Expand"}
          </span>
        </div>
      </button>

      {open && <div className="px-4 pb-4">{children}</div>}
    </section>
  );
}

export default function Page() {
  // Options loaded from map
  const [states, setStates] = useState<string[]>([]);
  const [retailers, setRetailers] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [suppliers, setSuppliers] = useState<string[]>([]);

  // Selection state
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedRetailers, setSelectedRetailers] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);

  // Home ZIP
  const [homeZip, setHomeZip] = useState<string>("");
  const [homeCoords, setHomeCoords] = useState<[number, number] | null>(null);
  const [homeStatus, setHomeStatus] = useState<string>("");

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

  // Collapsible subsections (Filters)
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [stateOpen, setStateOpen] = useState(true);
  const [retailerOpen, setRetailerOpen] = useState(true);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [supplierOpen, setSupplierOpen] = useState(false);

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

  // Stop search results
  const stopResults = useMemo(() => {
    const qRaw = stopSearch.trim();
    if (!qRaw) return allStops.slice(0, 30);

    const qLower = qRaw.toLowerCase();

    if (qRaw.length < 3) {
      const quick = allStops.filter((st) => {
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
        ]
          .filter(Boolean)
          .map((x) => String(x).toLowerCase());

        return fields.some((f) => f.includes(qLower));
      });

      return quick.slice(0, 50);
    }

    const qTokens = qLower
      .split(/\s+/g)
      .map((t) => t.trim())
      .filter(Boolean);

    const toWords = (v: string) => v.split(/[^a-z0-9]+/g).filter(Boolean);

    const scoreField = (value: string | undefined, weight: number) => {
      const v = (value || "").toLowerCase().trim();
      if (!v) return 0;

      let s0 = 0;

      if (v === qLower) s0 += 50 * weight;
      if (v.startsWith(qLower)) s0 += 28 * weight;

      const words = toWords(v);
      if (words.includes(qLower)) s0 += 20 * weight;

      if (v.includes(qLower)) s0 += 10 * weight;

      if (qTokens.length >= 2) {
        const hits = qTokens.filter((t) => t && v.includes(t)).length;
        if (hits > 0) s0 += hits * 6 * weight;
        if (hits === qTokens.length) s0 += 22 * weight;
      }

      return s0;
    };

    const scorePhone = (value: string | undefined, weight: number) => {
      const digitsQ = qLower.replace(/[^0-9]/g, "");
      if (digitsQ.length < 3) return 0;
      const digitsV = String(value || "").replace(/[^0-9]/g, "");
      if (!digitsV) return 0;

      if (digitsV === digitsQ) return 40 * weight;
      if (digitsV.startsWith(digitsQ)) return 26 * weight;
      if (digitsV.includes(digitsQ)) return 14 * weight;
      return 0;
    };

    const scored = allStops
      .map((st) => {
        const labelScore = scoreField(st.label, 4);
        const retailerScore = scoreField(st.retailer || "", 3);
        const nameScore = scoreField(st.name || "", 3);
        const cityScore = scoreField(st.city || "", 2);
        const stateScore = scoreField(st.state || "", 2);
        const zipScore = scoreField(st.zip || "", 3);
        const addressScore = scoreField(st.address || "", 1);

        const emailScore = scoreField(st.email || "", 3);
        const officeScore = scorePhone(st.phoneOffice || "", 3);
        const cellScore = scorePhone(st.phoneCell || "", 3);

        const total =
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

        if (total <= 0) return null;

        const inTrip = tripStops.some((x) => x.id === st.id);
        const tripPenalty = inTrip ? -2 : 0;

        return { st, score: total + tripPenalty };
      })
      .filter(Boolean) as { st: Stop; score: number }[];

    scored.sort((a, b) => b.score - a.score);
    return scored.map((x) => x.st).slice(0, 50);
  }, [allStops, stopSearch, tripStops]);

  // Retailer summary based on TRIP STOPS
  const tripRetailerSummary = useMemo<RetailerSummaryRow[]>(() => {
    const acc: Record<
      string,
      { count: number; suppliers: Set<string>; categories: Set<string>; states: Set<string> }
    > = {};

    for (const st of tripStops) {
      const retailer = (st.retailer || "").trim() || "Unknown Retailer";
      if (!acc[retailer]) {
        acc[retailer] = { count: 0, suppliers: new Set(), categories: new Set(), states: new Set() };
      }
      acc[retailer].count += 1;

      splitMulti(st.suppliers).forEach((x) => acc[retailer].suppliers.add(x));
      splitCategories(st.category).forEach((x) => acc[retailer].categories.add(x));
      if (st.state) acc[retailer].states.add(st.state);
    }

    return Object.entries(acc)
      .map(([retailer, v]) => ({
        retailer,
        count: v.count,
        suppliers: Array.from(v.suppliers).sort(),
        categories: Array.from(v.categories).sort(),
        states: Array.from(v.states).sort(),
      }))
      .sort((a, b) => b.count - a.count);
  }, [tripStops]);

  // Updated tile styles (clear borders + yellow headings)
  const panelClass =
    "rounded-2xl border border-black/10 dark:border-white/15 bg-white/60 dark:bg-black/20 backdrop-blur-md shadow-[0_20px_40px_rgba(0,0,0,0.25)]";
  const innerTileClass =
    "rounded-xl border border-black/10 dark:border-white/15 bg-white/70 dark:bg-black/25 backdrop-blur-sm p-3 shadow-[0_10px_18px_rgba(0,0,0,0.25)]";
  const sidebarListClass =
    "max-h-52 overflow-y-auto pr-1 space-y-1 rounded-xl border border-black/10 dark:border-white/15 bg-white/60 dark:bg-black/20 backdrop-blur-sm p-2";

  const tileTitleClass = "text-sm font-extrabold leading-tight text-black dark:text-yellow-400";
  const subTextClass = "text-xs text-black/60 dark:text-white/70";

  const clearBtnClass =
    "text-xs px-2 py-1 rounded-lg border border-black/10 dark:border-white/15 hover:border-black/20 dark:hover:border-white/30 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed";
  const smallInputClass =
    "w-full rounded-xl bg-white/70 dark:bg-black/20 border border-black/10 dark:border-white/15 px-3 py-2 text-sm text-black dark:text-white outline-none focus:border-black/20 dark:focus:border-white/30";

  const miniSectionHeader =
    "flex items-center justify-between rounded-xl border border-black/10 dark:border-white/15 bg-white/60 dark:bg-black/15 px-3 py-2";

  const miniSectionTitle = "text-sm font-extrabold text-black dark:text-yellow-400";

  return (
    <div className="min-h-screen w-full text-black dark:text-white flex flex-col bg-[#f4f4f5] dark:bg-[#070a12]">
      {/* HEADER */}
      <header className="w-full border-b border-black/10 dark:border-white/10 bg-white/60 dark:bg-black/10 backdrop-blur-md flex-shrink-0">
        <div className="px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Image
              src={`${basePath}/icons/certis-logo.png`}
              alt="Certis Biologicals"
              width={220}
              height={72}
              className="h-16 sm:h-18 w-auto drop-shadow-[0_8px_16px_rgba(0,0,0,0.35)] select-none"
              draggable={false}
              priority
            />
          </div>

          <div className="flex flex-col items-end gap-1 ml-auto">
            <div className="text-yellow-500 dark:text-yellow-400 font-extrabold tracking-wide text-lg sm:text-xl text-right">
              CERTIS AgRoute Database
            </div>

            <div className="text-xs text-black/60 dark:text-white/60 whitespace-nowrap">
              Token:{" "}
              <span className={token ? "text-green-600 dark:text-green-400 font-semibold" : "text-red-600 dark:text-red-400 font-semibold"}>
                {token ? "OK" : "MISSING"}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* BODY */}
      <div className="flex-1 min-h-0 p-3">
        <div className="h-full min-h-0 flex flex-col md:grid md:grid-cols-[380px_1fr] gap-3">
          {/* SIDEBAR */}
          <aside className={`${panelClass} sidebar min-h-0 md:h-full`}>
            <div className="overflow-y-auto px-4 py-4 space-y-4">
              {/* HOME ZIP */}
              <CollapsibleSection title="Home ZIP" defaultOpen>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      value={homeZip}
                      onChange={(e) => setHomeZip(e.target.value)}
                      placeholder="e.g., 50010"
                      className={smallInputClass}
                    />
                    <button
                      onClick={setHomeFromZip}
                      className="rounded-xl px-3 py-2 text-sm font-extrabold bg-[#facc15] text-black hover:bg-[#facc15]/90 disabled:opacity-50"
                      disabled={!homeZip.trim() || !token}
                      title={!token ? "Missing NEXT_PUBLIC_MAPBOX_TOKEN" : ""}
                    >
                      Set
                    </button>
                    <button onClick={clearHome} className={clearBtnClass} disabled={!homeZip && !homeCoords}>
                      Clear
                    </button>
                  </div>

                  {homeStatus && <div className="text-xs text-yellow-600 dark:text-yellow-400 font-semibold">{homeStatus}</div>}

                  <div className={subTextClass}>Home marker (Blue_Home.png). ZIP geocoded via Mapbox.</div>
                </div>
              </CollapsibleSection>

              {/* STOP SEARCH */}
              <CollapsibleSection
                title="Find a Stop"
                defaultOpen
                rightSlot={<div className="text-xs text-black/50 dark:text-white/50">Loaded: {allStops.length}</div>}
              >
                <div className="space-y-2">
                  <input
                    value={stopSearch}
                    onChange={(e) => setStopSearch(e.target.value)}
                    placeholder="Search by retailer, city, state, name, contact…"
                    className={smallInputClass}
                  />
                  <div className={subTextClass}>Quick-add without hunting on the map.</div>

                  <div className="max-h-64 overflow-y-auto space-y-2 rounded-xl border border-black/10 dark:border-white/15 bg-white/60 dark:bg-black/20 backdrop-blur-sm p-2">
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
                    {stopResults.length === 0 && <div className="text-xs text-black/50 dark:text-white/60">No matches.</div>}
                  </div>
                </div>
              </CollapsibleSection>

              {/* FILTERS (master collapsible + nested collapsibles) */}
              <section className={`${panelClass} p-0`}>
                <div className="px-4 py-3 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setFiltersOpen((v) => !v)}
                    className="flex items-center gap-2"
                    aria-expanded={filtersOpen}
                  >
                    <div className="font-extrabold tracking-wide text-sm text-black dark:text-yellow-400">Filters</div>
                    <div className="text-xs text-black/50 dark:text-white/50">{filtersOpen ? "▾" : "▸"}</div>
                  </button>

                  <div className="flex items-center gap-2">
                    <button onClick={clearAllFilters} className={clearBtnClass} disabled={!hasAnyFilters}>
                      Clear All
                    </button>
                  </div>
                </div>

                {filtersOpen && (
                  <div className="px-4 pb-4 space-y-3">
                    {/* State */}
                    <div className="space-y-2">
                      <div className={miniSectionHeader}>
                        <button
                          type="button"
                          onClick={() => setStateOpen((v) => !v)}
                          className="flex items-center gap-2"
                          aria-expanded={stateOpen}
                        >
                          <div className={miniSectionTitle}>State</div>
                          <div className="text-xs text-black/50 dark:text-white/50">{stateOpen ? "▾" : "▸"}</div>
                        </button>

                        <button onClick={() => setSelectedStates([])} className={clearBtnClass} disabled={selectedStates.length === 0}>
                          Clear
                        </button>
                      </div>

                      {stateOpen && (
                        <>
                          <input
                            value={stateSearch}
                            onChange={(e) => setStateSearch(e.target.value)}
                            placeholder="Search states…"
                            className={smallInputClass}
                          />
                          <div className={sidebarListClass}>
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
                            {visibleStates.length === 0 && <div className="text-xs text-black/50 dark:text-white/60">Loading…</div>}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Retailer */}
                    <div className="space-y-2">
                      <div className={miniSectionHeader}>
                        <button
                          type="button"
                          onClick={() => setRetailerOpen((v) => !v)}
                          className="flex items-center gap-2"
                          aria-expanded={retailerOpen}
                        >
                          <div className={miniSectionTitle}>Retailer</div>
                          <div className="text-xs text-black/50 dark:text-white/50">{retailerOpen ? "▾" : "▸"}</div>
                        </button>

                        <button
                          onClick={() => setSelectedRetailers([])}
                          className={clearBtnClass}
                          disabled={selectedRetailers.length === 0}
                        >
                          Clear
                        </button>
                      </div>

                      {retailerOpen && (
                        <>
                          <input
                            value={retailerSearch}
                            onChange={(e) => setRetailerSearch(e.target.value)}
                            placeholder="Search retailers…"
                            className={smallInputClass}
                          />
                          <div className={sidebarListClass}>
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
                            {visibleRetailers.length === 0 && <div className="text-xs text-black/50 dark:text-white/60">Loading…</div>}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Category */}
                    <div className="space-y-2">
                      <div className={miniSectionHeader}>
                        <button
                          type="button"
                          onClick={() => setCategoryOpen((v) => !v)}
                          className="flex items-center gap-2"
                          aria-expanded={categoryOpen}
                        >
                          <div className={miniSectionTitle}>Category</div>
                          <div className="text-xs text-black/50 dark:text-white/50">{categoryOpen ? "▾" : "▸"}</div>
                        </button>

                        <button
                          onClick={() => setSelectedCategories([])}
                          className={clearBtnClass}
                          disabled={selectedCategories.length === 0}
                        >
                          Clear
                        </button>
                      </div>

                      {categoryOpen && (
                        <>
                          <input
                            value={categorySearch}
                            onChange={(e) => setCategorySearch(e.target.value)}
                            placeholder="Search categories…"
                            className={smallInputClass}
                          />
                          <div className={sidebarListClass}>
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
                            {visibleCategories.length === 0 && <div className="text-xs text-black/50 dark:text-white/60">Loading…</div>}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Supplier */}
                    <div className="space-y-2">
                      <div className={miniSectionHeader}>
                        <button
                          type="button"
                          onClick={() => setSupplierOpen((v) => !v)}
                          className="flex items-center gap-2"
                          aria-expanded={supplierOpen}
                        >
                          <div className={miniSectionTitle}>Supplier</div>
                          <div className="text-xs text-black/50 dark:text-white/50">{supplierOpen ? "▾" : "▸"}</div>
                        </button>

                        <button
                          onClick={() => setSelectedSuppliers([])}
                          className={clearBtnClass}
                          disabled={selectedSuppliers.length === 0}
                        >
                          Clear
                        </button>
                      </div>

                      {supplierOpen && (
                        <>
                          <input
                            value={supplierSearch}
                            onChange={(e) => setSupplierSearch(e.target.value)}
                            placeholder="Search suppliers…"
                            className={smallInputClass}
                          />
                          <div className={sidebarListClass}>
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
                            {visibleSuppliers.length === 0 && <div className="text-xs text-black/50 dark:text-white/60">Loading…</div>}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </section>

              {/* TRIP BUILDER */}
              <CollapsibleSection
                title="Trip Builder"
                defaultOpen
                rightSlot={
                  <button onClick={clearTrip} className={clearBtnClass} disabled={tripStops.length === 0}>
                    Clear Trip
                  </button>
                }
              >
                <div className="space-y-2">
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
                    <div className="text-xs text-black/50 dark:text-white/60">
                      Add stops from map popups (“Add to Trip”) or from “Find a Stop”.
                    </div>
                  )}
                </div>
              </CollapsibleSection>

              {/* SUMMARY */}
              <CollapsibleSection title="Retailer Summary (Trip Stops)" defaultOpen={false}>
                <div className="space-y-2">
                  {tripRetailerSummary.slice(0, 60).map((row) => (
                    <div key={row.retailer} className={innerTileClass}>
                      <div className="flex items-center justify-between gap-2">
                        <div className={tileTitleClass}>{row.retailer}</div>
                        <div className="text-xs text-black/60 dark:text-white/70 whitespace-nowrap">{row.count} stops</div>
                      </div>
                      <div className="text-xs text-black/60 dark:text-white/70 mt-1 space-y-1">
                        <div>
                          <span className="font-extrabold text-black/70 dark:text-white/80">States:</span> {row.states.join(", ") || "—"}
                        </div>
                        <div>
                          <span className="font-extrabold text-black/70 dark:text-white/80">Categories:</span>{" "}
                          {row.categories.join(", ") || "—"}
                        </div>
                        <div>
                          <span className="font-extrabold text-black/70 dark:text-white/80">Suppliers:</span>{" "}
                          {row.suppliers.join(", ") || "—"}
                        </div>
                      </div>
                    </div>
                  ))}
                  {tripRetailerSummary.length === 0 && <div className="text-xs text-black/50 dark:text-white/60">No trip stops yet.</div>}
                </div>
              </CollapsibleSection>

              {/* Diagnostics */}
              <CollapsibleSection title="Diagnostics" defaultOpen={false}>
                <div className="text-[11px] text-black/60 dark:text-white/50">
                  Loaded: {allStops.length} stops • Trip: {tripStops.length}
                </div>
              </CollapsibleSection>
            </div>
          </aside>

          {/* MAP */}
          <main className={`${panelClass} overflow-hidden map-container min-h-[50vh] md:min-h-0 md:h-full`}>
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
            />
          </main>
        </div>
      </div>
    </div>
  );
}
