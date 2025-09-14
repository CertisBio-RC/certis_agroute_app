"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import React, { useEffect, useRef, useState } from "react";
import mapboxgl, {
  Map as MapboxMap,
  GeoJSONSource,
  LngLatLike,
  MapLayerMouseEvent,
  MapLayerTouchEvent,
} from "mapbox-gl";
import { withBasePath } from "@/utils/paths";

const MAPBOX_TOKEN =
  (typeof window !== "undefined" ? (window as any).MAPBOX_TOKEN : undefined) ||
  process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN ||
  "";

type Position = [number, number];
interface FeatureProperties { [key: string]: any }
interface Feature { type: "Feature"; properties: FeatureProperties; geometry: { type: "Point"; coordinates: Position } }
interface FeatureCollection { type: "FeatureCollection"; features: Feature[] }

export interface CertisMapProps {
  data: FeatureCollection;             // clustered
  kingpins?: FeatureCollection | null; // non-clustered
  home?: Position | null;
  onPointClick?: (f: Feature) => void;
  styleId?: string;                    // e.g. "satellite-streets-v12"
}

const DEFAULT_CENTER: LngLatLike = [-93.5, 41.9];
const DEFAULT_ZOOM = 4.3;

/* property helper */
const norm = (s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,"");
function pickProp(p: FeatureProperties, keys: string[]): string {
  if (!p) return "";
  for (const k of Object.keys(p)) for (const q of keys) if (k.toLowerCase()===q.toLowerCase()) return String(p[k] ?? "");
  const m: Record<string, any> = {}; for (const [k,v] of Object.entries(p)) m[norm(k)] = v;
  for (const q of keys){ const nk=norm(q); if (m[nk]!=null) return String(m[nk] ?? ""); }
  return "";
}

