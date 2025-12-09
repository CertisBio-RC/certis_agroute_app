// ============================================================================
// 💠 CERTIS AGROUTE — K9 GOLD (Clean Build)
//   • Based on K8 logic – ZERO behavior changes
//   • FIX: Separate Filter and Summary useEffects
//   • FIX: Properly closed braces
//   • FIX: Moved RetailerSummary type to top-level inside component
//   • FIX: TypeScript Set<string> → string[] inference using Array.from()
//   • Category in popups (Retailer + Kingpin)
//   • Kingpin popup supports multiple contacts
//   • Office + Cell on one line; Email at bottom
//   • Kingpin icon smaller (0.03)
//   • Static-export-safe
//   • Clean build in strict TS mode
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

  // TYPE (must be top-level inside component)
  type RetailerSummaryEntry = {
    retailer: string;
    count: number;
    suppliers: Set<string>;
    categories: Set<string>;
    states: Set<string>;
  };

  // ========================================================================
  // INITIAL MAP LOAD
  // ========================================================================
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
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

    Promise.all([
      fetch(`${basePath}/data/retailers.geojson`).then((r) => r.json()),
      fetch(`${basePath}/data/kingpin.geojson`).then((r) => r.json()),
    ]).then(([retailersData, kingpinData]) => {
      const m = mapRef.current;
      if (!m) return;

      const all = [
        ...(retailersData.features ?? []),
        ...(kingpinData.features ?? []),
      ];

      // ALL STOPS FOR TRIP BUILDER -----------------------------------------
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
              coords: c as [number, number],
            };
          })
          .filter(Boolean) as Stop[]
      );

      // FILTER DROPDOWN DATA -----------------------------------------------
      onStatesLoaded(
        Array.from(
          new Set(
            all
              .map((f) =>
                String(f.properties?.State ?? "").trim().toUpperCase()
              )
              .filter(Boolean)
          )
        ).sort() as string[]
      );

      onRetailersLoaded(
        Array.from(
          new Set(
            (retailersData.features ?? []).map((f: any) =>
              String(f.properties?.Retailer ?? "").trim()
            )
          )
        )
          .filter(Boolean)
          .sort() as string[]
      );

      onSuppliersLoaded(
        Array.from(
          new Set(
            all
              .flatMap((f: any) =>
                String(f.properties?.Suppliers || "")
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
              )
          )
        ).sort() as string[]
      );

      // SOURCES -------------------------------------------------------------
      m.addSource("retailers", { type: "geojson", data: retailersData });
      m.addSource("kingpins", { type: "geojson", data: kingpinData });

      // LAYERS --------------------------------------------------------------
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
            /* default */ "#f9fafb",
          ],
          "circle-stroke-width": 1,
          "circle-stroke-color": "#111827",
        },
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
          "circle-stroke-width": 2,
        },
      });

      // KINGPIN ICON --------------------------------------------------------
      const icon = new Image();
      icon.onload = () => {
        if (!m.hasImage("kingpin-icon"))
          m.addImage("kingpin-icon", icon, { pixelRatio: 2 });
        m.addLayer({
          id: "kingpin-symbol",
          type: "symbol",
          source: "kingpins",
          layout: {
            "icon-image": "kingpin-icon",
            "icon-size": 0.03,
            "icon-anchor": "bottom",
            "icon-allow-overlap": true,
          },
        });
      };
      icon.src = `${basePath}/icons/kingpin.png`;

      // CURSOR --------------------------------------------------------------
      ["retailers-circle", "corp-hq-circle", "kingpin-symbol"].forEach((l) => {
        m.on("mouseenter", l, () => (m.getCanvas().style.cursor = "default"));
        m.on("mouseleave", l, () => (m.getCanvas().style.cursor = ""));
      });

      // ======================================================================
      // POPUP — Retailers + HQ
      // ======================================================================
      const clickRetail = (e: any) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties ?? {};
        const [lng, lat] = f.geometry?.coordinates ?? [];

        const retailerTitle = (p.Retailer || "").trim() || "Unknown Retailer";
        const subLabel = (p.Name || "").trim();
        const address = p.Address || "";
        const city = p.City || "";
        const state = p.State || "";
        const zip = p.Zip || "";
        const category = p.Category || "Not listed";
        const suppliers =
          p.Suppliers?.split(",")
            .map((s: string) => s.trim())
            .filter(Boolean)
            .join(", ") || "Not listed";

        const stop: Stop = {
          label: subLabel || retailerTitle,
          address,
          city,
          state,
          zip,
          coords: [lng, lat],
        };

        const div = document.createElement("div");
        div.style.cssText =
          "font-size:13px;min-width:300px;max-width:320px;color:#fff;line-height:1.3;font-family:Segoe UI,Arial;";

        div.innerHTML = `
          <div style="font-size:15px;font-weight:700;margin-bottom:4px;color:#facc15;">
            ${retailerTitle}
          </div>
          ${subLabel ? `<div style="font-style:italic;margin-bottom:4px;">${subLabel}</div>` : ""}
          <div style="margin-bottom:4px;">${address}<br/>${city}, ${state} ${zip}</div>
          <div style="margin-bottom:4px;"><b>Category:</b> ${category}</div>
          <div style="margin-bottom:8px;"><b>Suppliers:</b><br/>${suppliers}</div>
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

      // ======================================================================
      // POPUP — Kingpins (Multiple Contacts)
      // ======================================================================
      const clickKingpin = (e: any) => {
        const f = e.features?.[0];
        if (!f) return;
        const [lng, lat] = f.geometry?.coordinates ?? [];

        const same = kingpinData.features.filter(
          (ff: any) =>
            ff.geometry?.coordinates?.[0] === lng &&
            ff.geometry?.coordinates?.[1] === lat
        );

        const contacts = same.map((ff: any) => {
          const p = ff.properties ?? {};
          return {
            name: p.ContactName || "",
            title: p.ContactTitle || "",
            office: p.OfficePhone || "",
            cell: p.CellPhone || "",
            email: p.Email || "",
          };
        });

        let index = 0;
        const p0 = f.properties ?? {};
        const retailerTitle = (p0.Retailer || "").trim() || "Unknown Retailer";
        const address = p0.Address || "";
        const city = p0.City || "";
        const state = p0.State || "";
        const zip = p0.Zip || "";
        const category = p0.Category || "Not listed";
        const suppliers = p0.Suppliers || "Not listed";

        const stop: Stop = {
          label: retailerTitle,
          address,
          city,
          state,
          zip,
          coords: [lng, lat],
        };

        const popup = new mapboxgl.Popup({ offset: 14, closeOnMove: false }).setLngLat([lng, lat]);

        const render = () => {
          const c = contacts[index];
          const contactBlock = c
            ? `
              <div style="margin-top:6px;">
                ${c.name ? `<div style="font-weight:700;margin-bottom:2px;">${c.name}</div>` : ""}
                ${c.title ? `<div style="margin-bottom:6px;">${c.title}</div>` : ""}
                <div style="margin-bottom:4px;">
                  <b>Office:</b> ${c.office || "—"},
                  <b>Cell:</b> ${c.cell || "—"}
                </div>
                ${c.email ? `<div style="margin-bottom:6px;"><b>Email:</b> ${c.email}</div>` : ""}
              </div>
            `
            : "";

          popup.setDOMContent(createDiv(contactBlock));
        };

        const createDiv = (contactBlock: string) => {
          const div = document.createElement("div");
          div.style.cssText =
            "font-size:13px;min-width:300px;max-width:320px;color:#fff;line-height:1.3;font-family:Segoe UI,Arial;";

          div.innerHTML = `
            <div style="font-size:16px;font-weight:700;margin-bottom:6px;color:#facc15;">
              ${retailerTitle}
            </div>
            <div style="margin-bottom:4px;">${address}<br/>${city}, ${state} ${zip}</div>
            <div style="margin-bottom:4px;"><b>Category:</b> ${category}</div>
            <div style="margin-bottom:8px;"><b>Suppliers:</b><br/>${suppliers}</div>
            ${contactBlock}
            <button id="add-kingpin-stop" style="padding:7px 10px;border:none;background:#facc15;
              border-radius:5px;font-weight:700;font-size:13px;color:#111827;cursor:pointer;width:100%;">
              ➕ Add to Trip
            </button>
            ${
              contacts.length > 1
                ? `
            <div style="display:flex;justify-content:space-between;margin-top:8px;">
              <button id="prev-kp" style="background:none;border:none;color:#facc15;cursor:pointer;">⭠ Prev</button>
              <div style="font-size:12px;color:#ccc;">${index + 1} / ${contacts.length}</div>
              <button id="next-kp" style="background:none;border:none;color:#facc15;cursor:pointer;">Next ⭢</button>
            </div>`
                : ""
            }
          `;

          div.querySelector("#add-kingpin-stop")?.addEventListener("click", () => onAddStop(stop));
          div.querySelector("#prev-kp")?.addEventListener("click", () => {
            index = (index - 1 + contacts.length) % contacts.length;
            render();
          });
          div.querySelector("#next-kp")?.addEventListener("click", () => {
            index = (index + 1) % contacts.length;
            render();
          });

          return div;
        };

        render();
        popup.addTo(mapRef.current!);
      };
      m.on("click", "kingpin-symbol", clickKingpin);
    });
  }, []);

  // ========================================================================
  // FILTER EFFECT (Retailers + HQ only)
  // ========================================================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const lowercaseStates = selectedStates.map((s) => s.toLowerCase());
    const lowercaseRetailers = selectedRetailers.map((r) => r.toLowerCase());
    const lowercaseCategories = selectedCategories.map((c) => c.toLowerCase());
    const lowercaseSuppliers = selectedSuppliers.map((s) => s.toLowerCase());

    map.setFilter(
      "retailers-circle",
      buildRetailerFilterExpr(
        lowercaseStates,
        lowercaseRetailers,
        lowercaseCategories,
        lowercaseSuppliers
      )
    );

    map.setFilter("corp-hq-circle", buildCorpHqFilterExpr(lowercaseStates));
  }, [selectedStates, selectedRetailers, selectedCategories, selectedSuppliers]);

  // ========================================================================
  // SUMMARY EFFECT (Retailers only)
  // ========================================================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const src = map.getSource("retailers") as GeoJSONSource;
    if (!src) return;

    try {
      const data = (src as any)._data || {};
      const feats = (data.features ?? []) as any[];

      const filtered = feats.filter((f) => {
        const p = f.properties ?? {};
        const stateOk =
          !selectedStates.length ||
          selectedStates.includes(String(p.State).toLowerCase());
        const retailerOk =
          !selectedRetailers.length ||
          selectedRetailers.includes(String(p.Retailer).toLowerCase());
        const categoryOk =
          !selectedCategories.length ||
          selectedCategories.includes(String(p.Category).toLowerCase());

        let supplierOk = true;
        if (selectedSuppliers.length) {
          const supplierStr = String(p.Suppliers || "").toLowerCase();
          supplierOk = selectedSuppliers.some((s) =>
            supplierStr.includes(s.toLowerCase())
          );
        }
        return stateOk && retailerOk && categoryOk && supplierOk;
      });

      const byRetailer = new Map() as Map<string, RetailerSummaryEntry>;

      for (const f of filtered) {
        const p = f.properties ?? {};
        const r = String(p.Retailer || "").trim();
        if (!r) continue;

        if (!byRetailer.has(r)) {
          byRetailer.set(r, {
            retailer: r,
            count: 0,
            suppliers: new Set<string>(),
            categories: new Set<string>(),
            states: new Set<string>(),
          });
        }
        const entry = byRetailer.get(r)!;
        entry.count += 1;

        (String(p.Suppliers || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean) || []).forEach((s) => entry.suppliers.add(s));

        if (p.Category) entry.categories.add(String(p.Category).trim());
        if (p.State) entry.states.add(String(p.State).trim());
      }

      onRetailerSummary(
        [...byRetailer.values()].map((v) => ({
          retailer: v.retailer,
          count: v.count,
          suppliers: [...v.suppliers],
          categories: [...v.categories],
          states: [...v.states],
        }))
      );
    } catch (err) {
      console.error("Summary generation failed:", err);
    }
  }, [
    selectedStates,
    selectedRetailers,
    selectedCategories,
    selectedSuppliers,
    onRetailerSummary,
  ]);

  // ========================================================================
  // ROUTE DISPLAY
  // ========================================================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !props.routeGeoJSON) return;

    if (map.getSource("route"))
      (map.getSource("route") as GeoJSONSource).setData(props.routeGeoJSON);
    else {
      map.addSource("route", {
        type: "geojson",
        data: props.routeGeoJSON,
      });
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        paint: {
          "line-width": 4,
          "line-color": "#facc15",
        },
      });
    }
  }, [props.routeGeoJSON]);

  // ========================================================================
  // HOME MARKER
  // ========================================================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (map.getSource("home")) {
      map.removeLayer("home-symbol");
      map.removeSource("home");
    }

    if (!props.homeCoords) return;
    const [lng, lat] = props.homeCoords;

    map.addSource("home", {
      type: "geojson",
      data: {
        type: "Feature",
        geometry: { type: "Point", coordinates: [lng, lat] },
        properties: {},
      },
    });

    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
    const icon = new Image();
    icon.onload = () => {
      if (!map.hasImage("home-icon"))
        map.addImage("home-icon", icon, { pixelRatio: 2 });
      map.addLayer({
        id: "home-symbol",
        type: "symbol",
        source: "home",
        layout: {
          "icon-image": "home-icon",
          "icon-size": 0.06,
          "icon-anchor": "bottom",
          "icon-allow-overlap": true,
        },
      });
    };
    icon.src = `${basePath}/icons/home.png`;
  }, [props.homeCoords]);

  // ========================================================================
  // CLEANUP
  // ========================================================================
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // ========================================================================
  // RENDER
  // ========================================================================
  return <div ref={containerRef} className="w-full h-full" />;
}
