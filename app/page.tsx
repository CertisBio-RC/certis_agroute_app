"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Menu, X } from "lucide-react";

import CertisMap, { Stop, RetailerSummaryRow } from "../components/CertisMap";

/* ========================================================================
   🌗 THEME — Bailey Rule: dark default
======================================================================== */
function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    const start = stored === "light" ? "light" : "dark";
    setTheme(start);
    document.documentElement.classList.toggle("dark", start === "dark");
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
  };

  return { theme, toggleTheme };
}

/* ========================================================================
   HELPERS
======================================================================== */
function uniqSorted(arr: string[]) {
  return Array.from(new Set(arr.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}
function normLower(v: string) {
  return (v || "").trim().toLowerCase();
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

/* ========================================================================
   🚀 MAIN — CERTIS AGROUTE — OLD-FORMAT RESTORE (card sidebar + theme toggle)
======================================================================== */
export default function Page() {
  const { theme, toggleTheme } = useTheme();

  // GH Pages basePath (Bailey Rule)
  const basePath = useMemo(() => {
    const bp = (process.env.NEXT_PUBLIC_BASE_PATH || "/certis_agroute_app").trim();
    return bp || "/certis_agroute_app";
  }, []);

  const token = useMemo(() => (process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "").trim(), []);

  /* ---------- OPTIONS LOADED FROM MAP ---------- */
  const [states, setStates] = useState<string[]>([]);
  const [retailers, setRetailers] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [suppliers, setSuppliers] = useState<string[]>([]);

  /* ---------- SELECTION STATE ---------- */
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedRetailers, setSelectedRetailers] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);

  /* ---------- MOBILE SIDEBAR ---------- */
  const [sidebarOpen, setSidebarOpen] = useState(false);

  /* ---------- HOME ZIP ---------- */
  const [homeZip, setHomeZip] = useState<string>("");
  const [homeCoords, setHomeCoords] = useState<[number, number] | null>(null);
  const [homeStatus, setHomeStatus] = useState<string>("");

  /* ---------- STOPS + TRIP ---------- */
  const [allStops, setAllStops] = useState<Stop[]>([]);
  const [tripStops, setTripStops] = useState<Stop[]>([]);
  const [zoomToStop, setZoomToStop] = useState<Stop | null>(null);

  /* ---------- SIDEBAR SEARCH ---------- */
  const [stateSearch, setStateSearch] = useState("");
  const [retailerSearch, setRetailerSearch] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [stopSearch, setStopSearch] = useState("");

  /* =====================================================================
     HOME ZIP GEOCODE
  ===================================================================== */
  const setHomeFromZip = async () => {
    const z = homeZip.trim();
    if (!z) return;

    if (!token) {
      setHomeCoords(null);
      setHomeStatus("Missing Mapbox token — cannot geocode ZIP.");
      return;
    }

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

  /* =====================================================================
     FILTER HELPERS
  ===================================================================== */
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

  /* =====================================================================
     TRIP HELPERS
  ===================================================================== */
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

  /* =====================================================================
     VISIBLE OPTION LISTS (searchable)
  ===================================================================== */
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

  /* =====================================================================
     STOP SEARCH RESULTS
  ===================================================================== */
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

  /* =====================================================================
     ✅ Retailer summary (Trip Stops)
  ===================================================================== */
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

  /* =====================================================================
     UI (OLD FORMAT)
  ===================================================================== */
  return (
    <div className="flex h-screen w-screen relative overflow-hidden">
      {/* MOBILE MENU BUTTON */}
      <button
        className="absolute top-3 left-3 z-40 p-2 bg-gray-800 text-white rounded-md md:hidden"
        onClick={() => setSidebarOpen((v) => !v)}
        aria-label="Toggle sidebar"
      >
        {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* SIDEBAR */}
      <aside
        className={`fixed md:static top-0 left-0 h-full w-[600px]
        bg-gray-100 dark:bg-gray-900 border-r border-gray-300 dark:border-gray-700
        p-4 overflow-y-auto z-30 transform transition-transform duration-300
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
      >
        {/* LOGO + THEME */}
        <div className="flex flex-col items-center mb-6 gap-3">
          <Image
            src={`${basePath}/certis-logo.png`}
            alt="Certis Biologicals"
            width={180}
            height={60}
            priority
          />

          <div className="text-xs text-gray-700 dark:text-gray-300">
            Token:{" "}
            <span className={token ? "text-green-600 dark:text-green-400 font-semibold" : "text-red-600 font-semibold"}>
              {token ? "OK" : "MISSING"}
            </span>
          </div>

          <button
            onClick={toggleTheme}
            className="px-3 py-1 rounded text-[14px] font-semibold border border-yellow-500 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-600/20"
          >
            {theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
          </button>
        </div>

        {/* HOME ZIP */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold text-yellow-600 dark:text-yellow-400 mb-3">Home ZIP Code</h2>
          <div className="flex gap-2">
            <input
              value={homeZip}
              onChange={(e) => setHomeZip(e.target.value)}
              placeholder="e.g., 50010"
              className="flex-1 p-2 rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-black dark:text-white"
            />
            <button
              onClick={setHomeFromZip}
              className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              disabled={!homeZip.trim() || !token}
              title={!token ? "Missing NEXT_PUBLIC_MAPBOX_TOKEN" : ""}
            >
              Set
            </button>
            <button
              onClick={clearHome}
              className="px-3 py-1 bg-gray-500 text-white rounded hover:bg-gray-600 disabled:opacity-50"
              disabled={!homeZip && !homeCoords}
            >
              Clear
            </button>
          </div>

          {homeStatus && <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-2">{homeStatus}</p>}
          <p className="text-xs text-gray-600 dark:text-gray-300 mt-2">
            Home marker (Blue_Home.png). ZIP geocoded via Mapbox.
          </p>
        </div>

        {/* FIND A STOP */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold text-yellow-600 dark:text-yellow-400 mb-3">Find a Stop</h2>
          <input
            value={stopSearch}
            onChange={(e) => setStopSearch(e.target.value)}
            placeholder="Search by retailer, city, state, name, contact…"
            className="w-full p-2 rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-black dark:text-white"
          />
          <div className="text-xs text-gray-600 dark:text-gray-300 mt-2">Loaded stops: {allStops.length}</div>

          <div className="mt-3 max-h-64 overflow-y-auto space-y-2">
            {stopResults.map((st) => {
              const inTrip = tripStops.some((x) => x.id === st.id);
              return (
                <div
                  key={st.id}
                  className="p-2 rounded bg-gray-100 dark:bg-gray-700/40 border border-gray-200 dark:border-gray-700"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-900 dark:text-yellow-200 truncate">{st.label}</div>
                      <div className="text-xs text-gray-700 dark:text-gray-200">
                        {(st.city || "") + (st.city ? ", " : "")}
                        {st.state || ""}
                        {st.zip ? ` ${st.zip}` : ""}
                        {st.kind ? ` • ${st.kind}` : ""}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => zoomStop(st)}
                        className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-700"
                      >
                        Zoom
                      </button>
                      <button
                        onClick={() => addStopToTrip(st)}
                        disabled={inTrip}
                        className="px-2 py-1 text-xs rounded bg-yellow-400 text-black font-semibold hover:bg-yellow-300 disabled:opacity-50"
                      >
                        {inTrip ? "Added" : "Add"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            {stopResults.length === 0 && <div className="text-sm text-gray-600 dark:text-gray-300">No matches.</div>}
          </div>
        </div>

        {/* FILTERS */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-yellow-600 dark:text-yellow-400">Filters</h2>
            <button
              onClick={clearAllFilters}
              className="px-2 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600 disabled:opacity-50"
              disabled={!hasAnyFilters}
            >
              Clear All
            </button>
          </div>

          {/* STATES */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold text-gray-900 dark:text-white">States</div>
              <button
                onClick={() => setSelectedStates([])}
                className="px-2 py-1 bg-gray-400 text-white rounded text-xs hover:bg-gray-500 disabled:opacity-50"
                disabled={selectedStates.length === 0}
              >
                Clear
              </button>
            </div>
            <input
              value={stateSearch}
              onChange={(e) => setStateSearch(e.target.value)}
              placeholder="Search states…"
              className="w-full p-2 rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-black dark:text-white mb-2"
            />
            <div className="grid grid-cols-3 gap-1 max-h-48 overflow-y-auto pr-1">
              {visibleStates.map((st) => {
                const v = normUpper(st);
                return (
                  <label key={v} className="flex items-center space-x-2 text-sm text-gray-900 dark:text-white">
                    <input
                      type="checkbox"
                      checked={selectedStates.includes(v)}
                      onChange={() => toggle(v, selectedStates, setSelectedStates)}
                    />
                    <span>{v}</span>
                  </label>
                );
              })}
              {visibleStates.length === 0 && <div className="text-sm text-gray-600 dark:text-gray-300">Loading…</div>}
            </div>
          </div>

          {/* RETAILERS */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold text-gray-900 dark:text-white">Retailers</div>
              <button
                onClick={() => setSelectedRetailers([])}
                className="px-2 py-1 bg-gray-400 text-white rounded text-xs hover:bg-gray-500 disabled:opacity-50"
                disabled={selectedRetailers.length === 0}
              >
                Clear
              </button>
            </div>
            <input
              value={retailerSearch}
              onChange={(e) => setRetailerSearch(e.target.value)}
              placeholder="Search retailers…"
              className="w-full p-2 rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-black dark:text-white mb-2"
            />
            <div className="grid grid-cols-2 gap-x-4 max-h-48 overflow-y-auto pr-1">
              {visibleRetailers.map((r) => (
                <label key={r} className="flex items-center space-x-2 text-sm text-gray-900 dark:text-white">
                  <input
                    type="checkbox"
                    checked={selectedRetailers.includes(r)}
                    onChange={() => toggle(r, selectedRetailers, setSelectedRetailers)}
                  />
                  <span className="truncate">{r}</span>
                </label>
              ))}
              {visibleRetailers.length === 0 && <div className="text-sm text-gray-600 dark:text-gray-300">Loading…</div>}
            </div>
          </div>

          {/* CATEGORIES */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold text-gray-900 dark:text-white">Categories</div>
              <button
                onClick={() => setSelectedCategories([])}
                className="px-2 py-1 bg-gray-400 text-white rounded text-xs hover:bg-gray-500 disabled:opacity-50"
                disabled={selectedCategories.length === 0}
              >
                Clear
              </button>
            </div>
            <input
              value={categorySearch}
              onChange={(e) => setCategorySearch(e.target.value)}
              placeholder="Search categories…"
              className="w-full p-2 rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-black dark:text-white mb-2"
            />
            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
              {visibleCategories.map((c) => (
                <label key={c} className="flex items-center space-x-2 text-sm text-gray-900 dark:text-white">
                  <input
                    type="checkbox"
                    checked={selectedCategories.includes(c)}
                    onChange={() => toggle(c, selectedCategories, setSelectedCategories)}
                  />
                  <span className="truncate">{c}</span>
                </label>
              ))}
              {visibleCategories.length === 0 && <div className="text-sm text-gray-600 dark:text-gray-300">Loading…</div>}
            </div>
          </div>

          {/* SUPPLIERS */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold text-gray-900 dark:text-white">Suppliers</div>
              <button
                onClick={() => setSelectedSuppliers([])}
                className="px-2 py-1 bg-gray-400 text-white rounded text-xs hover:bg-gray-500 disabled:opacity-50"
                disabled={selectedSuppliers.length === 0}
              >
                Clear
              </button>
            </div>
            <input
              value={supplierSearch}
              onChange={(e) => setSupplierSearch(e.target.value)}
              placeholder="Search suppliers…"
              className="w-full p-2 rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-black dark:text-white mb-2"
            />
            <div className="grid grid-cols-2 gap-x-4 max-h-48 overflow-y-auto pr-1">
              {visibleSuppliers.map((sp) => (
                <label key={sp} className="flex items-center space-x-2 text-sm text-gray-900 dark:text-white">
                  <input
                    type="checkbox"
                    checked={selectedSuppliers.includes(sp)}
                    onChange={() => toggle(sp, selectedSuppliers, setSelectedSuppliers)}
                  />
                  <span className="truncate">{sp}</span>
                </label>
              ))}
              {visibleSuppliers.length === 0 && <div className="text-sm text-gray-600 dark:text-gray-300">Loading…</div>}
            </div>
          </div>
        </div>

        {/* TRIP BUILDER */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-yellow-600 dark:text-yellow-400">Trip Builder</h2>
            <button
              onClick={clearTrip}
              className="px-2 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 disabled:opacity-50"
              disabled={tripStops.length === 0}
            >
              Clear Trip
            </button>
          </div>

          {tripStops.length === 0 ? (
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Add stops from map popups (“Add to Trip”) or from “Find a Stop”.
            </p>
          ) : (
            <ol className="ml-5 space-y-3">
              {tripStops.map((s, i) => (
                <li
                  key={s.id}
                  className="flex justify-between items-start pb-2 border-b border-gray-300 dark:border-gray-600"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-yellow-700 dark:text-yellow-300">
                      {i + 1}. {s.label}
                    </div>
                    <div className="text-[14px] text-gray-800 dark:text-gray-200">
                      {(s.address || "").trim()}
                      {(s.city || s.state || s.zip) && (
                        <>
                          <br />
                          {(s.city || "") + (s.city ? ", " : "")}
                          {s.state || ""}
                          {s.zip ? ` ${s.zip}` : ""}
                        </>
                      )}
                    </div>
                  </div>

                  <div className="ml-3 flex flex-col gap-2 shrink-0">
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => zoomStop(s)}
                        className="px-2 py-1 rounded text-xs border border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-700"
                      >
                        Zoom
                      </button>
                      <button
                        onClick={() => removeStop(s.id)}
                        className="px-2 py-1 rounded text-xs border border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-700"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => moveStop(i, -1)}
                        className="px-2 py-1 rounded text-xs border border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50"
                        disabled={i === 0}
                        title="Move up"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => moveStop(i, 1)}
                        className="px-2 py-1 rounded text-xs border border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50"
                        disabled={i === tripStops.length - 1}
                        title="Move down"
                      >
                        ↓
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* RETAILER SUMMARY (TRIP STOPS) */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4 max-h-64 overflow-y-auto">
          <h2 className="text-lg font-bold text-yellow-600 dark:text-yellow-400 mb-3">
            Retailer Summary (Trip Stops)
          </h2>

          {tripRetailerSummary.length === 0 ? (
            <div className="text-sm text-gray-700 dark:text-gray-300">No trip stops yet.</div>
          ) : (
            tripRetailerSummary.slice(0, 60).map((row) => (
              <div key={row.retailer} className="mb-3 p-2 rounded bg-gray-100 dark:bg-gray-700/40">
                <div className="flex items-center justify-between gap-2">
                  <strong className="text-[17px] text-gray-900 dark:text-yellow-200">{row.retailer}</strong>
                  <span className="text-xs text-gray-700 dark:text-gray-200 whitespace-nowrap">{row.count} stops</span>
                </div>
                <div className="text-sm text-gray-800 dark:text-gray-200 mt-1 space-y-1">
                  <div>
                    <span className="font-semibold">State(s):</span> {row.states.map(normUpper).join(", ") || "—"}
                  </div>
                  <div>
                    <span className="font-semibold">Categories:</span> {row.categories.join(", ") || "—"}
                  </div>
                  <div>
                    <span className="font-semibold">Suppliers:</span> {row.suppliers.join(", ") || "—"}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* DIAGNOSTICS */}
        <div className="text-[11px] text-gray-700 dark:text-gray-300">
          Loaded: {allStops.length} stops • Trip: {tripStops.length}
        </div>
      </aside>

      {/* MAP PANEL */}
      <main className="flex-1 relative flex flex-col">
        <div className="w-full flex justify-end pr-6 pt-4 mb-3">
          <h1 className="text-xl font-bold text-yellow-600 dark:text-yellow-400 tracking-wide">
            Certis Ag-Route Planner
          </h1>
        </div>

        <div className="flex-1">
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
        </div>
      </main>
    </div>
  );
}