export default function CertisMap({
  data,
  kingpins = null,
  home = null,
  onPointClick,
  styleId = "satellite-streets-v12",
}: CertisMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);

  // keep latest props
  const dataRef = useRef(data); dataRef.current = data;
  const kpRef = useRef(kingpins); kpRef.current = kingpins;
  const homeRef = useRef(home); homeRef.current = home;
  const styleRef = useRef(styleId); styleRef.current = styleId;

  const [logoMissing, setLogoMissing] = useState(false);

  /** Safely (re)add sources & layers AFTER style.load */
  const addSourcesLayers = () => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    try {
      try { map.setProjection({ name: "mercator" } as any); } catch {}

      // retailers (clustered)
      if (!map.getSource("retailers")) {
        map.addSource("retailers", {
          type: "geojson",
          data: (dataRef.current ?? { type: "FeatureCollection", features: [] }) as any,
          cluster: true,
          clusterMaxZoom: 12,
          clusterRadius: 40,
        });
      } else {
        (map.getSource("retailers") as GeoJSONSource).setData((dataRef.current ?? { type:"FeatureCollection", features:[] }) as any);
      }

      if (!map.getLayer("clusters")) {
        map.addLayer({
          id: "clusters",
          type: "circle",
          source: "retailers",
          filter: ["has","point_count"],
          paint: {
            "circle-color": ["step", ["get","point_count"], "#5eead4", 25, "#34d399", 100, "#10b981"],
            "circle-radius": ["step", ["get","point_count"], 14, 25, 20, 100, 26],
            "circle-stroke-color": "#0f172a",
            "circle-stroke-width": 1.25
          },
        } as any);
      }

      if (!map.getLayer("cluster-count")) {
        map.addLayer({
          id: "cluster-count",
          type: "symbol",
          source: "retailers",
          filter: ["has","point_count"],
          layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 11 },
          paint: { "text-color": "#0b1220" },
        } as any);
      }

      if (!map.getLayer("unclustered-point")) {
        map.addLayer({
          id: "unclustered-point",
          type: "circle",
          source: "retailers",
          filter: ["!", ["has","point_count"]],
          paint: {
            "circle-color": "#60a5fa",
            "circle-radius": 5.5,
            "circle-stroke-color": "#0f172a",
            "circle-stroke-width": 1.25
          },
        } as any);
      }

      // kingpins (non-clustered)
      if (kpRef.current) {
        if (!map.getSource("kingpins")) map.addSource("kingpins", { type:"geojson", data: kpRef.current as any });
        else (map.getSource("kingpins") as GeoJSONSource).setData(kpRef.current as any);

        if (!map.getLayer("kingpins-layer")) {
          map.addLayer({
            id: "kingpins-layer",
            type: "circle",
            source: "kingpins",
            paint: {
              "circle-color": "#ef4444",
              "circle-radius": 8,
              "circle-stroke-color": "#facc15",
              "circle-stroke-width": 3
            },
          } as any);
        }
      }

      // HOME pin
      if (homeRef.current) {
        const d = { type:"FeatureCollection", features:[{ type:"Feature", properties:{}, geometry:{ type:"Point", coordinates: homeRef.current } }] };
        if (!map.getSource("home")) map.addSource("home", { type:"geojson", data:d as any });
        else (map.getSource("home") as GeoJSONSource).setData(d as any);

        if (!map.getLayer("home-layer")) {
          map.addLayer({
            id:"home-layer", type:"circle", source:"home",
            paint: { "circle-color":"#22d3ee","circle-radius":7,"circle-stroke-color":"#0f172a","circle-stroke-width":2 },
          } as any);
        }
      }

      // pointer cursor on interactive layers
      ["clusters","unclustered-point","kingpins-layer"].forEach((id) => {
        // avoid duplicate listeners across style swaps
        map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", id, () => (map.getCanvas().style.cursor = ""));
      });
    } catch {
      /* swallow & retry on next style.load */
    }
  };

  // init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current || !MAPBOX_TOKEN) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: `mapbox://styles/mapbox/${styleRef.current}`,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      cooperativeGestures: false,
      attributionControl: true,
      projection: { name: "mercator" },
    });
    mapRef.current = map;

    map.on("load", () => { map.resize(); addSourcesLayers(); });
    map.on("style.load", () => { map.resize(); addSourcesLayers(); });

    // responsive
    const onWinResize = () => { try { map.resize(); } catch {} };
    window.addEventListener("resize", onWinResize);

    // cluster zoom
    map.on("click", "clusters", (e: MapLayerMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, { layers:["clusters"] });
      const clusterId = features[0]?.properties?.cluster_id;
      const src = map.getSource("retailers") as GeoJSONSource;
      if (!src || clusterId == null) return;
      src.getClusterExpansionZoom(clusterId, (err, z) => {
        if (err) return;
        const center = (features[0].geometry as any).coordinates as LngLatLike;
        map.easeTo({ center, zoom:z });
      });
    });

    // popups + add stop
    const showPopup = (e: MapLayerMouseEvent | MapLayerTouchEvent, label: string) => {
      if (!e.features?.length) return;
      const f = e.features[0] as any;
      const p = (f.properties || {}) as FeatureProperties;
      const coords = (f.geometry?.coordinates ?? []) as Position;

      const retailer = pickProp(p, ["Retailer","Dealer","Retailer Name","Retail"]);
      const city = pickProp(p, ["City","Town"]);
      const state = pickProp(p, ["State","ST","Province"]);
      const addr = pickProp(p, ["Address","Address1","Address 1","Street","Street1","Addr1"]);
      const zip = pickProp(p, ["ZIP","Zip","Postal","PostalCode","Postcode"]);
      const typ = pickProp(p, ["Type","Location Type","LocationType","location_type","LocType","Loc_Type","Facility Type","Category","Location Category","Site Type"]);
      const isKP = (() => {
        const raw = pickProp(p, ["KINGPIN","Kingpin","IsKingpin","Key Account"]);
        const s = String(raw||"").toLowerCase();
        return s==="true" || s==="yes" || s==="y" || s==="1";
      })();

      const line1 = retailer || "Location";
      const line2 = [addr, [city,state].filter(Boolean).join(", "), zip].filter(Boolean).join(" · ");
      const tag = [isKP ? "KINGPIN" : null, typ || null].filter(Boolean).join(" • ");

      const html = `
        <div style="font-family:Inter,system-ui,Segoe UI,Roboto,Arial; font-size:12px; line-height:1.35; color:#e5e7eb;">
          <div style="font-weight:700; margin-bottom:2px">${line1}</div>
          ${line2 ? `<div style="opacity:.9">${line2}</div>` : ``}
          ${tag ? `<div style="margin-top:6px; font-size:11px; color:#facc15; font-weight:600">${tag}</div>` : ``}
          <div style="margin-top:6px; font-size:11px; opacity:.8">${label}</div>
        </div>`;

      if (!popupRef.current) popupRef.current = new mapboxgl.Popup({ closeButton:false, closeOnClick:false });
      popupRef.current.setLngLat(coords as any).setHTML(html).addTo(map);
      onPointClick?.({ type:"Feature", properties:p, geometry:{ type:"Point", coordinates:coords } });
    };
    map.on("click","unclustered-point",(e)=>showPopup(e,"Location"));
    map.on("click","kingpins-layer",(e)=>showPopup(e,"KINGPIN"));

    return () => {
      window.removeEventListener("resize", onWinResize);
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, [onPointClick]);

  // live updates
  useEffect(() => { const m = mapRef.current; if (!m) return; const s = m.getSource("retailers") as GeoJSONSource | undefined; if (s) s.setData(data as any); }, [data]);
  useEffect(() => {
    const m = mapRef.current; if (!m) return;
    if (kingpins) { const s = m.getSource("kingpins") as GeoJSONSource | undefined; if (s) s.setData(kingpins as any); }
    else { if (m.getLayer("kingpins-layer")) m.removeLayer("kingpins-layer"); if (m.getSource("kingpins")) m.removeSource("kingpins"); }
  }, [kingpins]);
  useEffect(() => {
    const m = mapRef.current; if (!m) return;
    if (!home) { if (m.getLayer("home-layer")) m.removeLayer("home-layer"); if (m.getSource("home")) m.removeSource("home"); return; }
    if (!m.isStyleLoaded()) return;
    const d = { type:"FeatureCollection", features:[{ type:"Feature", properties:{}, geometry:{ type:"Point", coordinates: home } }] };
    if (m.getSource("home")) (m.getSource("home") as GeoJSONSource).setData(d as any);
    else { try { m.addSource("home",{type:"geojson",data:d as any}); m.addLayer({id:"home-layer",type:"circle",source:"home",paint:{"circle-color":"#22d3ee","circle-radius":7,"circle-stroke-color":"#0f172a","circle-stroke-width":2}} as any);} catch {} }
  }, [home]);

  // style changes
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    const nextUri = `mapbox://styles/mapbox/${styleId}`;
    map.setStyle(nextUri);
    map.once("style.load", () => { map.resize(); addSourcesLayers(); });
  }, [styleId]);

  return (
    <div ref={containerRef} style={{ position:"relative", width:"100%", height:"100%" }}>
      {/* in-map brand */}
      <div style={{ position:"absolute", left:12, top:12, zIndex:10, pointerEvents:"none" }}>
        {!logoMissing ? (
          <img
            src={withBasePath("logo-certis.png")}
            alt="Certis"
            style={{ height:28, opacity:.9, filter:"drop-shadow(0 1px 1px rgba(0,0,0,.35))" }}
            onError={() => setLogoMissing(true)}
            loading="eager"
          />
        ) : (
          <div style={{ borderRadius:6, background:"rgba(0,0,0,.4)", padding:"2px 6px", fontSize:12, letterSpacing:".04em", border:"1px solid rgba(255,255,255,.2)" }}>
            CERTIS
          </div>
        )}
      </div>
    </div>
  );
}
