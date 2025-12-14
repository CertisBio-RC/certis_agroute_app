// ============================================================================
// 💠 CERTIS AGROUTE — K11 GOLD + Zoom-To Support
//   • Based on K11.3 (NaN-clean, deployed)
//   • Uses NEXT_PUBLIC_MAPBOX_TOKEN with fallback to utils/MAPBOX_TOKEN
//   • 100 m offset to Kingpins for separation from Corporate HQ
//   • Category line in Kingpin & Retailer/HQ popups
//   • Shows "TBD" for missing Kingpin phones
//   • Restores Home icon layer (Blue_Home.png) when homeCoords is set
//   • "Agronomy-dominant" coloring: any category containing Agronomy
//     (except Corporate HQ) uses the Agronomy color
//   • Adds zoomToStop prop so sidebar "Zoom To" button can fly the map
//   • Satellite-streets-v12 + Mercator (Bailey Rule)
//   • Static-export-safe — No TS errors — No JSX structure changes
// ============================================================================

"use client";

import { useEffect, useRef } from "react";
import mapboxgl, { Map, GeoJSONSource } from "mapbox-gl";
import { MAPBOX_TOKEN } from "../utils/token";

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------
export interface Stop {
  label: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  coords: [number, number];
}

export interface CertisMapProps {
  selectedStates: string[];
  selectedRetailers: string[];
  selectedCategories: string[];
  selectedSuppliers: string[];
  homeCoords: [number, number] | null;
  tripStops: Stop[];
  routeGeoJSON: any; // kept for prop compatibility (not used internally)
  onStatesLoaded: (states: string[]) => void;
  onRetailersLoaded: (retailers: string[]) => void;
  onSuppliersLoaded: (suppliers: string[]) => void;
  onRetailerSummary: (
    summary: {
      retailer: string;
      count: number;
      suppliers: string[];
      categories: string[];
      states: string[];
    }[]
  ) => void;
  onAllStopsLoaded: (stops: Stop[]) => void;
  onAddStop: (stop: Stop) => void;
  /** NEW: when this changes, map will fly to that Stop */
  zoomToStop: Stop | null;
}

// ---------------------------------------------------------------------------
// TOKEN HANDLING
// ---------------------------------------------------------------------------

// One place to resolve the effective token for both the map and Directions API.
// NEXT_PUBLIC_MAPBOX_TOKEN is replaced at build time; MAPBOX_TOKEN is a safe
// hardcoded fallback in utils/token.ts (local only, not committed elsewhere).
const EFFECTIVE_TOKEN =
  (process.env.NEXT_PUBLIC_MAPBOX_TOKEN as string | undefined) || MAPBOX_TOKEN || "";

mapboxgl.accessToken = EFFECTIVE_TOKEN;

// ---------------------------------------------------------------------------
// FILTER HELPERS
// ---------------------------------------------------------------------------

function buildRetailerFilterExpr(
  selectedStates: string[],
  selectedRetailers: string[],
  selectedCategories: string[],
  selectedSuppliers: string[]
): any[] {
  const filter: any[] = [
    "all",
    ["!=", ["downcase", ["get", "Category"]], "corporate hq"],
    ["!=", ["downcase", ["get", "Category"]], "kingpin"]
  ];

  if (selectedStates.length) {
    filter.push(["in", ["downcase", ["get", "State"]], ["literal", selectedStates]]);
  }
  if (selectedRetailers.length) {
    filter.push([
      "in",
      ["downcase", ["get", "Retailer"]],
      ["literal", selectedRetailers]
    ]);
  }
  if (selectedCategories.length) {
    filter.push([
      "in",
      ["downcase", ["get", "Category"]],
      ["literal", selectedCategories]
    ]);
  }
  if (selectedSuppliers.length) {
    const ors = selectedSuppliers.map((s) => [
      ">=",
      ["index-of", s.toLowerCase(), ["downcase", ["get", "Suppliers"]]],
      0
    ]);
    filter.push(["any", ...ors]);
  }

  return filter;
}

