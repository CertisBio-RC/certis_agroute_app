// ============================================================================
// 💠 CERTIS AGROUTE — K4 GOLD (FULL + CORRECTED + BUILD-SAFE)
//   • Satellite-streets-v12 (Bailey Rule)
//   • Mercator projection (Bailey Rule)
//   • Retailers ∩ filtering
//   • Corporate HQ filters ONLY by State
//   • Kingpin popup WITHOUT Add-to-Trip (business-card layout)
//   • Retailer/CorpHQ popup WITH Add-to-Trip
//   • Route builder safe for static export
// ============================================================================

"use client";

import { useEffect, useRef } from "react";
import mapboxgl, { Map, GeoJSONSource } from "mapbox-gl";

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
  routeGeoJSON: any;
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
}

// ============================================================================
// FILTER EXPRESSIONS
// ============================================================================
function buildRetailerFilterExpr(
  selectedStates: string[],
  selectedRetailers: string[],
  selectedCategories: string[],
  selectedSuppliers: string[]
): any[] {
  const filter: any[] = [
    "all",
    ["!=", ["downcase", ["get", "Category"]], "corporate hq"],
    ["!=", ["downcase", ["get", "Category"]], "kingpin"],
  ];

  if (selectedStates.length)
    filter.push(["in", ["downcase", ["get", "State"]], ["literal", selectedStates]]);

  if (selectedRetailers.length)
    filter.push(["in", ["downcase", ["get", "Retailer"]], ["literal", selectedRetailers]]);

  if (selectedCategories.length)
    filter.push(["in", ["downcase", ["get", "Category"]], ["literal", selectedCategories]]);

  if (selectedSuppliers.length) {
    const ors = selectedSuppliers.map((s) => [
      ">=",
      ["index-of", s.toLowerCase(), ["downcase", ["get", "Suppliers"]]],
      0,
    ]);
    filter.push(["any", ...ors]);
  }

  return filter;
}

