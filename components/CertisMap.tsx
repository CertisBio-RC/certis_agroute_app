"use client";

// ============================================================================
// 💠 CERTIS AGROUTE — GOLD (K10-informed + Build-safe + Kingpin icon scaling fix)
//   • Satellite-streets-v12 + Mercator (Bailey Rule)
//   • Retailers filtered by: State ∩ Retailer ∩ Category ∩ Supplier
//   • Corporate HQ filtered ONLY by State (Bailey HQ rule)
//   • Kingpins always visible overlay (not filtered)
//   • Applies ~100m offset to Kingpins (lng + 0.0013) like K10
//   • Kingpin icon size is ZOOM-SCALED (prevents giant stars)
//   • Trip route: Mapbox Directions (driving) + straight-line fallback
// ============================================================================

import { useEffect, useMemo, useRef } from "react";
import mapboxgl from "mapbox-gl";
import { MAPBOX_TOKEN } from "../utils/token";

type StopKind = "retailer" | "hq" | "kingpin";

export type Stop = {
  id: string;
  kind: StopKind;
  label: string;
  retailer?: string;
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  category?: string;
  suppliers?: string;

  // Optional Kingpin contact fields
  email?: string;
  phoneOffice?: string;
  phoneCell?: string;

  coords: [number, number]; // [lng, lat]
};

export type RetailerSummaryRow = {
  retailer: string;
  count: number;
  suppliers: string[];
  categories: string[];
  states: string[];
};

type Feature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: Record<string, any>;
};

type FeatureCollection = {
  type: "FeatureCollection";
  features: Feature[];
};

type Props = {
  selectedStates: string[];
  selectedRetailers: string[];
  selectedCategories: string[];
  selectedSuppliers: string[];
  homeCoords: [number, number] | null;

  tripStops: Stop[];
  zoomToStop: Stop | null;

  onStatesLoaded: (states: string[]) => void;
  onRetailersLoaded: (retailers: string[]) => void;
  onCategoriesLoaded: (categories: string[]) => void;
  onSuppliersLoaded: (suppliers: string[]) => void;

  onRetailerSummary: (summary: RetailerSummaryRow[]) => void;
  onAllStopsLoaded: (stops: Stop[]) => void;
  onAddStop: (stop: Stop) => void;
};

const STYLE_URL = "mapbox://styles/mapbox/satellite-streets-v12";
const DEFAULT_CENTER: [number, number] = [-93.5, 41.5];
const DEFAULT_ZOOM = 5;

const SRC_RETAILERS = "retailers";
const SRC_KINGPINS = "kingpins";
const SRC_ROUTE = "trip-route-src";

const LYR_RETAILERS = "retailers-circle";
const LYR_HQ = "corp-hq-circle";
const LYR_KINGPINS = "kingpin-symbol";
const LYR_ROUTE = "trip-route";

const KINGPIN_ICON_ID = "kingpin-icon";
const KINGPIN_OFFSET_LNG = 0.0013; // ≈100m at Midwest latitudes

function s(v: any) {
  return String(v ?? "").trim();
}

