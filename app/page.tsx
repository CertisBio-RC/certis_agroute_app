"use client";

import { useMemo, useState } from "react";
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

  const token = useMemo(() => (process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "").trim(), []);

  // ✅ BasePath helper (GitHub Pages safe, but works in dev)
  const basePath = useMemo(() => {
    const env = (process.env.NEXT_PUBLIC_BASE_PATH || "").trim();
    // If env is set, trust it. Otherwise: prod assumes gh-pages path; dev uses "".
    if (env) return env;
    return process.env.NODE_ENV === "production" ? "/certis_agroute_app" : "";
  }, []);

  const asset = (p: string) => `${basePath}${p.startsWith("/") ? p : `/${p}`}`;

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

  // ✅ Stop search results (ranked + token-aware using real Stop fields from CertisMap.tsx)
  const stopResults = useMemo(() => {
    const qRaw = stopSearch.trim();
    if (!qRaw) return allStops.slice(0, 30);

    const q = qRaw.toLowerCase();
    const qTokens = q
      .split(/\s+/g)
      .map((t) => t.trim())
      .filter(Boolean);

    const toWords = (v: string) => v.split(/[^a-z0-9]+/g).filter(Boolean);

    const scoreField = (value: string | undefined, weight: number) => {
      const v = (value || "").toLowerCase().trim();
      if (!v) return 0;

      let s = 0;

      if (v === q) s += 50 * weight;
      if (v.startsWith(q)) s += 28 * weight;

      const words = toWords(v);
      if (words.includes(q)) s += 20 * weight;

      if (v.includes(q)) s += 10 * weight;

      if (qTokens.length >= 2) {
        const hits = qTokens.filter((t) => t && v.includes(t)).length;
        if (hits > 0) s += hits * 6 * weight;
        if (hits === qTokens.length) s += 22 * weight;
      }

      return s;
    };

    const scorePhone = (value: string | undefined, weight: number) => {
      const digitsQ = q.replace(/[^0-9]/g, "");
      if (digitsQ.length < 3) return 0;
      const digitsV = String(value || "").replace(/[^0-9]/g, "");
      if (!digitsV) return 0;

      if (digitsV === digitsQ) return 40 * weight;
      if (digitsV.startsWith(digitsQ)) return 26 * weight;
      if (digitsV.includes(digitsQ)) return 14 * weight;
      return 0;
    };

    const scoreKind = (kind: string | undefined, weight: number) => {
      const k = (kind || "").toLowerCase();
      if (!k) return 0;
      if (k === q) return 16 * weight;
      if (qTokens.length > 0 && qTokens.some((t) => t && k === t)) return 12 * weight;
      if (k.includes(q)) return 6 * weight;
      return 0;
    };

    const meaningful = q.length >= 3;

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

        const catScore = scoreField(st.category || "", 1);
        const supScore = scoreField(st.suppliers || "", 1);
        const kindScore = scoreKind(st.kind, 1);

        const hay = `${st.label} ${st.retailer || ""} ${st.name || ""} ${st.address || ""} ${st.city || ""} ${
          st.state || ""
        } ${st.zip || ""} ${st.category || ""} ${st.suppliers || ""} ${st.email || ""} ${
          st.phoneOffice || ""
        } ${st.phoneCell || ""} ${st.kind || ""}`.toLowerCase();
        const hayScore = hay.includes(q) ? 2 : 0;

        const primaryTotal =
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

        if (meaningful && primaryTotal <= 0) return null;

        const total = primaryTotal + catScore + supScore + kindScore + hayScore;
        if (total <= 0) return null;

        const inTrip = tripStops.some((x) => x.id === st.id);
        const tripPenalty = inTrip ? -2 : 0;

        return { st, score: total + tripPenalty };
      })
      .filter(Boolean) as { st: Stop; score: number }[];

    scored.sort((a, b) => b.score - a.score);
    return scored.map((x) => x.st).slice(0, 50);
  }, [allStops, stopSearch, tripStops]);

  // ✅ Retailer summary based on TRIP STOPS
  const tripRetailerSummary = useMemo<RetailerSummaryRow[]>(() => {
    const acc: Record<string, { count: number; suppliers: Set<string>; categories: Set<string>; states: Set<string> }> =
      {};

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

  // Styling helpers (NO giant black shells)
  const panelClass = "rounded-xl border border-white/10 bg-transparent";
  const innerTileClass = "rounded-lg border border-white/10 bg-black/20 p-2";
  const sidebarListClass =
    "max-h-52 overflow-y-auto pr-1 space-y-1 rounded-lg border border-white/10 bg-black/15 p-2";
  const sectionTitleClass = "text-sm font-semibold tracking-wide text-white/90";
  const clearBtnClass =
    "text-xs px-2 py-1 rounded-md border border-white/15 hover:border-white/30 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed";
  const smallInputClass =
    "w-full rounded-lg bg-black/15 border border-white/15 px-3 py-2 text-sm outline-none focus:border-white/30";

  return (
    <div className="min-h-screen w-full text-white flex flex-col">
      {/* HEADER */}
      <header className="w-full border-b border-white/10">
        <div className="px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* ✅ Correct logo path + basePath-safe */}
            <img
              src={asset("/icons/certis-logo.png")}
              alt="Certis Biologicals"
              className="h-10 w-auto"
              draggable={false}
              onError={(e) => {
                // Fail loudly in console if path is wrong (helps avoid “silent missing logo”)
                // eslint-disable-next-line no-console
                console.warn("[Page] Logo failed to load:", asset("/icons/certis-logo.png"));
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          </div>

          <div className="flex items-center gap-4 ml-auto">
            <div className="text-yellow-400 font-extrabold tracking-wide text-lg sm:text-xl text-right">
              CERTIS AgRoute Database
            </div>
            <div className="text-xs text-white/60 whitespace-nowrap">
              Token:{" "}
              <span className={token ? "text-green-400 font-semibold" : "text-red-400 font-semibold"}>
                {token ? "OK" : "MISSING"}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* BODY */}
      <div className="p-3 flex-1 min-h-0">
        {/* ✅ This grid needs a real height: use flex-1/min-h-0 wrapper */}
        <div className="grid grid-cols-[380px_1fr] gap-3 h-full min-h-0">
          {/* SIDEBAR */}
          {/* ✅ Critical: apply `.sidebar` so globals.css controls internal scrolling + height */}
          <aside className={`${panelClass} sidebar overflow-hidden flex flex-col`}>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-6 min-h-0">
              {/* HOME ZIP */}
              <div className="space-y-2">
                <div className={sectionTitleClass}>Home ZIP</div>
                <div className="flex gap-2">
                  <input
                    value={homeZip}
                    onChange={(e) => setHomeZip(e.target.value)}
                    placeholder="e.g., 50010"
                    className={smallInputClass}
                  />
                  <button
                    onClick={setHomeFromZip}
                    className="rounded-lg px-3 py-2 text-sm font-semibold bg-[#facc15] text-black hover:bg-[#facc15]/90"
                    disabled={!homeZip.trim() || !token}
                    title={!token ? "Missing NEXT_PUBLIC_MAPBOX_TOKEN" : ""}
                  >
                    Set
                  </button>
                  <button onClick={clearHome} className={clearBtnClass} disabled={!homeZip && !homeCoords}>
                    Clear
                  </button>
                </div>

                {homeStatus && <div className="text-xs text-white/80">{homeStatus}</div>}

                <div className="text-xs text-white/60">Home marker (Blue_Home.png). ZIP geocoded via Mapbox.</div>
              </div>

              {/* STOP SEARCH */}
              <div className="space-y-2">
                <div className={sectionTitleClass}>Find a Stop</div>
                <input
                  value={stopSearch}
                  onChange={(e) => setStopSearch(e.target.value)}
                  placeholder="Search by retailer, city, state, name, contact…"
                  className={smallInputClass}
                />
                <div className="text-xs text-white/60">
                  Quick-add a stop without hunting on the map. (Loaded stops: {allStops.length})
                </div>

                <div className="max-h-64 overflow-y-auto space-y-2 rounded-lg border border-white/10 bg-black/15 p-2">
                  {stopResults.map((st) => {
                    const inTrip = tripStops.some((x) => x.id === st.id);
                    return (
                      <div key={st.id} className={innerTileClass}>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-sm font-semibold leading-tight">{st.label}</div>
                            <div className="text-xs text-white/70">
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
                              className="text-xs px-2 py-1 rounded-md bg-[#facc15] text-black font-semibold hover:bg-[#facc15]/90 disabled:opacity-50"
                              disabled={inTrip}
                            >
                              {inTrip ? "Added" : "Add"}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {stopResults.length === 0 && <div className="text-xs text-white/60">No matches.</div>}
                </div>
              </div>

              {/* FILTERS HEADER */}
              <div className="flex items-center justify-between">
                <div className={sectionTitleClass}>Filters</div>
                <div className="flex gap-2">
                  <button onClick={clearAllFilters} className={clearBtnClass} disabled={!hasAnyFilters}>
                    Clear All
                  </button>
                </div>
              </div>

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
                  {visibleStates.length === 0 && <div className="text-xs text-white/60">Loading…</div>}
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
                  {visibleRetailers.length === 0 && <div className="text-xs text-white/60">Loading…</div>}
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
                  {visibleCategories.length === 0 && <div className="text-xs text-white/60">Loading…</div>}
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
                  {visibleSuppliers.length === 0 && <div className="text-xs text-white/60">Loading…</div>}
                </div>
              </div>

              {/* TRIP BUILDER */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className={sectionTitleClass}>Trip Builder</div>
                  <button onClick={clearTrip} className={clearBtnClass} disabled={tripStops.length === 0}>
                    Clear Trip
                  </button>
                </div>

                <div className="space-y-2">
                  {tripStops.map((st, idx) => (
                    <div key={st.id} className={innerTileClass}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold">
                            {idx + 1}. {st.label}
                          </div>
                          <div className="text-xs text-white/70">
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
                    <div className="text-xs text-white/60">
                      Add stops from map popups (“Add to Trip”) or from “Find a Stop”.
                    </div>
                  )}
                </div>
              </div>

              {/* SUMMARY */}
              <div className="space-y-2">
                <div className={sectionTitleClass}>Retailer Summary (Trip Stops)</div>
                <div className="space-y-2">
                  {tripRetailerSummary.slice(0, 60).map((row) => (
                    <div key={row.retailer} className={innerTileClass}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold">{row.retailer}</div>
                        <div className="text-xs text-white/70 whitespace-nowrap">{row.count} stops</div>
                      </div>
                      <div className="text-xs text-white/70 mt-1 space-y-1">
                        <div>
                          <span className="font-semibold text-white/80">States:</span> {row.states.join(", ") || "—"}
                        </div>
                        <div>
                          <span className="font-semibold text-white/80">Categories:</span>{" "}
                          {row.categories.join(", ") || "—"}
                        </div>
                        <div>
                          <span className="font-semibold text-white/80">Suppliers:</span>{" "}
                          {row.suppliers.join(", ") || "—"}
                        </div>
                      </div>
                    </div>
                  ))}
                  {tripRetailerSummary.length === 0 && <div className="text-xs text-white/60">No trip stops yet.</div>}
                </div>
              </div>

              {/* Diagnostics */}
              <div className="text-[11px] text-white/50">Loaded: {allStops.length} stops • Trip: {tripStops.length}</div>
            </div>
          </aside>

          {/* MAP */}
          {/* ✅ Critical: apply `.map-container` so globals.css locks height */}
          <main className={`${panelClass} map-container overflow-hidden`}>
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