function buildCorpHqFilterExpr(selectedStates: string[]): any[] {
  const f: any[] = ["all", ["==", ["downcase", ["get", "Category"]], "corporate hq"]];
  if (selectedStates.length)
    f.push(["in", ["downcase", ["get", "State"]], ["literal", selectedStates]]);
  return f;
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
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);

  mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

  // ============================================================================
  // BLOCK 2 — INIT MAP + DATA LOAD + POPUPS
  // ============================================================================
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [-93.5, 41.5],
      zoom: 5,
      projection: { name: "mercator" },
    });

    mapRef.current = map;

    Promise.all([
      fetch(`${basePath}/data/retailers.geojson`).then((r) => r.json()),
      fetch(`${basePath}/data/kingpin.geojson`).then((r) => r.json()),
    ])
      .then(([retailersData, kingpinData]) => {
        const m = mapRef.current;
        if (!m) return;

        // ========= FILTER DROPDOWNS & STOPS LIST =========
        const all = [
          ...(retailersData.features ?? []),
          ...(kingpinData.features ?? []),
        ];

        const stops: Stop[] = all
          .map((f) => {
            const p = f.properties ?? {};
            const c = f.geometry?.coordinates;
            if (!c) return null;
            return {
              label: p.Name || p.Retailer || "Unknown",
              address: p.Address || "",
              city: p.City || "",
              state: p.State || "",
              zip: p.Zip || "",
              coords: c,
            };
          })
          .filter(Boolean) as Stop[];

        onAllStopsLoaded(stops);

        onStatesLoaded(
          [...new Set(all.map((f) => (f.properties?.State || "").trim().toUpperCase()))]
            .filter(Boolean)
            .sort()
        );

        onRetailersLoaded(
          [...new Set((retailersData.features ?? []).map((f) => (f.properties?.Retailer || "").trim()))]
            .filter(Boolean)
            .sort()
        );

        onSuppliersLoaded(
          [...new Set(
            all.flatMap((f) =>
              String(f.properties?.Suppliers || "")
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            )
          )].sort()
        );

        // ========= SOURCES =========
        m.addSource("retailers", { type: "geojson", data: retailersData });
        m.addSource("kingpins", { type: "geojson", data: kingpinData });

        // ========= RETAILERS =========
        m.addLayer({
          id: "retailers-circle",
          type: "circle",
          source: "retailers",
          filter: buildRetailerFilterExpr([], [], [], []),
          paint: {
            "circle-radius": 4,
            "circle-color": [
              "match",
              ["downcase", ["get", "Category"]],
              "agronomy", "#22c55e",
              "grain/feed", "#f97316",
              "c-store/service/energy", "#0ea5e9",
              "distribution", "#a855f7",
              "#f9fafb",
            ],
            "circle-stroke-width": 1,
            "circle-stroke-color": "#111827",
          },
        });

        // ========= CORPORATE HQ =========
        m.addLayer({
          id: "corp-hq-circle",
          type: "circle",
          source: "retailers",
          filter: buildCorpHqFilterExpr([]),
          paint: {
            "circle-radius": 7,
            "circle-color": "#ff0000",
            "circle-stroke-color": "#facc15",
            "circle-stroke-width": 2,
          },
        });

        // ========= KINGPIN ICON =========
        const img = new Image();
        img.onload = () => {
          if (!m.hasImage("kingpin-icon"))
            m.addImage("kingpin-icon", img, { pixelRatio: 2 });
          m.addLayer({
            id: "kingpin-symbol",
            type: "symbol",
            source: "kingpins",
            layout: {
              "icon-image": "kingpin-icon",
              "icon-size": 0.04,
              "icon-anchor": "bottom",
              "icon-allow-overlap": true,
            },
          });
        };
        img.src = `${basePath}/icons/kingpin.png`;

        // ========= CURSOR (precision) =========
        ["retailers-circle", "corp-hq-circle", "kingpin-symbol"].forEach((l) => {
          m.on("mouseenter", l, () => (m.getCanvas().style.cursor = "default"));
          m.on("mouseleave", l, () => (m.getCanvas().style.cursor = ""));
        });

        // ========= RETAILER & CORP HQ POPUP =========
        const clickRetail = (e: any) => {
          const f = e.features?.[0];
          if (!f) return;
          const p = f.properties ?? {};
          const [lng, lat] = f.geometry.coordinates;

          const title = (p.Retailer || "").trim() || "Unknown Retailer";
          const sub = (p.Name || "").trim();
          const suppliers =
            p.Suppliers?.split(",").map((s: string) => s.trim()).filter(Boolean).join(", ") ||
            "Not listed";

          const stop: Stop = {
            label: sub || title,
            address: p.Address || "",
            city: p.City || "",
            state: p.State || "",
            zip: p.Zip || "",
            coords: [lng, lat],
          };

          const div = document.createElement("div");
          div.style.fontSize = "13px";
          div.style.minWidth = "260px";
          div.style.color = "#ffffff";
          div.style.lineHeight = "1.3";
          div.style.fontFamily = "Segoe UI, Arial";

          const maybeItalic = sub
            ? `<div style="font-style:italic;color:#ffffff;">${sub}</div>`
            : "";

          div.innerHTML = `
            <div style="font-size:15px;font-weight:700;margin-bottom:4px;color:#facc15;">
              ${title}
            </div>
            ${maybeItalic}
            <div style="margin-bottom:6px;">
              ${stop.address}<br/>${stop.city}, ${stop.state} ${stop.zip}
            </div>
            <div style="margin-bottom:8px;">
              <span style="font-weight:700;">Suppliers:</span><br/>${suppliers}
            </div>
            <button id="add-stop"
              style="padding:7px 10px;margin-top:4px;border:none;background:#facc15;
                     border-radius:5px;font-weight:700;font-size:13px;color:#111827;
                     cursor:pointer;width:100%;">
              ➕ Add to Trip
            </button>
          `;

          new mapboxgl.Popup({ offset: 14, closeButton: true, closeOnMove: false, maxWidth: "300px" })
            .setLngLat([lng, lat])
            .setDOMContent(div)
            .addTo(m);

          div.querySelector("#add-stop")?.addEventListener("click", () => onAddStop(stop));
        };

        m.on("click", "retailers-circle", clickRetail);
        m.on("click", "corp-hq-circle", clickRetail);

        // ========= KINGPIN POPUP (no Add-to-Trip) =========
        const clickKingpin = (e: any) => {
          const f = e.features?.[0];
          if (!f) return;
          const p = f.properties ?? {};
          const [lng, lat] = f.geometry.coordinates;

          const title = (p["RETAILER NAME"] || "").trim() || "Unknown Retailer";
          const address = (p["ADDRESS"] || "").trim();
          const city = (p["CITY"] || "").trim();
          const state = (p["STATE"] || "").trim();
          const zip = (p["ZIP CODE"] || "").trim();
          const suppliers = (p["SUPPLIERS"] || "").trim() || "Not listed";

          const contactName = (p["CONTACT NAME"] || "").trim();
          const contactTitle = (p["CONTACT TITLE"] || "").trim();
          const office = (p["OFFICE PHONE"] || "").trim();
          const cell = (p["CELL PHONE"] || "").trim();
          const email = (p["EMAIL"] || "").trim();

          const contactLine =
            office || cell || email
              ? `O: ${office || "—"} — Cell: ${cell || "—"} — Email: ${email || "—"}`
              : "";

          const div = document.createElement("div");
          div.style.fontSize = "13px";
          div.style.minWidth = "270px";
          div.style.color = "#ffffff";
          div.style.lineHeight = "1.3";
          div.style.fontFamily = "Segoe UI, Arial";

          div.innerHTML = `
            <div style="font-size:16px;font-weight:700;margin-bottom:6px;color:#facc15;">
              ${title}
            </div>
            <div style="margin-bottom:6px;">
              ${address}<br/>${city}, ${state} ${zip}
            </div>
            ${contactName ? `<div style="font-weight:700;margin-bottom:2px;">${contactName}</div>` : ""}
            ${contactTitle ? `<div style="margin-bottom:6px;">${contactTitle}</div>` : ""}
            ${contactLine ? `<div style="margin-bottom:8px;">${contactLine}</div>` : ""}
            <div style="height:1px;background:#666;margin:6px 0;"></div>
            <div style="margin-bottom:4px;">
              <span style="font-weight:700;">Suppliers:</span><br/>${suppliers}
            </div>
          `;

          new mapboxgl.Popup({
            offset: 14,
            closeButton: true,
            closeOnMove: false,
            maxWidth: "300px",
          })
            .setLngLat([lng, lat])
            .setDOMContent(div)
            .addTo(m);
        };

        m.on("click", "kingpin-symbol", clickKingpin);
      });
  }, []); // END BLOCK 2

  // ============================================================================
  // BLOCK 3 — FILTERING + SUMMARY
  // ============================================================================
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;

    const retailersExist = m.getLayer("retailers-circle");
    const corpHqExist = m.getLayer("corp-hq-circle");
    if (!retailersExist) return;

    m.setFilter(
      "retailers-circle",
      buildRetailerFilterExpr(
        selectedStates,
        selectedRetailers,
        selectedCategories,
        selectedSuppliers
      )
    );

    if (corpHqExist)
      m.setFilter("corp-hq-circle", buildCorpHqFilterExpr(selectedStates));

    try {
      const visible = m.queryRenderedFeatures({ layers: ["retailers-circle"] });

      const summaryStore: Record<
        string,
        { count: number; suppliers: Set<string>; categories: Set<string>; states: Set<string> }
      > = {};

      visible.forEach((f: any) => {
        const p = f.properties ?? {};
        const name = (p.Retailer || p.Name || "").trim();
        if (!name) return;

        if (!summaryStore[name]) {
          summaryStore[name] = {
            count: 0,
            suppliers: new Set(),
            categories: new Set(),
            states: new Set(),
          };
        }

        const rec = summaryStore[name];
        rec.count++;

        if (p.Suppliers)
          p.Suppliers.split(",")
            .map((v) => v.trim())
            .filter(Boolean)
            .forEach((v) => rec.suppliers.add(v));

        if (p.Category) rec.categories.add(p.Category);
        if (p.State) rec.states.add(p.State);
      });

      onRetailerSummary(
        Object.entries(summaryStore).map(([retailer, v]) => ({
          retailer,
          count: v.count,
          suppliers: [...v.suppliers],
          categories: [...v.categories],
          states: [...v.states],
        }))
      );
    } catch {}
  }, [selectedStates, selectedRetailers, selectedCategories, selectedSuppliers]);

  // ============================================================================
  // BLOCK 4 — TRIP ROUTE
  // ============================================================================
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;

    if (!tripStops.length) {
      if (m.getLayer("trip-route")) m.removeLayer("trip-route");
      if (m.getSource("trip-route")) m.removeSource("trip-route");
      return;
    }

    if (tripStops.length === 1) {
      if (m.getLayer("trip-route")) m.removeLayer("trip-route");
      if (m.getSource("trip-route")) m.removeSource("trip-route");
      return;
    }

    const coords = tripStops.map((s) => `${s.coords[0]},${s.coords[1]}`).join(";");

    fetch(
      `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?geometries=geojson&steps=false&access_token=${process.env.NEXT_PUBLIC_MAPBOX_TOKEN}`
    )
      .then((r) => r.json())
      .then((json) => {
        const route = json?.routes?.[0]?.geometry;
        if (!route) return;

        const feature = {
          type: "Feature",
          geometry: route,
          properties: {},
        };

        if (!m.getSource("trip-route"))
          m.addSource("trip-route", { type: "geojson", data: feature });
        else (m.getSource("trip-route") as GeoJSONSource).setData(feature);

        if (!m.getLayer("trip-route")) {
          m.addLayer({
            id: "trip-route",
            type: "line",
            source: "trip-route",
            paint: {
              "line-color": "#facc15",
              "line-width": 4,
            },
          });
        }
      })
      .catch(() => {});
  }, [tripStops]);

  // ============================================================================
  // CLEANUP
  // ============================================================================
  useEffect(() => {
    const m = mapRef.current;
    return () => {
      if (m) {
        try {
          m.remove();
        } catch {}
      }
    };
  }, []);

  // ============================================================================
  // RENDER MAP
  // ============================================================================
  return (
    <div
      ref={containerRef}
      className="w-full h-full"
    />
  );
} // 🔥 FINAL AND ONLY closing brace of CertisMap component