function uniqSorted(list: string[]) {
  return Array.from(new Set(list.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function splitMulti(raw: any) {
  const str = s(raw);
  if (!str) return [];
  return str
    .split(/[;,|]/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

function splitCategories(raw: any) {
  const str = s(raw);
  if (!str) return [];
  return str
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function isCorporateHQ(category: string) {
  const c = category.toLowerCase();
  return c.includes("corporate") && c.includes("hq");
}

function makeId(kind: StopKind, coords: [number, number], p: Record<string, any>) {
  const retailer = s(p.Retailer);
  const name = s(p.Name);
  const st = s(p.State);
  const zip = s(p.Zip);
  return `${kind}:${retailer}|${name}|${st}|${zip}|${coords[0].toFixed(6)},${coords[1].toFixed(6)}`;
}

export default function CertisMap(props: Props) {
  const {
    selectedStates,
    selectedRetailers,
    selectedCategories,
    selectedSuppliers,
    homeCoords,
    tripStops,
    zoomToStop,
    onStatesLoaded,
    onRetailersLoaded,
    onCategoriesLoaded,
    onSuppliersLoaded,
    onRetailerSummary,
    onAllStopsLoaded,
    onAddStop,
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  const retailersRef = useRef<FeatureCollection | null>(null);
  const kingpinsRef = useRef<FeatureCollection | null>(null);

  const homeMarkerRef = useRef<mapboxgl.Marker | null>(null);

  const basePath = useMemo(() => {
    const bp = (process.env.NEXT_PUBLIC_BASE_PATH || "/certis_agroute_app").trim();
    return bp || "/certis_agroute_app";
  }, []);

  const token = useMemo(() => {
    const env = (process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "").trim();
    return env || (MAPBOX_TOKEN || "").trim();
  }, []);

  // Ensure mapbox token is set
  useEffect(() => {
    if (!mapboxgl.accessToken) mapboxgl.accessToken = token;
  }, [token]);

  // INIT MAP (once)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      projection: { name: "mercator" },
    });

    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), "top-right");

    map.on("load", async () => {
      // Sources
      if (!map.getSource(SRC_RETAILERS)) {
        map.addSource(SRC_RETAILERS, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      }
      if (!map.getSource(SRC_KINGPINS)) {
        map.addSource(SRC_KINGPINS, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      }
      if (!map.getSource(SRC_ROUTE)) {
        map.addSource(SRC_ROUTE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      }

      // Layers (Retailers)
      if (!map.getLayer(LYR_RETAILERS)) {
        map.addLayer({
          id: LYR_RETAILERS,
          type: "circle",
          source: SRC_RETAILERS,
          paint: {
            "circle-radius": 4,
            "circle-stroke-width": 1,
            "circle-stroke-color": "#111827",
            "circle-color": [
              "case",
              // Agronomy-dominant if "Agronomy" appears anywhere AND not Corporate HQ
              [
                "all",
                ["==", ["index-of", "corporate", ["downcase", ["get", "Category"]]], -1],
                [">=", ["index-of", "agronomy", ["downcase", ["get", "Category"]]], 0],
              ],
              "#22c55e", // green
              [">=", ["index-of", "grain", ["downcase", ["get", "Category"]]], 0],
              "#f97316", // orange
              [
                "any",
                [">=", ["index-of", "c-store", ["downcase", ["get", "Category"]]], 0],
                [">=", ["index-of", "service", ["downcase", ["get", "Category"]]], 0],
                [">=", ["index-of", "energy", ["downcase", ["get", "Category"]]], 0],
              ],
              "#0ea5e9", // blue
              [">=", ["index-of", "distribution", ["downcase", ["get", "Category"]]], 0],
              "#a855f7", // purple
              "#f9fafb", // default light gray
            ],
          },
        });
      }

      // Corporate HQ
      if (!map.getLayer(LYR_HQ)) {
        map.addLayer({
          id: LYR_HQ,
          type: "circle",
          source: SRC_RETAILERS,
          filter: [">=", ["index-of", "corporate", ["downcase", ["get", "Category"]]], 0],
          paint: {
            "circle-radius": 7,
            "circle-color": "#ff0000",
            "circle-stroke-color": "#facc15",
            "circle-stroke-width": 2,
          },
        });
      }

      // Kingpin icon load + layer
      try {
        if (!map.hasImage(KINGPIN_ICON_ID)) {
          const iconUrl = `${basePath}/icons/kingpin.png`;
          const img = await new Promise<any>((resolve, reject) => {
            map.loadImage(iconUrl, (err, image) => {
              if (err || !image) reject(err || new Error("loadImage failed"));
              else resolve(image);
            });
          });
          map.addImage(KINGPIN_ICON_ID, img, { pixelRatio: 2 });
        }
      } catch (e) {
        console.warn("[CertisMap] Kingpin icon load failed:", e);
      }

      if (!map.getLayer(LYR_KINGPINS)) {
        map.addLayer({
          id: LYR_KINGPINS,
          type: "symbol",
          source: SRC_KINGPINS,
          layout: {
            "icon-image": KINGPIN_ICON_ID,

            // ✅ CRITICAL FIX: zoom-scaled size (prevents the “giant star carpet”)
            "icon-size": [
              "interpolate",
              ["linear"],
              ["zoom"],
              3, 0.018,
              5, 0.028,
              7, 0.040,
              9, 0.055,
              12, 0.085,
            ],

            "icon-anchor": "bottom",
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
          },
        });
      }

      // Route layer
      if (!map.getLayer(LYR_ROUTE)) {
        map.addLayer({
          id: LYR_ROUTE,
          type: "line",
          source: SRC_ROUTE,
          paint: {
            "line-color": "#facc15",
            "line-width": 4,
            "line-opacity": 0.95,
          },
        });
      }

      // Load GeoJSON now that style/sources exist
      await loadData();
      applyFiltersAndEmit();
      updateHomeMarker();
      await updateRoute();

      // Click / cursor
      const setPointer = () => (map.getCanvas().style.cursor = "pointer");
      const clearPointer = () => (map.getCanvas().style.cursor = "");

      [LYR_RETAILERS, LYR_HQ, LYR_KINGPINS].forEach((lyr) => {
        map.on("mouseenter", lyr, setPointer);
        map.on("mouseleave", lyr, clearPointer);
      });

      map.on("click", LYR_RETAILERS, (e) => handleRetailerClick(e));
      map.on("click", LYR_HQ, (e) => handleRetailerClick(e));
      map.on("click", LYR_KINGPINS, (e) => handleKingpinClick(e));

      console.info("[CertisMap] Loaded.");
    });

    return () => {
      try {
        map.remove();
      } catch {}
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basePath, token]);

  async function loadData() {
    const map = mapRef.current;
    if (!map) return;

    const retailersUrl = `${basePath}/data/retailers.geojson`;
    const kingpinsUrl = `${basePath}/data/kingpin.geojson`;

    const [r1, r2] = await Promise.all([fetch(retailersUrl), fetch(kingpinsUrl)]);

    const retailersData = (await r1.json()) as FeatureCollection;
    const kingpinData = (await r2.json()) as FeatureCollection;

    // Apply K10-style 100m offset to kingpins
    const offsetKingpins: FeatureCollection = {
      ...kingpinData,
      features: (kingpinData.features ?? []).map((f: any) => {
        const [lng, lat] = f.geometry?.coordinates ?? [0, 0];
        return {
          ...f,
          geometry: { ...f.geometry, coordinates: [lng + KINGPIN_OFFSET_LNG, lat] },
        };
      }),
    };

    retailersRef.current = retailersData;
    kingpinsRef.current = offsetKingpins;

    (map.getSource(SRC_RETAILERS) as mapboxgl.GeoJSONSource).setData(retailersData as any);
    (map.getSource(SRC_KINGPINS) as mapboxgl.GeoJSONSource).setData(offsetKingpins as any);

    // Build “all stops” list
    const allStops: Stop[] = [];

    for (const f of retailersData.features ?? []) {
      const p = f.properties ?? {};
      const coords = f.geometry?.coordinates;
      if (!coords) continue;

      const category = s(p.Category);
      const kind: StopKind = isCorporateHQ(category) ? "hq" : "retailer";

      const retailer = s(p.Retailer);
      const name = s(p.Name);
      const label = kind === "hq" ? `${retailer || "Corporate HQ"} — Corporate HQ` : `${retailer || "Retailer"} — ${name || "Site"}`;

      allStops.push({
        id: makeId(kind, coords, p),
        kind,
        label,
        retailer,
        name,
        address: s(p.Address),
        city: s(p.City),
        state: s(p.State),
        zip: s(p.Zip),
        category,
        suppliers: s(p.Suppliers),
        coords,
      });
    }

    for (const f of offsetKingpins.features ?? []) {
      const p = f.properties ?? {};
      const coords = f.geometry?.coordinates;
      if (!coords) continue;

      const retailer = s(p.Retailer);
      const contactName = s(p.Name || p.Contact || p.ContactName || p["Contact Name"]);
      const title = s(p.Title || p.ContactTitle || p["Contact Title"]);
      const label = retailer ? `${contactName || "Kingpin"} — ${retailer}` : `${contactName || "Kingpin"}`;

      allStops.push({
        id: makeId("kingpin", coords, p),
        kind: "kingpin",
        label,
        retailer,
        name: contactName || "Kingpin",
        address: s(p.Address),
        city: s(p.City),
        state: s(p.State),
        zip: s(p.Zip),
        category: s(p.Category) || "Kingpin",
        suppliers: s(p.Suppliers),
        email: s(p.Email) || "TBD",
        phoneOffice: s(p.OfficePhone || p["Office Phone"] || p.PhoneOffice) || "TBD",
        phoneCell: s(p.CellPhone || p["Cell Phone"] || p.PhoneCell) || "TBD",
        coords,
      });
    }

    onAllStopsLoaded(allStops);

    // Dropdown lists
    onStatesLoaded(
      uniqSorted(
        allStops.map((st) => s(st.state).toUpperCase()).filter(Boolean)
      )
    );

    onRetailersLoaded(
      uniqSorted(
        (retailersData.features ?? [])
          .map((f: any) => s(f.properties?.Retailer))
          .filter(Boolean)
      )
    );

    onCategoriesLoaded(
      uniqSorted(
        (retailersData.features ?? []).flatMap((f: any) => splitCategories(f.properties?.Category))
      )
    );

    onSuppliersLoaded(
      uniqSorted(
        allStops.flatMap((st) => splitMulti(st.suppliers))
      )
    );
  }

  function applyFiltersAndEmit() {
    const map = mapRef.current;
    const retailersData = retailersRef.current;
    if (!map || !retailersData) return;

    // Retailers filtered by intersection
    const retailerFilter: any[] = ["all"];
    retailerFilter.push(["==", ["index-of", "corporate", ["downcase", ["get", "Category"]]], -1]);

    if (selectedStates.length) retailerFilter.push(["in", ["upcase", ["get", "State"]], ["literal", selectedStates]]);
    if (selectedRetailers.length) retailerFilter.push(["in", ["get", "Retailer"], ["literal", selectedRetailers]]);

    if (selectedCategories.length) {
      retailerFilter.push([
        "any",
        ...selectedCategories.map((c) => [
          ">=",
          ["index-of", c.toLowerCase(), ["downcase", ["get", "Category"]]],
          0,
        ]),
      ]);
    }

    if (selectedSuppliers.length) {
      retailerFilter.push([
        "any",
        ...selectedSuppliers.map((sp) => [
          ">=",
          ["index-of", sp.toLowerCase(), ["downcase", ["get", "Suppliers"]]],
          0,
        ]),
      ]);
    }

    // HQ filter: ONLY state
    const hqFilter: any[] = ["all"];
    hqFilter.push([">=", ["index-of", "corporate", ["downcase", ["get", "Category"]]], 0]);
    if (selectedStates.length) hqFilter.push(["in", ["upcase", ["get", "State"]], ["literal", selectedStates]]);

    map.setFilter(LYR_RETAILERS, retailerFilter as any);
    map.setFilter(LYR_HQ, hqFilter as any);

    // Build retailer summary from visible retailers
    const visibleRetailers = map.queryRenderedFeatures({ layers: [LYR_RETAILERS] }) as any[];

    const acc: Record<string, { count: number; suppliers: Set<string>; categories: Set<string>; states: Set<string> }> =
      {};

    for (const f of visibleRetailers) {
      const p = f.properties ?? {};
      const retailer = s(p.Retailer) || "Unknown Retailer";
      if (!acc[retailer]) {
        acc[retailer] = { count: 0, suppliers: new Set(), categories: new Set(), states: new Set() };
      }
      acc[retailer].count += 1;
      splitMulti(p.Suppliers).forEach((x) => acc[retailer].suppliers.add(x));
      splitCategories(p.Category).forEach((x) => acc[retailer].categories.add(x));
      const st = s(p.State);
      if (st) acc[retailer].states.add(st);
    }

    onRetailerSummary(
      Object.entries(acc)
        .map(([retailer, v]) => ({
          retailer,
          count: v.count,
          suppliers: Array.from(v.suppliers).sort(),
          categories: Array.from(v.categories).sort(),
          states: Array.from(v.states).sort(),
        }))
        .sort((a, b) => b.count - a.count)
    );
  }

  // Re-apply filters when selections change
  useEffect(() => {
    applyFiltersAndEmit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStates, selectedRetailers, selectedCategories, selectedSuppliers]);

  // Home marker
  function updateHomeMarker() {
    const map = mapRef.current;
    if (!map) return;

    if (!homeCoords) {
      homeMarkerRef.current?.remove();
      homeMarkerRef.current = null;
      return;
    }

    const iconUrl = `${basePath}/icons/Blue_Home.png`;

    if (!homeMarkerRef.current) {
      const el = document.createElement("div");
      el.style.width = "28px";
      el.style.height = "28px";
      el.style.backgroundImage = `url(${iconUrl})`;
      el.style.backgroundSize = "contain";
      el.style.backgroundRepeat = "no-repeat";
      el.style.backgroundPosition = "center";

      homeMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: "bottom" })
        .setLngLat(homeCoords)
        .addTo(map);
    } else {
      homeMarkerRef.current.setLngLat(homeCoords);
    }
  }

  useEffect(() => {
    updateHomeMarker();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeCoords, basePath]);

  // Zoom to stop
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !zoomToStop) return;
    map.flyTo({ center: zoomToStop.coords, zoom: 12.5, essential: true });
  }, [zoomToStop]);

  // Trip route (Directions + fallback)
  async function updateRoute() {
    const map = mapRef.current;
    if (!map) return;

    const src = map.getSource(SRC_ROUTE) as mapboxgl.GeoJSONSource | undefined;
    if (!src) return;

    if (!tripStops || tripStops.length < 2) {
      src.setData({ type: "FeatureCollection", features: [] } as any);
      return;
    }

    const coords = tripStops.map((st) => st.coords);
    const coordsStr = coords.map((c) => `${c[0]},${c[1]}`).join(";");

    const url =
      `https://api.mapbox.com/directions/v5/mapbox/driving/${coordsStr}` +
      `?geometries=geojson&overview=full&steps=false&access_token=${encodeURIComponent(token)}`;

    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Directions HTTP ${resp.status} ${resp.statusText}`);
      const json: any = await resp.json();

      const geom = json?.routes?.[0]?.geometry;
      if (!geom || geom.type !== "LineString") throw new Error("Directions missing geometry");

      src.setData({
        type: "FeatureCollection",
        features: [{ type: "Feature", geometry: geom, properties: {} }],
      } as any);

      console.info("[CertisMap] Directions OK (road-following).");
    } catch (e) {
      console.warn("[CertisMap] Directions FAILED — fallback straight line:", e);
      src.setData({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "LineString", coordinates: coords },
            properties: { fallback: true },
          },
        ],
      } as any);
    }
  }

  useEffect(() => {
    updateRoute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripStops, token]);

  function handleRetailerClick(e: mapboxgl.MapMouseEvent) {
    const map = mapRef.current;
    if (!map) return;

    const features = map.queryRenderedFeatures(e.point, { layers: [LYR_RETAILERS, LYR_HQ] }) as any[];
    if (!features.length) return;

    const f = features[0];
    const p = f.properties ?? {};
    const coords = (f.geometry?.coordinates ?? []) as [number, number];

    const retailer = s(p.Retailer);
    const name = s(p.Name);
    const address = s(p.Address);
    const city = s(p.City);
    const state = s(p.State);
    const zip = s(p.Zip);
    const category = s(p.Category);
    const suppliers = s(p.Suppliers);

    const kind: StopKind = isCorporateHQ(category) ? "hq" : "retailer";
    const stop: Stop = {
      id: makeId(kind, coords, p),
      kind,
      label: kind === "hq" ? `${retailer || "Corporate HQ"} — Corporate HQ` : `${retailer || "Retailer"} — ${name || "Site"}`,
      retailer,
      name,
      address,
      city,
      state,
      zip,
      category,
      suppliers,
      coords,
    };

    const popupHtml = `
      <div style="font-size:13px;min-width:300px;max-width:320px;color:#fff;line-height:1.3;font-family:Segoe UI,Arial;">
        <div style="font-size:15px;font-weight:700;margin-bottom:4px;color:#facc15;">${retailer || "Unknown Retailer"}</div>
        ${name ? `<div style="font-style:italic;margin-bottom:4px;">${name}</div>` : ""}
        <div style="margin-bottom:4px;">${address}<br/>${city}, ${state} ${zip}</div>
        ${category ? `<div style="margin-bottom:6px;"><span style="font-weight:700;color:#facc15;">Category:</span> ${category}</div>` : ""}
        <div style="margin-bottom:8px;"><span style="font-weight:700;">Suppliers:</span><br/>${suppliers || "Not listed"}</div>
        <button id="add-stop-btn" style="padding:7px 10px;border:none;background:#facc15;border-radius:5px;font-weight:700;font-size:13px;color:#111827;cursor:pointer;width:100%;">
          ➕ Add to Trip
        </button>
      </div>
    `;

    const popup = new mapboxgl.Popup({ offset: 14, closeOnMove: false })
      .setLngLat(coords)
      .setHTML(popupHtml)
      .addTo(map);

    setTimeout(() => {
      const btn = document.getElementById("add-stop-btn");
      if (btn) btn.onclick = () => onAddStop(stop);
      // Keep popup; user can close
    }, 0);
  }

  function handleKingpinClick(e: mapboxgl.MapMouseEvent) {
    const map = mapRef.current;
    if (!map) return;

    const features = map.queryRenderedFeatures(e.point, { layers: [LYR_KINGPINS] }) as any[];
    if (!features.length) return;

    const f = features[0];
    const p = f.properties ?? {};
    const coords = (f.geometry?.coordinates ?? []) as [number, number];

    const retailer = s(p.Retailer);
    const address = s(p.Address);
    const city = s(p.City);
    const state = s(p.State);
    const zip = s(p.Zip);
    const category = s(p.Category);
    const suppliers = s(p.Suppliers) || "Not listed";

    const contactName = s(p.ContactName || p.Name || p.Contact || p["Contact Name"]);
    const contactTitle = s(p.ContactTitle || p.Title || p["Contact Title"]);
    const office = s(p.OfficePhone || p["Office Phone"] || p.PhoneOffice) || "TBD";
    const cell = s(p.CellPhone || p["Cell Phone"] || p.PhoneCell) || "TBD";
    const email = s(p.Email) || "TBD";

    const stop: Stop = {
      id: makeId("kingpin", coords, p),
      kind: "kingpin",
      label: contactName ? `${contactName} — ${retailer || "Kingpin"}` : `${retailer || "Kingpin"}`,
      retailer,
      name: contactName || "Kingpin",
      address,
      city,
      state,
      zip,
      category: category || "Kingpin",
      suppliers,
      phoneOffice: office,
      phoneCell: cell,
      email,
      coords,
    };

    const popupHtml = `
      <div style="font-size:13px;min-width:300px;max-width:320px;color:#fff;line-height:1.3;font-family:Segoe UI,Arial;">
        <div style="font-size:16px;font-weight:700;margin-bottom:6px;color:#facc15;">${retailer || "Unknown Retailer"}</div>
        <div style="margin-bottom:4px;">${address}<br/>${city}, ${state} ${zip}</div>
        ${category ? `<div style="margin-bottom:6px;"><span style="font-weight:700;color:#facc15;">Category:</span> ${category}</div>` : ""}
        <div style="margin-bottom:8px;"><span style="font-weight:700;">Suppliers:</span><br/>${suppliers}</div>
        ${contactName ? `<div style="font-weight:700;margin-bottom:2px;">${contactName}</div>` : ""}
        ${contactTitle ? `<div style="margin-bottom:4px;">${contactTitle}</div>` : ""}
        <div style="margin-bottom:4px;">Office: ${office} • Cell: ${cell}</div>
        <div style="margin-bottom:8px;">Email: ${email}</div>
        <button id="add-kingpin-btn" style="padding:7px 10px;border:none;background:#facc15;border-radius:5px;font-weight:700;font-size:13px;color:#111827;cursor:pointer;width:100%;">
          ➕ Add to Trip
        </button>
      </div>
    `;

    const popup = new mapboxgl.Popup({ offset: 14, closeOnMove: false })
      .setLngLat(coords)
      .setHTML(popupHtml)
      .addTo(map);

    setTimeout(() => {
      const btn = document.getElementById("add-kingpin-btn");
      if (btn) btn.onclick = () => onAddStop(stop);
    }, 0);
  }

  return <div ref={containerRef} className="w-full h-full" />;
}
