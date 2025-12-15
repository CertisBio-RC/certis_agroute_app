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

  // Stops + Trip
  const [allStops, setAllStops] = useState<Stop[]>([]);
  const [tripStops, setTripStops] = useState<Stop[]>([]);
  const [zoomToStop, setZoomToStop] = useState<Stop | null>(null);

  // Summary
  const [retailerSummary, setRetailerSummary] = useState<RetailerSummaryRow[]>([]);

  // Local sidebar search fields
  const [stateSearch, setStateSearch] = useState("");
  const [retailerSearch, setRetailerSearch] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [stopSearch, setStopSearch] = useState("");

  const token = useMemo(() => (process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "").trim(), []);

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

      if (!Array.isArray(center) || center.length !== 2) {
        throw new Error("No coords returned for ZIP");
      }

      setHomeCoords([Number(center[0]), Number(center[1])]);
    } catch (e) {
      console.error("[Page] Home ZIP geocode failed:", e);
      setHomeCoords(null);
    }
  };

  const clearHome = () => {
    setHomeZip("");
    setHomeCoords(null);
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
    const q = stopSearch.trim();
    if (!q) return allStops.slice(0, 30);

    const scored = allStops
      .map((s) => {
        const hay = `${s.label} ${s.retailer || ""} ${s.name || ""} ${s.city || ""} ${s.state || ""} ${s.zip || ""}`;
        const hit =
          includesLoose(s.label, q) ||
          includesLoose(s.retailer || "", q) ||
          includesLoose(s.name || "", q) ||
          includesLoose(s.city || "", q) ||
          includesLoose(s.state || "", q) ||
          includesLoose(s.zip || "", q) ||
          includesLoose(hay, q);

        if (!hit) return null;

        // simple “relevance” scoring
        let score = 0;
        if (includesLoose(s.label, q)) score += 3;
        if (includesLoose(s.retailer || "", q)) score += 2;
        if (includesLoose(s.city || "", q)) score += 1;
        if (includesLoose(s.state || "", q)) score += 1;

        return { s, score };
      })
      .filter(Boolean) as { s: Stop; score: number }[];

    scored.sort((a, b) => b.score - a.score);
    return scored.map((x) => x.s).slice(0, 40);
  }, [allStops, stopSearch]);

  const sidebarListClass =
    "max-h-52 overflow-y-auto pr-1 space-y-1 rounded-lg border border-white/10 bg-black/20 p-2";
  const sectionTitleClass = "text-sm font-semibold tracking-wide text-white/90";
  const clearBtnClass =
    "text-xs px-2 py-1 rounded-md border border-white/15 hover:border-white/30 hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed";
  const smallInputClass =
    "w-full rounded-lg bg-black/30 border border-white/15 px-3 py-2 text-sm outline-none focus:border-white/30";

  const basePath = useMemo(() => (process.env.NEXT_PUBLIC_BASE_PATH || "").trim(), []);
  const logoSrc = `${basePath}/certis-logo.png`;

  return (
    <div className="min-h-screen w-full bg-[#0b0f14] text-white flex flex-col">
      {/* HEADER (Title above map) */}
      <header className="w-full border-b border-white/10 bg-black/40">
        <div className="px-4 py-3 flex items-center gap-3">
          <div className="flex items-center gap-3">
            <Image src={logoSrc} alt="Certis Biologicals" width={120} height={32} priority />
            <div className="text-lg font-bold tracking-wide">CERTIS AgRoute Database</div>
          </div>

          <div className="ml-auto text-xs text-white/60">
            Token:{" "}
            <span className={token ? "text-green-400" : "text-red-400"}>
              {token ? "OK" : "MISSING"}
            </span>
          </div>
        </div>
      </header>

      {/* BODY */}
      <div className="p-3 flex-1">
        <div className="grid grid-cols-[380px_1fr] gap-3 h-[calc(100vh-24px-60px)]">
          {/* SIDEBAR */}
          <aside className="rounded-xl border border-white/10 bg-black/40 overflow-hidden flex flex-col">
            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-6">
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
                    className="rounded-lg px-3 py-2 text-sm font-semibold bg-white text-black hover:bg-white/90"
                    disabled={!homeZip.trim() || !token}
                    title={!token ? "Missing NEXT_PUBLIC_MAPBOX_TOKEN" : ""}
                  >
                    Set
                  </button>
                  <button onClick={clearHome} className={clearBtnClass} disabled={!homeZip && !homeCoords}>
                    Clear
                  </button>
                </div>
                <div className="text-xs text-white/60">
                  Home marker (Blue_Home.png). ZIP geocoded via Mapbox.
                </div>
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

                <div className="max-h-64 overflow-y-auto space-y-2 rounded-lg border border-white/10 bg-black/20 p-2">
                  {stopResults.map((st) => {
                    const inTrip = tripStops.some((x) => x.id === st.id);
                    return (
                      <div key={st.id} className="rounded-md border border-white/10 bg-black/10 p-2">
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
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedStates([])}
                      className={clearBtnClass}
                      disabled={selectedStates.length === 0}
                    >
                      Clear
                    </button>
                  </div>
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
                    <div key={st.id} className="rounded-lg border border-white/10 bg-black/20 p-2">
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
                <div className={sectionTitleClass}>Retailer Summary (Visible Retailers)</div>
                <div className="space-y-2">
                  {retailerSummary.slice(0, 40).map((row) => (
                    <div key={row.retailer} className="rounded-lg border border-white/10 bg-black/20 p-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold">{row.retailer}</div>
                        <div className="text-xs text-white/70 whitespace-nowrap">{row.count} sites</div>
                      </div>
                      <div className="text-xs text-white/70 mt-1 space-y-1">
                        <div>
                          <span className="font-semibold text-white/80">States:</span>{" "}
                          {row.states.join(", ") || "—"}
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
                  {retailerSummary.length === 0 && (
                    <div className="text-xs text-white/60">No visible retailers (or still loading).</div>
                  )}
                </div>
              </div>

              {/* Small diagnostics */}
              <div className="text-[11px] text-white/50">
                Loaded: {allStops.length} stops • Trip: {tripStops.length} • Token: {token ? "OK" : "MISSING"}
              </div>
            </div>
          </aside>

          {/* MAP */}
          <main className="rounded-xl border border-white/10 overflow-hidden bg-black/30">
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
              onRetailerSummary={(summary) => setRetailerSummary(summary)}
              onAddStop={addStopToTrip}
            />
          </main>
        </div>
      </div>
    </div>
  );
}
