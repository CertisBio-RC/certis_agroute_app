"use client";

// ============================================================================
// 💠 CERTIS AGROUTE DATABASE — GOLD (K11 hardening + popup safety + resize debounce)
//   • Satellite-streets-v12 + Mercator (Bailey Rule)
//   • Retailers filtered by: State ∩ Retailer ∩ Category ∩ Supplier
//   • Corporate HQ filtered ONLY by State (Bailey HQ rule)
//   • Kingpins always visible overlay (not filtered)
//   • Applies ~100m offset to Kingpins (lng + 0.0013) like K10
//   • Kingpin icon size is ZOOM-SCALED (prevents giant stars)
//   • Trip route: Mapbox Directions (driving) + straight-line fallback
//   • ✅ Route honors Home ZIP and works with 1 stop (Home + stop)
//   • ✅ Route rebuilds on homeCoords change; aborts in-flight calls (loop guard)
//   • ✅ Map RESIZES on container changes (debounced; prevents “black half-page”)
//   • ✅ Popup buttons use unique IDs per-stop (prevents collisions)
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
const KINGPIN_OFFSET_LNG = 0.0013;

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

/** Corporate HQ rule used consistently across: stop kind + layer filters */
function isCorporateHQ(category: string) {
  const c = (category || "").toLowerCase();
  return c.includes("corporate") && c.includes("hq");
}