// HQ filters ONLY by State — Bailey Rule
function buildCorpHqFilterExpr(selectedStates: string[]): any[] {
  const filter: any[] = ["all", ["==", ["downcase", ["get", "Category"]], "corporate hq"]];
  if (selectedStates.length) {
    filter.push(["in", ["downcase", ["get", "State"]], ["literal", selectedStates]]);
  }
  return filter;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function CertisMap(props: CertisMapProps) {
  const {
    selectedStates,
    selectedRetailers,
    selectedCategories,
    selectedSuppliers,
    homeCoords,
    tripStops,
    onStatesLoaded,
    onRetailersLoaded,
    onSuppliersLoaded,
    onRetailerSummary,
    onAllStopsLoaded,
    onAddStop,
    zoomToStop
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);

  // INITIAL MAP LOAD ---------------------------------------------------------
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [-93.5, 41.5],
      zoom: 5,
      projection: { name: "mercator" }
    });

    mapRef.current = map;
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

    Promise.all([
      fetch(`${basePath}/data/retailers.geojson`).then((r) => r.json()),
      fetch(`${basePath}/data/kingpin.geojson`).then((r) => r.json())
    ]).then(([retailersData, kingpinData]) => {
      const m = mapRef.current;
      if (!m) return;

      // ================================================================
      // 💛 APPLY 100m OFFSET TO KINGPINS
      // ================================================================
      // ≈100m at this latitude
      const OFFSET_LNG = 0.0013;

      const offsetKingpins = {
        ...kingpinData,
        features: (kingpinData.features ?? []).map((f: any) => {
          const [lng, lat] = f.geometry.coordinates ?? [0, 0];
          return {
            ...f,
            geometry: {
              ...f.geometry,
              coordinates: [lng + OFFSET_LNG, lat]
            }
          };
        })
      };

      const all = [...(retailersData.features ?? []), ...offsetKingpins.features];

      // All Stops → Trip Builder master list
      onAllStopsLoaded(
        all
          .map((f: any) => {
            const p = f.properties ?? {};
            const c = f.geometry?.coordinates;
            if (!c) return null;

            // Label logic:
            //   • Retailers: Name or Retailer
            //   • Kingpins: ContactName or Retailer
            const label =
              p.ContactName?.toString().trim() ||
              p.Name?.toString().trim() ||
              p.Retailer?.toString().trim() ||
              "Unknown";

            return {
              label,
              address: p.Address || "",
              city: p.City || "",
              state: p.State || "",
              zip: p.Zip || "",
              coords: c as [number, number]
            } as Stop;
          })
          .filter(Boolean) as Stop[]
      );

      // FILTER DROPDOWNS -----------------------------------------------------
      onStatesLoaded(
        [
          ...new Set(
            all
              .map((f) => String(f.properties?.State ?? "").trim().toUpperCase())
              .filter(Boolean)
          )
        ].sort()
      );

      onRetailersLoaded(
        [
          ...new Set(
            (retailersData.features ?? []).map(
              (f: any) => String(f.properties?.Retailer ?? "").trim()
            )
          )
        ]
          .filter(Boolean)
          .sort() as string[]
      );

      onSuppliersLoaded(
        [
          ...new Set(
            all.flatMap((f: any) =>
              String(f.properties?.Suppliers || "")
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            )
          )
        ].sort()
      );

      // ADD SOURCES ----------------------------------------------------------
      m.addSource("retailers", { type: "geojson", data: retailersData });
      m.addSource("kingpins", { type: "geojson", data: offsetKingpins });

      // LAYERS ---------------------------------------------------------------
      m.addLayer({
        id: "retailers-circle",
        type: "circle",
        source: "retailers",
        filter: buildRetailerFilterExpr([], [], [], []),
        paint: {
          "circle-radius": 4,
          // AGRONOMY-DOMINANT COLORING:
          //  • If Category string contains "agronomy" (and is NOT Corporate HQ),
          //    always use Agronomy green — even if other categories are present.
          //  • Otherwise fall through to Grain/Feed, C-Store/Service/Energy,
          //    Distribution, or default light gray.
          "circle-color": [
            "case",
            // 1) Agronomy present anywhere in Category (non-HQ)
            [
              "all",
              [">=", ["index-of", "agronomy", ["downcase", ["get", "Category"]]], 0],
              ["!=", ["downcase", ["get", "Category"]], "corporate hq"]
            ],
            "#22c55e", // Agronomy green

            // 2) Grain/Feed present
            [
              ">=",
              ["index-of", "grain/feed", ["downcase", ["get", "Category"]]],
              0
            ],
            "#f97316", // Grain/Feed orange

            // 3) C-Store/Service/Energy present
            [
              ">=",
              ["index-of", "c-store/service/energy", ["downcase", ["get", "Category"]]],
              0
            ],
            "#0ea5e9", // C-Store blue

            // 4) Distribution present
            [
              ">=",
              ["index-of", "distribution", ["downcase", ["get", "Category"]]],
              0
            ],
            "#a855f7", // Distribution purple

            // 5) Fallback
            "#f9fafb"
          ],
          "circle-stroke-width": 1,
          "circle-stroke-color": "#111827"
        }
      });

      m.addLayer({
        id: "corp-hq-circle",
        type: "circle",
        source: "retailers",
        filter: buildCorpHqFilterExpr([]),
        paint: {
          "circle-radius": 7,
          "circle-color": "#ff0000",
          "circle-stroke-color": "#facc15",
          "circle-stroke-width": 2
        }
      });

      // Kingpin icon
      const icon = new Image();
      icon.onload = () => {
        if (!m.hasImage("kingpin-icon")) {
          m.addImage("kingpin-icon", icon, { pixelRatio: 2 });
        }
        m.addLayer({
          id: "kingpin-symbol",
          type: "symbol",
          source: "kingpins",
          layout: {
            "icon-image": "kingpin-icon",
            "icon-size": 0.03,
            "icon-anchor": "bottom",
            "icon-allow-overlap": true
          }
        });
      };
      icon.src = `${basePath}/icons/kingpin.png`;

      // PRECISION CURSOR -----------------------------------------------------
      ["retailers-circle", "corp-hq-circle", "kingpin-symbol"].forEach((l) => {
        m.on("mouseenter", l, () => {
          m.getCanvas().style.cursor = "default";
        });
        m.on("mouseleave", l, () => {
          m.getCanvas().style.cursor = "";
        });
      });

      // POPUP — Retailers + HQ ----------------------------------------------
      const clickRetail = (e: any) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties ?? {};
        const [lng, lat] = f.geometry?.coordinates ?? [];

        const retailerTitle = (p.Retailer || "").trim() || "Unknown Retailer";
        const subLabel = (p.Name || "").trim();
        const suppliers =
          p.Suppliers?.split(",")
            .map((s: string) => s.trim())
            .filter(Boolean)
            .join(", ") || "Not listed";
        const category = (p.Category || "").toString().trim();

        const stop: Stop = {
          label: subLabel || retailerTitle,
          address: p.Address || "",
          city: p.City || "",
          state: p.State || "",
          zip: p.Zip || "",
          coords: [lng, lat]
        };

        const div = document.createElement("div");
        div.style.cssText =
          "font-size:13px;min-width:300px;max-width:320px;color:#fff;line-height:1.3;font-family:Segoe UI,Arial;";
        div.innerHTML = `
          <div style="font-size:15px;font-weight:700;margin-bottom:4px;color:#facc15;">${retailerTitle}</div>
          ${subLabel ? `<div style="font-style:italic;margin-bottom:4px;">${subLabel}</div>` : ""}
          <div style="margin-bottom:4px;">${stop.address}<br/>${stop.city}, ${stop.state} ${stop.zip}</div>
          ${
            category
              ? `<div style="margin-bottom:6px;"><span style="font-weight:700;color:#facc15;">Category:</span> ${category}</div>`
              : ""
          }
          <div style="margin-bottom:8px;"><span style="font-weight:700;">Suppliers:</span><br/>${suppliers}</div>
          <button id="add-stop" style="padding:7px 10px;border:none;background:#facc15;
            border-radius:5px;font-weight:700;font-size:13px;color:#111827;cursor:pointer;width:100%;">
            ➕ Add to Trip
          </button>
        `;
        new mapboxgl.Popup({ offset: 14, closeOnMove: false })
          .setLngLat([lng, lat])
          .setDOMContent(div)
          .addTo(m);

        div.querySelector("#add-stop")?.addEventListener("click", () => onAddStop(stop));
      };

      m.on("click", "retailers-circle", clickRetail);
      m.on("click", "corp-hq-circle", clickRetail);

      // POPUP — Kingpin ------------------------------------------------------
      const clickKingpin = (e: any) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties ?? {};
        const [lng, lat] = f.geometry?.coordinates ?? [];

        const retailerTitle = (p.Retailer || "").trim() || "Unknown Retailer";
        const address = (p.Address || "").trim();
        const city = (p.City || "").trim();
        const state = (p.State || "").trim();
        const zip = (p.Zip || "").trim();
        const category = (p.Category || "").toString().trim();
        const suppliers = (p.Suppliers || "").toString().trim() || "Not listed";

        const contactName = (p.ContactName || "").trim();
        const contactTitle = (p.ContactTitle || p.Title || "").trim();
        const office = (p.OfficePhone || "").toString().trim();
        const cell = (p.CellPhone || "").toString().trim();
        const email = (p.Email || "").toString().trim();

        // Always show phones; "TBD" when missing
        const officeDisplay = office || "TBD";
        const cellDisplay = cell || "TBD";
        const contactLine = `Office: ${officeDisplay}, Cell: ${cellDisplay}`;

        const stop: Stop = {
          label: contactName || retailerTitle,
          address,
          city,
          state,
          zip,
          coords: [lng, lat]
        };

        const div = document.createElement("div");
        div.style.cssText =
          "font-size:13px;min-width:300px;max-width:320px;color:#fff;line-height:1.3;font-family:Segoe UI,Arial;";
        div.innerHTML = `
          <div style="font-size:16px;font-weight:700;margin-bottom:6px;color:#facc15;">${retailerTitle}</div>
          <div style="margin-bottom:4px;">${address}<br/>${city}, ${state} ${zip}</div>
          ${
            category
              ? `<div style="margin-bottom:6px;"><span style="font-weight:700;color:#facc15;">Category:</span> ${category}</div>`
              : ""
          }
          <div style="margin-bottom:8px;"><span style="font-weight:700;">Suppliers:</span><br/>${suppliers}</div>
          ${contactName ? `<div style="font-weight:700;margin-bottom:2px;">${contactName}</div>` : ""}
          ${contactTitle ? `<div style="margin-bottom:4px;">${contactTitle}</div>` : ""}
          <div style="margin-bottom:4px;">${contactLine}</div>
          ${email ? `<div style="margin-bottom:8px;">Email: ${email}</div>` : ""}
          <button id="add-kingpin-stop" style="padding:7px 10px;border:none;background:#facc15;
            border-radius:5px;font-weight:700;font-size:13px;color:#111827;cursor:pointer;width:100%;">
            ➕ Add to Trip
          </button>
        `;
        new mapboxgl.Popup({ offset: 14, closeOnMove: false })
          .setLngLat([lng, lat])
          .setDOMContent(div)
          .addTo(m);

        div
          .querySelector("#add-kingpin-stop")
          ?.addEventListener("click", () => onAddStop(stop));
      };

      m.on("click", "kingpin-symbol", clickKingpin);
    });
  }, [
    onAllStopsLoaded,
    onRetailersLoaded,
    onRetailerSummary,
    onStatesLoaded,
    onSuppliersLoaded,
    onAddStop
  ]); // END INITIAL MAP USEEFFECT

  // ========================================================================
  // FILTERS + SUMMARY — only visible retailers
  // ========================================================================
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    if (!m.getLayer("retailers-circle")) return;

    m.setFilter(
      "retailers-circle",
      buildRetailerFilterExpr(
        selectedStates,
        selectedRetailers,
        selectedCategories,
        selectedSuppliers
      )
    );

    if (m.getLayer("corp-hq-circle")) {
      m.setFilter("corp-hq-circle", buildCorpHqFilterExpr(selectedStates));
    }

    try {
      const visible = m.queryRenderedFeatures({ layers: ["retailers-circle"] });
      const summary: Record<
        string,
        { count: number; suppliers: Set<string>; categories: Set<string>; states: Set<string> }
      > = {};

      visible.forEach((f: any) => {
        const p = f.properties ?? {};
        const name = (p.Retailer || p.Name || "").trim();
        if (!name) return;

        if (!summary[name]) {
          summary[name] = {
            count: 0,
            suppliers: new Set(),
            categories: new Set(),
            states: new Set()
          };
        }

        const s = summary[name];
        s.count++;

        if (p.Suppliers) {
          p.Suppliers.split(",")
            .map((v: string) => v.trim())
            .filter(Boolean)
            .forEach((v) => s.suppliers.add(v));
        }
        if (p.Category) s.categories.add(p.Category);
        if (p.State) s.states.add(p.State);
      });

      onRetailerSummary(
        Object.entries(summary).map(([retailer, s]) => ({
          retailer,
          count: s.count,
          suppliers: [...s.suppliers],
          categories: [...s.categories],
          states: [...s.states]
        }))
      );
    } catch {
      // swallow issues from queryRenderedFeatures during rapid filter changes
    }
  }, [
    selectedStates,
    selectedRetailers,
    selectedCategories,
    selectedSuppliers,
    onRetailerSummary
  ]);

  // ========================================================================
  // TRIP ROUTE — Mapbox Directions (K11.1)
  //   • Uses mapboxgl.accessToken (same as basemap)
  //   • Falls back to straight line if Directions fails
  // ========================================================================

  const MAPBOX_DIRECTIONS_URL =
    "https://api.mapbox.com/directions/v5/mapbox/driving";

  type SimpleStop = { lon: number; lat: number };

  /**
   * Build a road-following route using Mapbox Directions API.
   * Falls back to a straight LineString if Directions fails for any reason.
   */
  async function buildRouteGeometry(
    stops: SimpleStop[]
  ): Promise<GeoJSON.LineString | null> {
    if (!stops || stops.length < 2) {
      return null;
    }

    // Use the same token the basemap is using
    const token = mapboxgl.accessToken;

    if (!token) {
      console.warn(
        "[Route] No token on mapboxgl.accessToken; falling back to straight line."
      );
      return {
        type: "LineString",
        coordinates: stops.map((s) => [s.lon, s.lat])
      };
    }

    // Build coordinates string "lon,lat;lon,lat;..."
    const coordsStr = stops
      .map((s) => `${s.lon.toFixed(6)},${s.lat.toFixed(6)}`)
      .join(";");

    const url = `${MAPBOX_DIRECTIONS_URL}/${coordsStr}?geometries=geojson&overview=full&access_token=${encodeURIComponent(
      token
    )}`;

    try {
      const res = await fetch(url);

      if (!res.ok) {
        console.warn(
          `[Route] Directions error ${res.status} — falling back to straight line.`
        );
        return {
          type: "LineString",
          coordinates: stops.map((s) => [s.lon, s.lat])
        };
      }

      const data = await res.json();
      const route = data?.routes?.[0]?.geometry;

      if (
        !route ||
        route.type !== "LineString" ||
        !Array.isArray(route.coordinates)
      ) {
        console.warn(
          "[Route] No valid LineString geometry in directions response; falling back to straight line."
        );
        return {
          type: "LineString",
          coordinates: stops.map((s) => [s.lon, s.lat])
        };
      }

      // ✅ Happy path: road-following geometry from Mapbox
      return route as GeoJSON.LineString;
    } catch (err) {
      console.warn(
        "[Route] Directions exception — falling back to straight line.",
        err
      );
      return {
        type: "LineString",
        coordinates: stops.map((s) => [s.lon, s.lat])
      };
    }
  }

  // ========================================================================
  // ZOOM-TO — when sidebar requests a specific Stop
  // ========================================================================
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !zoomToStop) return;

    const [lng, lat] = zoomToStop.coords;

    m.flyTo({
      center: [lng, lat],
      zoom: 12.5,
      speed: 1.2,
      curve: 1.4,
      essential: true
    });
  }, [zoomToStop]);

  // ========================================================================
  // HOME ICON — Blue_Home.png at homeCoords
  // ========================================================================
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;

    const sourceId = "home-marker";
    const layerId = "home-marker";

    if (!homeCoords) {
      if (m.getLayer(layerId)) m.removeLayer(layerId);
      if (m.getSource(sourceId)) m.removeSource(sourceId);
      return;
    }

    const feature = {
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: homeCoords
      },
      properties: {}
    };

    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

    if (!m.getSource(sourceId)) {
      m.addSource(sourceId, { type: "geojson", data: feature });

      const img = new Image();
      img.onload = () => {
        if (!m.hasImage("home-icon")) {
          m.addImage("home-icon", img, { pixelRatio: 2 });
        }
        if (!m.getLayer(layerId)) {
          m.addLayer({
            id: layerId,
            type: "symbol",
            source: sourceId,
            layout: {
              "icon-image": "home-icon",
              "icon-size": 0.06,
              "icon-anchor": "bottom",
              "icon-allow-overlap": true
            }
          });
        }
      };
      img.src = `${basePath}/icons/Blue_Home.png`;
    } else {
      (m.getSource(sourceId) as GeoJSONSource).setData(feature);
    }
  }, [homeCoords]);

  // ========================================================================
  // CLEANUP — prevent duplicate map + memory leaks
  // ========================================================================
  useEffect(() => {
    const m = mapRef.current;
    return () => {
      try {
        m?.remove();
      } catch {
        // ignore
      }
    };
  }, []);

  // ========================================================================
  // RENDER
  // ========================================================================
  return <div ref={containerRef} className="w-full h-full" />;
}
