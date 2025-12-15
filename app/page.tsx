"use client";

import { useEffect, useMemo, useState } from "react";
import CertisMap, { Stop, RetailerSummaryRow } from "../components/CertisMap";
import { MAPBOX_TOKEN } from "../utils/token";

type HomeMeta = {
  zip: string;
  city: string;
  state: string;
};

function uniqStrings(arr: string[]): string[] {
  return Array.from(new Set(arr.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

export default function Page() {
  // Filters (Bailey rules enforced inside CertisMap)
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedRetailers, setSelectedRetailers] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);

  // Dropdown lists populated by map (from currently visible retailers, per your design)
  const [statesList, setStatesList] = useState<string[]>([]);
  const [retailersList, setRetailersList] = useState<string[]>([]);
  const [categoriesList, setCategoriesList] = useState<string[]>([]);
  const [suppliersList, setSuppliersList] = useState<string[]>([]);

  // Home ZIP + coords (NOT a Stop)
  const [homeZip, setHomeZip] = useState<string>("");
  const [homeCoords, setHomeCoords] = useState<[number, number] | null>(null);
  const [homeMeta, setHomeMeta] = useState<HomeMeta | null>(null);

  // Stops
  const [allStops, setAllStops] = useState<Stop[]>([]);
  const [tripStops, setTripStops] = useState<Stop[]>([]);
  const [zoomToStop, setZoomToStop] = useState<Stop | null>(null);

  // Retailer summary from visible retailers
  const [retailerSummary, setRetailerSummary] = useState<RetailerSummaryRow[]>([]);

  // Search
  const [searchText, setSearchText] = useState<string>("");

  const token = useMemo(() => {
    const env = (process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "").trim();
    return env || (MAPBOX_TOKEN || "").trim();
  }, []);

  // ---------------------------
  // Helpers
  // ---------------------------

  const addStopToTrip = (stop: Stop) => {
    setTripStops((prev) => {
      if (prev.some((s) => s.id === stop.id)) return prev;
      return [...prev, stop];
    });
  };

  const removeStopFromTrip = (id: string) => {
    setTripStops((prev) => prev.filter((s) => s.id !== id));
  };

  const moveTripStop = (id: string, direction: -1 | 1) => {
    setTripStops((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx < 0) return prev;
      const nextIdx = idx + direction;
      if (nextIdx < 0 || nextIdx >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.splice(nextIdx, 0, item);
      return copy;
    });
  };

  const zoomTo = (stop: Stop) => {
    // ✅ IMPORTANT: do NOT spread/clone Stop (avoids “coords does not exist” type errors)
    setZoomToStop(stop);
    // clear it shortly after so the same stop can be zoomed again
    setTimeout(() => setZoomToStop(null), 50);
  };

  const clearAllFilters = () => {
    setSelectedStates([]);
    setSelectedRetailers([]);
    setSelectedCategories([]);
    setSelectedSuppliers([]);
  };

  // ---------------------------
  // Home ZIP geocode (Mapbox)
  // ---------------------------
  const geocodeHomeZip = async () => {
    const zip = homeZip.trim();
    if (!zip) return;

    if (!token) {
      alert("Mapbox token is missing. Ensure data/token.txt is loaded into NEXT_PUBLIC_MAPBOX_TOKEN before build.");
      return;
    }

    try {
      // Use US ZIP geocoding via Mapbox forward geocode
      const url =
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(zip)}.json` +
        `?country=US&types=postcode&limit=1&access_token=${encodeURIComponent(token)}`;

      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Geocode failed: ${resp.status} ${resp.statusText}`);

      const data: any = await resp.json();
      const feat = data?.features?.[0];
      const coords = feat?.center;

      if (!Array.isArray(coords) || coords.length !== 2) {
        throw new Error("No coordinates returned for that ZIP.");
      }

      const [lng, lat] = coords as [number, number];
      setHomeCoords([lng, lat]);

      // Try to parse city/state from context (best-effort)
      let city = "";
      let state = "";
      const ctx = Array.isArray(feat?.context) ? feat.context : [];
      for (const c of ctx) {
        const id = String(c?.id || "");
        if (id.startsWith("place.")) city = String(c?.text || "");
        if (id.startsWith("region.")) state = String(c?.short_code || String(c?.text || "")).replace("US-", "");
      }
      setHomeMeta({ zip, city, state });
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Home ZIP geocoding failed.");
    }
  };

  // Enter key submits geocode
  const onHomeZipKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") geocodeHomeZip();
  };

  // ---------------------------
  // Search filtered stops list
  // ---------------------------
  const filteredStops = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return allStops.slice(0, 50);

    const scored = allStops
      .map((s) => {
        const hay =
          `${s.label} ${s.retailer || ""} ${s.name || ""} ${s.city || ""} ${s.state || ""} ${s.zip || ""}`
            .toLowerCase()
            .trim();
        const hit = hay.includes(q);
        return { s, hit };
      })
      .filter((x) => x.hit)
      .map((x) => x.s);

    return scored.slice(0, 75);
  }, [allStops, searchText]);

  // Ensure dropdown lists remain unique/sorted if any source duplicates come in
  useEffect(() => setStatesList((p) => uniqStrings(p)), []);
  useEffect(() => setRetailersList((p) => uniqStrings(p)), []);
  useEffect(() => setCategoriesList((p) => uniqStrings(p)), []);
  useEffect(() => setSuppliersList((p) => uniqStrings(p)), []);

  // ---------------------------
  // UI
  // ---------------------------
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "380px 1fr",
        height: "100vh",
        width: "100vw",
        gap: 12,
        padding: 12,
        boxSizing: "border-box",
      }}
    >
      {/* Sidebar */}
      <div
        style={{
          borderRadius: 12,
          padding: 12,
          overflow: "auto",
          border: "1px solid rgba(255,255,255,0.12)",
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>CERTIS AgRoute Planner</div>

        {/* Home ZIP */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Home ZIP</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={homeZip}
              onChange={(e) => setHomeZip(e.target.value)}
              onKeyDown={onHomeZipKeyDown}
              placeholder="e.g., 50010"
              style={{
                flex: 1,
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.18)",
                background: "transparent",
                color: "inherit",
              }}
            />
            <button
              onClick={geocodeHomeZip}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.18)",
                background: "transparent",
                cursor: "pointer",
                color: "inherit",
              }}
            >
              Set
            </button>
          </div>
          {homeCoords && (
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
              Home set: {homeMeta?.city ? `${homeMeta.city}, ` : ""}
              {homeMeta?.state ? `${homeMeta.state} ` : ""}
              ({homeCoords[1].toFixed(4)}, {homeCoords[0].toFixed(4)})
            </div>
          )}
        </div>

        {/* Filters */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontWeight: 800 }}>Filters</div>
            <button
              onClick={clearAllFilters}
              style={{
                padding: "6px 10px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.18)",
                background: "transparent",
                cursor: "pointer",
                color: "inherit",
                fontSize: 12,
              }}
            >
              Clear
            </button>
          </div>

          <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
            <FilterMultiSelect
              label="State"
              options={statesList}
              selected={selectedStates}
              onChange={setSelectedStates}
            />
            <FilterMultiSelect
              label="Retailer"
              options={retailersList}
              selected={selectedRetailers}
              onChange={setSelectedRetailers}
            />
            <FilterMultiSelect
              label="Category"
              options={categoriesList}
              selected={selectedCategories}
              onChange={setSelectedCategories}
            />
            <FilterMultiSelect
              label="Supplier"
              options={suppliersList}
              selected={selectedSuppliers}
              onChange={setSelectedSuppliers}
            />
          </div>
        </div>

        {/* Search Stops */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Search Stops</div>
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search retailer / kingpin / city / ZIP..."
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "transparent",
              color: "inherit",
              boxSizing: "border-box",
            }}
          />

          <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
            {filteredStops.map((s0) => (
              <div
                key={s0.id}
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.12)",
                }}
              >
                <div style={{ fontSize: 12, lineHeight: 1.2 }}>
                  <div style={{ fontWeight: 700 }}>{s0.label}</div>
                  <div style={{ opacity: 0.8 }}>
                    {s0.city ? `${s0.city}, ` : ""}
                    {s0.state || ""}
                    {s0.zip ? ` ${s0.zip}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={() => zoomTo(s0)}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.18)",
                      background: "transparent",
                      cursor: "pointer",
                      color: "inherit",
                      fontSize: 12,
                    }}
                  >
                    Zoom
                  </button>
                  <button
                    onClick={() => addStopToTrip(s0)}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.18)",
                      background: "transparent",
                      cursor: "pointer",
                      color: "inherit",
                      fontSize: 12,
                    }}
                  >
                    Add
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Trip Builder */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Trip Stops ({tripStops.length})</div>

          {tripStops.length === 0 ? (
            <div style={{ fontSize: 12, opacity: 0.8 }}>
              Add stops from map popups or from the search results above.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              {tripStops.map((s0, idx) => (
                <div
                  key={s0.id}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.12)",
                    display: "grid",
                    gap: 6,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontSize: 12, lineHeight: 1.2 }}>
                      <div style={{ fontWeight: 800 }}>
                        {idx + 1}. {s0.label}
                      </div>
                      <div style={{ opacity: 0.8 }}>
                        {s0.city ? `${s0.city}, ` : ""}
                        {s0.state || ""}
                        {s0.zip ? ` ${s0.zip}` : ""}
                      </div>
                    </div>
                    <button
                      onClick={() => removeStopFromTrip(s0.id)}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 10,
                        border: "1px solid rgba(255,255,255,0.18)",
                        background: "transparent",
                        cursor: "pointer",
                        color: "inherit",
                        fontSize: 12,
                        height: 32,
                      }}
                    >
                      Remove
                    </button>
                  </div>

                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button
                      onClick={() => zoomTo(s0)}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 10,
                        border: "1px solid rgba(255,255,255,0.18)",
                        background: "transparent",
                        cursor: "pointer",
                        color: "inherit",
                        fontSize: 12,
                      }}
                    >
                      Zoom to Stop
                    </button>
                    <button
                      disabled={idx === 0}
                      onClick={() => moveTripStop(s0.id, -1)}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 10,
                        border: "1px solid rgba(255,255,255,0.18)",
                        background: "transparent",
                        cursor: idx === 0 ? "not-allowed" : "pointer",
                        color: "inherit",
                        fontSize: 12,
                        opacity: idx === 0 ? 0.5 : 1,
                      }}
                    >
                      Up
                    </button>
                    <button
                      disabled={idx === tripStops.length - 1}
                      onClick={() => moveTripStop(s0.id, 1)}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 10,
                        border: "1px solid rgba(255,255,255,0.18)",
                        background: "transparent",
                        cursor: idx === tripStops.length - 1 ? "not-allowed" : "pointer",
                        color: "inherit",
                        fontSize: 12,
                        opacity: idx === tripStops.length - 1 ? 0.5 : 1,
                      }}
                    >
                      Down
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Retailer summary */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Retailer Summary</div>
          {retailerSummary.length === 0 ? (
            <div style={{ fontSize: 12, opacity: 0.8 }}>No visible retailers (check filters).</div>
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              {retailerSummary.slice(0, 50).map((r) => (
                <div
                  key={r.retailer}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.12)",
                    fontSize: 12,
                    lineHeight: 1.25,
                  }}
                >
                  <div style={{ fontWeight: 800 }}>
                    {r.retailer} <span style={{ opacity: 0.85 }}>({r.count})</span>
                  </div>
                  <div style={{ opacity: 0.85, marginTop: 4 }}>
                    <b>States:</b> {r.states.join(", ") || "—"}
                  </div>
                  <div style={{ opacity: 0.85 }}>
                    <b>Categories:</b> {r.categories.join(", ") || "—"}
                  </div>
                  <div style={{ opacity: 0.85 }}>
                    <b>Suppliers:</b> {r.suppliers.join(", ") || "—"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Map */}
      <div
        style={{
          borderRadius: 12,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.12)",
        }}
      >
        <CertisMap
          selectedStates={selectedStates}
          selectedRetailers={selectedRetailers}
          selectedCategories={selectedCategories}
          selectedSuppliers={selectedSuppliers}
          homeCoords={homeCoords}
          tripStops={tripStops}
          zoomToStop={zoomToStop}
          onStatesLoaded={setStatesList}
          onRetailersLoaded={setRetailersList}
          onCategoriesLoaded={setCategoriesList}
          onSuppliersLoaded={setSuppliersList}
          onAllStopsLoaded={setAllStops}
          onRetailerSummary={setRetailerSummary}
          onAddStop={addStopToTrip}
        />
      </div>
    </div>
  );
}

// --------------------------------------------
// Simple multi-select (checkbox list)
// --------------------------------------------
function FilterMultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };

  const clear = () => onChange([]);

  return (
    <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ fontWeight: 800 }}>{label}</div>
        <button
          onClick={clear}
          style={{
            padding: "4px 8px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.18)",
            background: "transparent",
            cursor: "pointer",
            color: "inherit",
            fontSize: 12,
          }}
        >
          Clear
        </button>
      </div>

      <div style={{ marginTop: 8, maxHeight: 140, overflow: "auto", display: "grid", gap: 6 }}>
        {options.length === 0 ? (
          <div style={{ fontSize: 12, opacity: 0.75 }}>No options (adjust filters).</div>
        ) : (
          options.map((opt) => (
            <label key={opt} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
              <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} />
              <span>{opt}</span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}