/** Escape user/data-provided strings for safe HTML injection into popup */
function escapeHtml(input: string) {
  return (input ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
    onAllStopsLoaded,
    onAddStop,
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  const retailersRef = useRef<FeatureCollection | null>(null);
  const kingpinsRef = useRef<FeatureCollection | null>(null);

  const homeMarkerRef = useRef<mapboxgl.Marker | null>(null);

  // Directions guards
  const directionsAbortRef = useRef<AbortController | null>(null);
  const routeDebounceRef = useRef<number | null>(null);
  const lastRouteKeyRef = useRef<string>("");

  // Resize guard
  const resizeObsRef = useRef<ResizeObserver | null>(null);
  const resizeDebounceRef = useRef<number | null>(null);

  const basePath = useMemo(() => {
    const bp = (process.env.NEXT_PUBLIC_BASE_PATH || "/certis_agroute_app").trim();
    return bp || "/certis_agroute_app";
  }, []);

  const token = useMemo(() => {
    const env = (process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "").trim();
    return env || (MAPBOX_TOKEN || "").trim();
  }, []);

  // Ensure mapbox token is set once
  useEffect(() => {
    if (!mapboxgl.accessToken) mapboxgl.accessToken = token;
  }, [token]);

  // INIT MAP (once) — no volatile deps (Bailey loop guard)
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

    // ✅ ResizeObserver (debounced) — prevents route/map churn from layout changes
    try {
      resizeObsRef.current = new ResizeObserver(() => {
        if (resizeDebounceRef.current) window.clearTimeout(resizeDebounceRef.current);
        resizeDebounceRef.current = window.setTimeout(() => {
          const m = mapRef.current;
          if (!m) return;
          try {
            m.resize();
          } catch {}
        }, 80);
      });
      resizeObsRef.current.observe(containerRef.current);
    } catch {}

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

      // Retailers (non-HQ)
      if (!map.getLayer(LYR_RETAILERS)) {
        map.addLayer({
          id: LYR_RETAILERS,
          type: "circle",
          source: SRC_RETAILERS,
          // ✅ Exclude Corporate HQ consistently: must contain "corporate" AND "hq"
          filter: [
            "all",
            ["==", ["index-of", "corporate", ["downcase", ["get", "Category"]]], -1],
            ["==", ["index-of", "hq", ["downcase", ["get", "Category"]]], -1],
          ],
          paint: {
            "circle-radius": 4,
            "circle-stroke-width": 1,
            "circle-stroke-color": "#111827",
            "circle-color": [
              "case",
              [
                "all",
                [">=", ["index-of", "agronomy", ["downcase", ["get", "Category"]]], 0],
                ["==", ["index-of", "corporate", ["downcase", ["get", "Category"]]], -1],
              ],
              "#22c55e",
              [">=", ["index-of", "grain", ["downcase", ["get", "Category"]]], 0],
              "#f97316",
              [
                "any",
                [">=", ["index-of", "c-store", ["downcase", ["get", "Category"]]], 0],
                [">=", ["index-of", "service", ["downcase", ["get", "Category"]]], 0],
                [">=", ["index-of", "energy", ["downcase", ["get", "Category"]]], 0],
              ],
              "#0ea5e9",
              [">=", ["index-of", "distribution", ["downcase", ["get", "Category"]]], 0],
              "#a855f7",
              "#f9fafb",
            ],
          },
        });
      }

      // Corporate HQ (same source, separate filter; Bailey HQ rule = State only)
      if (!map.getLayer(LYR_HQ)) {
        map.addLayer({
          id: LYR_HQ,
          type: "circle",
          source: SRC_RETAILERS,
          filter: [
            "all",
            [">=", ["index-of", "corporate", ["downcase", ["get", "Category"]]], 0],
            [">=", ["index-of", "hq", ["downcase", ["get", "Category"]]], 0],
          ],
          paint: {
            "circle-radius": 7,
            "circle-color": "#ff0000",
            "circle-stroke-color": "#facc15",
            "circle-stroke-width": 2,
          },
        });
      }

      // Kingpin icon
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
            "icon-size": ["interpolate", ["linear"], ["zoom"], 3, 0.015, 5, 0.025, 7, 0.035, 9, 0.045, 12, 0.055],
            "icon-anchor": "bottom",
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
          },
        });
      }

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

      await loadData();
      applyFilters();
      updateHomeMarker();
      await updateRoute(true);

      const setPointer = () => (map.getCanvas().style.cursor = "pointer");
      const clearPointer = () => (map.getCanvas().style.cursor = "");

      [LYR_RETAILERS, LYR_HQ, LYR_KINGPINS].forEach((lyr) => {
        map.on("mouseenter", lyr, setPointer);
        map.on("mouseleave", lyr, clearPointer);
      });

      map.on("click", LYR_RETAILERS, (e) => handleRetailerClick(e));
      map.on("click", LYR_HQ, (e) => handleRetailerClick(e));
      map.on("click", LYR_KINGPINS, (e) => handleKingpinClick(e));

      // Final resize after load
      requestAnimationFrame(() => {
        try {
          map.resize();
        } catch {}
      });

      console.info("[CertisMap] Loaded.");
    });

    return () => {
      try {
        directionsAbortRef.current?.abort();
      } catch {}
      directionsAbortRef.current = null;

      if (routeDebounceRef.current) {
        window.clearTimeout(routeDebounceRef.current);
        routeDebounceRef.current = null;
      }

      if (resizeDebounceRef.current) {
        window.clearTimeout(resizeDebounceRef.current);
        resizeDebounceRef.current = null;
      }

      try {
        resizeObsRef.current?.disconnect();
      } catch {}
      resizeObsRef.current = null;

      try {
        map.remove();
      } catch {}
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadData() {
    const map = mapRef.current;
    if (!map) return;

    const retailersUrl = `${basePath}/data/retailers.geojson`;
    const kingpinsUrl = `${basePath}/data/kingpin.geojson`;

    const [r1, r2] = await Promise.all([fetch(retailersUrl), fetch(kingpinsUrl)]);
    if (!r1.ok) throw new Error(`Retailers fetch failed: ${r1.status}`);
    if (!r2.ok) throw new Error(`Kingpins fetch failed: ${r2.status}`);

    const retailersData = (await r1.json()) as FeatureCollection;
    const kingpinData = (await r2.json()) as FeatureCollection;

    const offsetKingpins: FeatureCollection = {
      ...kingpinData,
      features: (kingpinData.features ?? []).map((f: any) => {
        const [lng, lat] = (f.geometry?.coordinates ?? [0, 0]) as [number, number];
        return { ...f, geometry: { ...f.geometry, coordinates: [lng + KINGPIN_OFFSET_LNG, lat] } };
      }),
    };

    retailersRef.current = retailersData;
    kingpinsRef.current = offsetKingpins;

    (map.getSource(SRC_RETAILERS) as mapboxgl.GeoJSONSource).setData(retailersData as any);
    (map.getSource(SRC_KINGPINS) as mapboxgl.GeoJSONSource).setData(offsetKingpins as any);

    const allStops: Stop[] = [];

    // Retailers + HQ stops
    for (const f of retailersData.features ?? []) {
      const p = f.properties ?? {};
      const coords = f.geometry?.coordinates;
      if (!coords) continue;

      const category = s(p.Category);
      const kind: StopKind = isCorporateHQ(category) ? "hq" : "retailer";

      const retailer = s(p.Retailer);
      const name = s(p.Name);

      const label =
        kind === "hq"
          ? `${retailer || "Corporate HQ"} — Corporate HQ`
          : `${retailer || "Retailer"} — ${name || "Site"}`;

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

    // Kingpins
    for (const f of offsetKingpins.features ?? []) {
      const p = f.properties ?? {};
      const coords = f.geometry?.coordinates;
      if (!coords) continue;

      const retailer = s(p.Retailer);
      const contactName = s(p.Name || p.Contact || p.ContactName || p["Contact Name"]);
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

    // Sidebar option lists
    onStatesLoaded(uniqSorted(allStops.map((st) => s(st.state).toUpperCase()).filter(Boolean)));

    onRetailersLoaded(
      uniqSorted((retailersData.features ?? []).map((f: any) => s(f.properties?.Retailer)).filter(Boolean))
    );

    onCategoriesLoaded(
      uniqSorted((retailersData.features ?? []).flatMap((f: any) => splitCategories(f.properties?.Category)))
    );

    onSuppliersLoaded(uniqSorted(allStops.flatMap((st) => splitMulti(st.suppliers))));
  }

  function applyFilters() {
    const map = mapRef.current;
    const retailersData = retailersRef.current;
    if (!map || !retailersData) return;

    // Retailers = State ∩ Retailer ∩ Category ∩ Supplier (and NOT Corporate HQ)
    const retailerFilter: any[] = ["all"];

    // Exclude Corporate HQ using the SAME logic (corporate AND hq)
    retailerFilter.push(["==", ["index-of", "corporate", ["downcase", ["get", "Category"]]], -1]);
    retailerFilter.push(["==", ["index-of", "hq", ["downcase", ["get", "Category"]]], -1]);

    if (selectedStates.length) {
      retailerFilter.push(["in", ["upcase", ["get", "State"]], ["literal", selectedStates]]);
    }
    if (selectedRetailers.length) {
      retailerFilter.push(["in", ["get", "Retailer"], ["literal", selectedRetailers]]);
    }

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

    // Corporate HQ = State only (Bailey HQ rule)
    const hqFilter: any[] = ["all"];
    hqFilter.push([">=", ["index-of", "corporate", ["downcase", ["get", "Category"]]], 0]);
    hqFilter.push([">=", ["index-of", "hq", ["downcase", ["get", "Category"]]], 0]);

    if (selectedStates.length) {
      hqFilter.push(["in", ["upcase", ["get", "State"]], ["literal", selectedStates]]);
    }

    map.setFilter(LYR_RETAILERS, retailerFilter as any);
    map.setFilter(LYR_HQ, hqFilter as any);
  }

  useEffect(() => {
    applyFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStates, selectedRetailers, selectedCategories, selectedSuppliers]);

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
      el.className = "home-marker"; // keeps your globals.css .home-marker rules
      el.style.backgroundImage = `url(${iconUrl})`;

      homeMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: "bottom" })
        .setLngLat(homeCoords)
        .addTo(map);
    } else {
      homeMarkerRef.current.setLngLat(homeCoords);
    }
  }

  useEffect(() => {
    updateHomeMarker();
    updateRoute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeCoords]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !zoomToStop) return;
    map.flyTo({ center: zoomToStop.coords, zoom: 12.5, essential: true });
  }, [zoomToStop]);

  function buildRouteCoords(): [number, number][] {
    const pts: [number, number][] = [];
    if (homeCoords) pts.push(homeCoords);
    for (const st of tripStops || []) pts.push(st.coords);
    return pts;
  }

  async function updateRoute(force = false) {
    const map = mapRef.current;
    if (!map) return;

    const src = map.getSource(SRC_ROUTE) as mapboxgl.GeoJSONSource | undefined;
    if (!src) return;

    const pts = buildRouteCoords();

    if (pts.length < 2) {
      src.setData({ type: "FeatureCollection", features: [] } as any);
      lastRouteKeyRef.current = "";
      return;
    }

    const key = pts.map((c) => `${c[0].toFixed(6)},${c[1].toFixed(6)}`).join("|");
    if (!force && key === lastRouteKeyRef.current) return;
    lastRouteKeyRef.current = key;

    if (routeDebounceRef.current) window.clearTimeout(routeDebounceRef.current);
    routeDebounceRef.current = window.setTimeout(async () => {
      try {
        directionsAbortRef.current?.abort();
      } catch {}
      const controller = new AbortController();
      directionsAbortRef.current = controller;

      const coordsStr = pts.map((c) => `${c[0]},${c[1]}`).join(";");

      const url =
        `https://api.mapbox.com/directions/v5/mapbox/driving/${coordsStr}` +
        `?geometries=geojson&overview=full&steps=false&access_token=${encodeURIComponent(token)}`;

      try {
        const resp = await fetch(url, { signal: controller.signal });
        if (!resp.ok) throw new Error(`Directions HTTP ${resp.status} ${resp.statusText}`);
        const json: any = await resp.json();

        const geom = json?.routes?.[0]?.geometry;
        if (!geom || geom.type !== "LineString") throw new Error("Directions missing geometry");

        src.setData({
          type: "FeatureCollection",
          features: [{ type: "Feature", geometry: geom, properties: {} }],
        } as any);
      } catch (e: any) {
        if (e?.name === "AbortError") return;

        // Fallback: straight-line polyline through the stops
        src.setData({
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: { type: "LineString", coordinates: pts },
              properties: { fallback: true },
            },
          ],
        } as any);
      }
    }, 150);
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

    const btnId = `add-stop-${stop.id.replaceAll(/[^a-zA-Z0-9_-]/g, "_")}`;

    const popupHtml = `
      <div>
        <h3>${escapeHtml(retailer || "Unknown Retailer")}</h3>
        ${name ? `<p><em>${escapeHtml(name)}</em></p>` : ""}
        <p>${escapeHtml(address)}<br/>${escapeHtml(city)}${city ? ", " : ""}${escapeHtml(state)} ${escapeHtml(zip)}</p>
        ${category ? `<p><strong>Category:</strong> ${escapeHtml(category)}</p>` : ""}
        <p><strong>Suppliers:</strong><br/>${escapeHtml(suppliers || "Not listed")}</p>
        <button id="${btnId}" style="padding:7px 10px;border:none;background:#facc15;border-radius:6px;font-weight:800;font-size:13px;color:#111827;cursor:pointer;width:100%;">
          ➕ Add to Trip
        </button>
      </div>
    `;

    const popup = new mapboxgl.Popup({ offset: 14, closeOnMove: false }).setLngLat(coords).setHTML(popupHtml).addTo(map);

    // Attach handler safely to THIS popup only
    requestAnimationFrame(() => {
      const el = popup.getElement();
      const btn = el?.querySelector<HTMLButtonElement>(`#${CSS.escape(btnId)}`);
      if (btn) btn.onclick = () => onAddStop(stop);
    });
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

    const btnId = `add-kingpin-${stop.id.replaceAll(/[^a-zA-Z0-9_-]/g, "_")}`;

    const popupHtml = `
      <div>
        <h3>${escapeHtml(retailer || "Unknown Retailer")}</h3>
        <p>${escapeHtml(address)}<br/>${escapeHtml(city)}${city ? ", " : ""}${escapeHtml(state)} ${escapeHtml(zip)}</p>
        ${category ? `<p><strong>Category:</strong> ${escapeHtml(category)}</p>` : ""}
        <p><strong>Suppliers:</strong><br/>${escapeHtml(suppliers)}</p>
        ${contactName ? `<p><strong>${escapeHtml(contactName)}</strong></p>` : ""}
        ${contactTitle ? `<p>${escapeHtml(contactTitle)}</p>` : ""}
        <p>Office: ${escapeHtml(office)} • Cell: ${escapeHtml(cell)}</p>
        <p>Email: ${escapeHtml(email)}</p>
        <button id="${btnId}" style="padding:7px 10px;border:none;background:#facc15;border-radius:6px;font-weight:800;font-size:13px;color:#111827;cursor:pointer;width:100%;">
          ➕ Add to Trip
        </button>
      </div>
    `;

    const popup = new mapboxgl.Popup({ offset: 14, closeOnMove: false }).setLngLat(coords).setHTML(popupHtml).addTo(map);

    requestAnimationFrame(() => {
      const el = popup.getElement();
      const btn = el?.querySelector<HTMLButtonElement>(`#${CSS.escape(btnId)}`);
      if (btn) btn.onclick = () => onAddStop(stop);
    });
  }

  return <div ref={containerRef} className="w-full h-full min-h-0 bg-transparent" />;
}
