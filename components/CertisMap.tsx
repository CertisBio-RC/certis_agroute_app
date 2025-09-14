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
  data: FeatureCollection;
  kingpins?: FeatureCollection | null;
  home?: Position | null;
  onPointClick?: (f: Feature) => void;
  styleId?: string;
}

const DEFAULT_CENTER: LngLatLike = [-93.5, 41.9];
const DEFAULT_ZOOM = 4.3;

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

  const dataRef = useRef(data); dataRef.current = data;
  const kpRef = useRef(kingpins); kpRef.current = kingpins;
  const homeRef = useRef(home); homeRef.current = home;
  const styleRef = useRef(styleId); styleRef.current = styleId;

  // brand overlay tries multiple images, then falls back to inline SVG
  const logoCandidates = [
    withBasePath("logo-certis.png"),
    withBasePath("logo.png"),
    withBasePath("images/logo-certis.png"),
  ];
  const [logoIdx, setLogoIdx] = useState(0);
  const logoDone = logoIdx >= logoCandidates.length;

  const addSourcesLayers = () => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    try {
      try { map.setProjection({ name: "mercator" } as any); } catch {}

      // retailers clustered
      if (!map.getSource("retailers")) {
        map.addSource("retailers", {
          type: "geojson",
          data: (dataRef.current ?? { type:"FeatureCollection", features:[] }) as any,
          cluster: true, clusterMaxZoom: 12, clusterRadius: 40,
        });
      } else {
        (map.getSource("retailers") as GeoJSONSource).setData((dataRef.current ?? { type:"FeatureCollection", features:[] }) as any);
      }

      if (!map.getLayer("clusters")) {
        map.addLayer({
          id:"clusters", type:"circle", source:"retailers", filter:["has","point_count"],
          paint:{
            "circle-color":["step",["get","point_count"],"#5eead4",25,"#34d399",100,"#10b981"],
            "circle-radius":["step",["get","point_count"],14,25,20,100,26],
            "circle-stroke-color":"#0f172a", "circle-stroke-width":1.25
          },
        } as any);
      }
      if (!map.getLayer("cluster-count")) {
        map.addLayer({
          id:"cluster-count", type:"symbol", source:"retailers", filter:["has","point_count"],
          layout:{ "text-field":["get","point_count_abbreviated"], "text-size":11 },
          paint:{ "text-color":"#0b1220" },
        } as any);
      }
      if (!map.getLayer("unclustered-point")) {
        map.addLayer({
          id:"unclustered-point", type:"circle", source:"retailers", filter:["!",["has","point_count"]],
          paint:{
            "circle-color":"#60a5fa", "circle-radius":5.5,
            "circle-stroke-color":"#0f172a", "circle-stroke-width":1.25
          },
        } as any);
      }

      // KINGPINs — non-clustered, always above other points
      if (kpRef.current) {
        if (!map.getSource("kingpins")) map.addSource("kingpins",{type:"geojson",data:kpRef.current as any});
        else (map.getSource("kingpins") as GeoJSONSource).setData(kpRef.current as any);
        if (!map.getLayer("kingpins-layer")) {
          map.addLayer({
            id:"kingpins-layer", type:"circle", source:"kingpins",
            paint:{
              "circle-color":"#ef4444",              // red fill
              "circle-radius":8,
              "circle-stroke-color":"#facc15",       // yellow ring
              "circle-stroke-width":3,
              "circle-opacity":0.98
            },
          } as any);
        } else {
          try { map.moveLayer("kingpins-layer"); } catch {}
        }
      }

      // home pin
      if (homeRef.current) {
        const d = { type:"FeatureCollection", features:[{ type:"Feature", properties:{}, geometry:{ type:"Point", coordinates: homeRef.current } }] };
        if (!map.getSource("home")) map.addSource("home", { type:"geojson", data:d as any });
        else (map.getSource("home") as GeoJSONSource).setData(d as any);
        if (!map.getLayer("home-layer")) {
          map.addLayer({
            id:"home-layer", type:"circle", source:"home",
            paint:{ "circle-color":"#22d3ee","circle-radius":7,"circle-stroke-color":"#0f172a","circle-stroke-width":2 },
          } as any);
        }
      }

      // cursor affordance
      ["clusters","unclustered-point","kingpins-layer"].forEach((id) => {
        map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", id, () => (map.getCanvas().style.cursor = ""));
      });
    } catch {}
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !MAPBOX_TOKEN) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: `mapbox://styles/mapbox/${styleRef.current}`,
      center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM,
      cooperativeGestures: false, attributionControl: true,
      projection: { name:"mercator" },
    });
    mapRef.current = map;

    map.on("load", () => { map.resize(); addSourcesLayers(); });
    map.on("style.load", () => { map.resize(); addSourcesLayers(); });

    const onWinResize = () => { try { map.resize(); } catch {} };
    window.addEventListener("resize", onWinResize);

    // ----- POPUPS ON HOVER (mousemove) -----
    const ensurePopup = () => { if (!popupRef.current) popupRef.current = new mapboxgl.Popup({ closeButton:false, closeOnClick:false }); return popupRef.current; };

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
      const kp  = (()=>{ const vs = String(typ||"").toLowerCase(); return vs==="kingpin"; })();

      const line1 = retailer || "Location";
      const line2 = [addr, [city,state].filter(Boolean).join(", "), zip].filter(Boolean).join(" · ");
      const tag = [kp ? "KINGPIN" : null, typ && String(typ).toLowerCase()!=="kingpin" ? typ : null].filter(Boolean).join(" • ");

      const html = `
        <div style="font-family:Inter,system-ui,Segoe UI,Roboto,Arial; font-size:12px; line-height:1.35; color:#e5e7eb;">
          <div style="font-weight:700; margin-bottom:2px">${line1}</div>
          ${line2 ? `<div style="opacity:.9">${line2}</div>` : ``}
          ${tag ? `<div style="margin-top:6px; font-size:11px; color:#f1f5f9; opacity:.9">${tag}</div>` : ``}
          <div style="margin-top:6px; font-size:11px; opacity:.7">${label}</div>
        </div>`;

      ensurePopup().setLngLat(coords as any).setHTML(html).addTo(map);
    };

    // hover popups
    map.on("mousemove","unclustered-point",(e)=>showPopup(e,"Location"));
    map.on("mouseleave","unclustered-point",()=>popupRef.current?.remove());
    map.on("mousemove","kingpins-layer",(e)=>showPopup(e,"KINGPIN"));
    map.on("mouseleave","kingpins-layer",()=>popupRef.current?.remove());

    // click = add stop (no popup logic here)
    map.on("click","unclustered-point",(e)=>{
      if (!e.features?.length) return;
      const f = e.features[0] as any;
      const p = (f.properties || {}) as FeatureProperties;
      const coords = (f.geometry?.coordinates ?? []) as Position;
      onPointClick?.({ type:"Feature", properties:p, geometry:{ type:"Point", coordinates:coords } });
    });
    map.on("click","kingpins-layer",(e)=>{
      if (!e.features?.length) return;
      const f = e.features[0] as any;
      const p = (f.properties || {}) as FeatureProperties;
      const coords = (f.geometry?.coordinates ?? []) as Position;
      onPointClick?.({ type:"Feature", properties:p, geometry:{ type:"Point", coordinates:coords } });
    });

    // optional: click clusters to zoom into them
    map.on("click","clusters", (e) => {
      const features = map.queryRenderedFeatures(e.point, { layers: ["clusters"] });
      const clusterId = (features[0]?.properties as any)?.cluster_id;
      const source = map.getSource("retailers") as any;
      if (clusterId && source?.getClusterExpansionZoom) {
        source.getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
          if (err) return;
          map.easeTo({ center: (features[0].geometry as any).coordinates as any, zoom });
        });
      }
    });

    return () => { window.removeEventListener("resize", onWinResize); popupRef.current?.remove(); map.remove(); mapRef.current = null; };
  }, [onPointClick]);

  // live updates
  useEffect(()=>{ const m = mapRef.current; if(!m) return; const s = m.getSource("retailers") as GeoJSONSource|undefined; if(s) s.setData(data as any); },[data]);
  useEffect(()=>{ const m = mapRef.current; if(!m) return; if(kingpins){ const s=m.getSource("kingpins") as GeoJSONSource|undefined; if(s) s.setData(kingpins as any); if(m.getLayer("kingpins-layer")) try{ m.moveLayer("kingpins-layer"); }catch{} } else { if(m.getLayer("kingpins-layer")) m.removeLayer("kingpins-layer"); if(m.getSource("kingpins")) m.removeSource("kingpins"); } },[kingpins]);
  useEffect(()=>{ const m = mapRef.current; if(!m) return; if(!home){ if(m.getLayer("home-layer")) m.removeLayer("home-layer"); if(m.getSource("home")) m.removeSource("home"); return;} if(!m.isStyleLoaded()) return; const d={type:"FeatureCollection",features:[{type:"Feature",properties:{},geometry:{type:"Point",coordinates:home}}]}; if(m.getSource("home")) (m.getSource("home") as GeoJSONSource).setData(d as any); else { try{ m.addSource("home",{type:"geojson",data:d as any}); m.addLayer({id:"home-layer",type:"circle",source:"home",paint:{"circle-color":"#22d3ee","circle-radius":7,"circle-stroke-color":"#0f172a","circle-stroke-width":2}} as any);}catch{} } },[home]);

  useEffect(()=>{ const map = mapRef.current; if(!map) return; const uri=`mapbox://styles/mapbox/${styleId}`; map.setStyle(uri); map.once("style.load",()=>{ map.resize(); addSourcesLayers(); }); },[styleId]);

  return (
    <div ref={containerRef} style={{ position:"relative", width:"100%", height:"100%" }}>
      {/* in-map brand (non-interactive) */}
      <div style={{ position:"absolute", left:12, top:12, zIndex:10, pointerEvents:"none" }}>
        {!logoDone ? (
          <img
            src={logoCandidates[logoIdx]}
            alt="Certis"
            style={{ height:28, opacity:.92, filter:"drop-shadow(0 1px 1px rgba(0,0,0,.35))" }}
            onError={() => setLogoIdx((i)=>i+1)}
            loading="eager"
          />
        ) : (
          <svg width="90" height="24" viewBox="0 0 90 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="0.5" y="0.5" width="89" height="23" rx="6" fill="rgba(0,0,0,.45)" stroke="rgba(255,255,255,.25)"/>
            <text x="45" y="16" textAnchor="middle" fontFamily="Rajdhani, Inter, system-ui" fontWeight="700" fontSize="13" fill="#e5e7eb" letterSpacing=".08em">CERTIS</text>
          </svg>
        )}
      </div>
    </div>
  );
}
