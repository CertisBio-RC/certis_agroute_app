// ============================================================================
// 💠 CERTIS AGROUTE — K7 GOLD
//   • Based on K6 (stable)
//   • ONLY update: Kingpin popup layout (Category + Email position)
//   • Satellite-streets-v12 + Mercator (Bailey Rule)
//   • Zero logic changes, zero filter changes, zero routing changes
//   • Fully static-export-safe (Next.js 15 / output:"export")
// ============================================================================

"use client";

import { useEffect, useRef } from "react";
import mapboxgl, { Map, GeoJSONSource } from "mapbox-gl";

// TYPES ----------------------------------------------------------------------
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
      0
    ]);
    filter.push(["any", ...ors]);
  }
  return filter;
}

// HQ filters ONLY by State — Bailey Rule
function buildCorpHqFilterExpr(selectedStates: string[]): any[] {
  const filter: any[] = ["all", ["==", ["downcase", ["get", "Category"]], "corporate hq"]];
  if (selectedStates.length)
    filter.push(["in", ["downcase", ["get", "State"]], ["literal", selectedStates]]);
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
    tripStops,
    onStatesLoaded,
    onRetailersLoaded,
    onSuppliersLoaded,
    onRetailerSummary,
    onAllStopsLoaded,
    onAddStop
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

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

      const all = [
        ...(retailersData.features ?? []),
        ...(kingpinData.features ?? [])
      ];

      onAllStopsLoaded(
        all
          .map((f: any) => {
            const p = f.properties ?? {};
            const c = f.geometry?.coordinates;
            if (!c) return null;
            return {
              label: p.Name || p.Retailer || "Unknown",
              address: p.Address || "",
              city: p.City || "",
              state: p.State || "",
              zip: p.Zip || "",
              coords: c as [number, number]
            };
          })
          .filter(Boolean) as Stop[]
      );

      onStatesLoaded([
        ...new Set(
          all
            .map((f) => String(f.properties?.State ?? "").trim().toUpperCase())
            .filter(Boolean)
        )
      ].sort());

      onRetailersLoaded([
        ...new Set(
          (retailersData.features ?? []).map(
            (f: any) => String(f.properties?.Retailer ?? "").trim()
          )
        )
      ].filter(Boolean).sort() as string[]);

      onSuppliersLoaded([
        ...new Set(
          all.flatMap((f: any) =>
            String(f.properties?.Suppliers || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          )
        )
      ].sort());

      m.addSource("retailers", { type: "geojson", data: retailersData });
      m.addSource("kingpins", { type: "geojson", data: kingpinData });

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
            "agronomy",
            "#22c55e",
            "grain/feed",
            "#f97316",
            "c-store/service/energy",
            "#0ea5e9",
            "distribution",
            "#a855f7",
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

      const icon = new Image();
      icon.onload = () => {
        if (!m.hasImage("kingpin-icon")) m.addImage("kingpin-icon", icon, { pixelRatio: 2 });
        m.addLayer({
          id: "kingpin-symbol",
          type: "symbol",
          source: "kingpins",
          layout: {
            "icon-image": "kingpin-icon",
            "icon-size": 0.04,
            "icon-anchor": "bottom",
            "icon-allow-overlap": true
          }
        });
      };
      icon.src = `${basePath}/icons/kingpin.png`;

      ["retailers-circle", "corp-hq-circle", "kingpin-symbol"].forEach((l) => {
        m.on("mouseenter", l, () => (m.getCanvas().style.cursor = "default"));
        m.on("mouseleave", l, () => (m.getCanvas().style.cursor = ""));
      });

      // POPUP — Retailers + HQ (unchanged)
      const clickRetail = (e: any) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties ?? {};
        const [lng, lat] = f.geometry?.coordinates ?? [];
        const retailerTitle = (p.Retailer || "").trim() || "Unknown Retailer";
        const subLabel = (p.Name || "").trim();
        const suppliers =
          p.Suppliers?.split(",").map((s: string) => s.trim()).filter(Boolean).join(", ") ||
          "Not listed";

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
          <div style="margin-bottom:6px;">${stop.address}<br/>${stop.city}, ${stop.state} ${stop.zip}</div>
          <div style="margin-bottom:8px;"><span style="font-weight:700;">Suppliers:</span><br/>${suppliers}</div>
          <button id="add-stop" style="padding:7px 10px;border:none;background:#facc15;
            border-radius:5px;font-weight:700;font-size:13px;color:#111827;cursor:pointer;width:100%;">
            ➕ Add to Trip
          </button>
        `;
        new mapboxgl.Popup({ offset: 14, closeOnMove: false }).setLngLat([lng, lat]).setDOMContent(div).addTo(m);
        div.querySelector("#add-stop")?.addEventListener("click", () => onAddStop(stop));
      };
      m.on("click", "retailers-circle", clickRetail);
      m.on("click", "corp-hq-circle", clickRetail);

      // POPUP — Kingpin (UPDATED — K7)
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
        const category = (p.Category || "").trim();
        const suppliers = (p.Suppliers || "").toString().trim() || "Not listed";

        const contactName = (p.ContactName || "").trim();
        const contactTitle = (p.ContactTitle || "").trim();
        const office = (p.OfficePhone || "").toString().trim();
        const cell = (p.CellPhone || "").toString().trim();
        const email = (p.Email || "").toString().trim();

        // one line for office + cell
        const ocLine =
          office || cell
            ? `Office: ${office || "—"} | Cell: ${cell || "—"}`
            : "";

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
          ${category ? `<div style="margin-bottom:6px;"><span style="font-weight:700;">Category:</span><br/>${category}</div>` : ""}
          <div style="margin-bottom:6px;"><span style="font-weight:700;">Suppliers:</span><br/>${suppliers}</div>
          ${contactName ? `<div style="font-weight:700;margin-bottom:2px;">${contactName}</div>` : ""}
          ${contactTitle ? `<div style="margin-bottom:4px;">${contactTitle}</div>` : ""}
          ${ocLine ? `<div style="margin-bottom:6px;">${ocLine}</div>` : ""}
          ${email ? `<div style="margin-bottom:8px;">${email}</div>` : ""}
          <button id="add-kingpin-stop" style="padding:7px 10px;border:none;background:#facc15;
            border-radius:5px;font-weight:700;font-size:13px;color:#111827;cursor:pointer;width:100%;">
            ➕ Add to Trip
          </button>
        `;
        new mapboxgl.Popup({ offset: 14, closeOnMove: false }).setLngLat([lng, lat]).setDOMContent(div).addTo(m);
        div.querySelector("#add-kingpin-stop")?.addEventListener("click", () => onAddStop(stop));
      };
      m.on("click", "kingpin-symbol", clickKingpin);
    });
  }, []); // END INITIAL MAP USEEFFECT

  // ========================================================================
  // FILTERS + SUMMARY
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

        if (!summary[name])
          summary[name] = {
            count: 0,
            suppliers: new Set(),
            categories: new Set(),
            states: new Set()
          };

        const s = summary[name];
        s.count++;

        if (p.Suppliers)
          p.Suppliers.split(",")
            .map((v: string) => v.trim())
            .filter(Boolean)
            .forEach((v) => s.suppliers.add(v));
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
    } catch {}
  }, [selectedStates, selectedRetailers, selectedCategories, selectedSuppliers, onRetailerSummary]);

  // ========================================================================
  // TRIP ROUTE
  // ========================================================================
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

        const feature: any = { type: "Feature", geometry: route, properties: {} };

        if (!m.getSource("trip-route"))
          m.addSource("trip-route", { type: "geojson", data: feature });
        else (m.getSource("trip-route") as GeoJSONSource).setData(feature);

        if (!m.getLayer("trip-route")) {
          m.addLayer({
            id: "trip-route",
            type: "line",
            source: "trip-route",
            paint: { "line-color": "#facc15", "line-width": 4 }
          });
        }
      })
      .catch(() => {});
  }, [tripStops]);

  // ========================================================================
  // CLEANUP
  // ========================================================================
  useEffect(() => {
    const m = mapRef.current;
    return () => {
      try {
        m?.remove();
      } catch {}
    };
  }, []);

  // ========================================================================
  // RENDER
  // ========================================================================
  return <div ref={containerRef} className="w-full h-full" />;
}
