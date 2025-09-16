'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl, { LngLat, Map } from 'mapbox-gl';
import { withBasePath } from '@/utils/paths';

// ---------- Shared category palette (also used by page.tsx) ----------
export const CATEGORY_COLORS: Record<string, string> = {
  Agronomy: '#22c55e',         // green
  'Agronomy/Grain': '#a855f7', // purple
  Distribution: '#06b6d4',     // cyan/teal
  Grain: '#eab308',            // amber
  'Grain/Feed': '#b45309',     // brown
  Kingpin: '#ef4444',          // red (special)
  'Office/Service': '#3b82f6', // blue
};
export const CATEGORY_COLOR = (c: string) => CATEGORY_COLORS[c] ?? '#9ca3af';

// ---------- Types ----------
export type StyleMode = 'hybrid' | 'street';
type CategoriesMap = Record<string, boolean>;
type StopBrief = { name?: string; coord: [number, number] };

export type CertisMapProps = {
  styleMode: StyleMode;
  categories: CategoriesMap;
  onAddStop?: (s: StopBrief) => void;
};

// ---------- Constants ----------
const MAIN_SRC = 'main';
const CLUSTER_LAYER = 'clusters';
const CLUSTER_COUNT = 'cluster-count';
const MAIN_POINTS = 'points';
const KING_LAYER = 'kingpins';

const styleUrlFor = (mode: StyleMode) =>
  mode === 'hybrid'
    ? 'mapbox://styles/mapbox/satellite-streets-v12'
    : 'mapbox://styles/mapbox/streets-v12';

// Try to load token from /data/token.txt first, then env
async function ensureMapboxToken(): Promise<string> {
  try {
    const res = await fetch(withBasePath('/data/token.txt'), { cache: 'no-store' });
    if (res.ok) {
      const t = (await res.text()).trim();
      if (t) {
        mapboxgl.accessToken = t;
        return t;
      }
    }
  } catch { /* ignore */ }
  const env = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
  if (!env) console.warn('Mapbox token missing. Set NEXT_PUBLIC_MAPBOX_TOKEN or /public/data/token.txt');
  mapboxgl.accessToken = env;
  return env;
}

// First data file found wins
const DATA_CANDIDATES = [
  '/data/main.geojson',
  '/data/main.json',
  '/data/retailers.geojson',
  '/data/retailers.json',
];

async function loadFirstData(): Promise<GeoJSON.FeatureCollection> {
  for (const p of DATA_CANDIDATES) {
    try {
      const res = await fetch(withBasePath(p), { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        if (json && json.type === 'FeatureCollection') return json as GeoJSON.FeatureCollection;
      }
    } catch { /* try next */ }
  }
  console.warn('No data FeatureCollection found under /public/data/.');
  return { type: 'FeatureCollection', features: [] };
}

// Mapbox expression to color points by `category`
function categoryColorExpression(): any {
  const entries: any[] = [];
  for (const [key, val] of Object.entries(CATEGORY_COLORS)) entries.push(key, val);
  return ['match', ['get', 'category'], ...entries, '#9ca3af'];
}

// “Kingpin” filter using common keys
const KINGPIN_FILTER: any = [
  'any',
  ['==', ['get', 'type'], 'Kingpin'],
  ['==', ['get', 'Type'], 'Kingpin'],
  ['==', ['get', 'kingpin'], true],
  ['==', ['get', 'Kingpin'], true],
  ['==', ['get', 'isKingpin'], true],
];

const CertisMap: React.FC<CertisMapProps> = ({ styleMode, categories, onAddStop }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);

  const [fc, setFc] = useState<GeoJSON.FeatureCollection>({ type: 'FeatureCollection', features: [] });

  const enabledCats = useMemo(() => {
    const on = Object.entries(categories).filter(([, v]) => !!v).map(([k]) => k);
    return new Set(on);
  }, [categories]);

  // Load token + data once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await ensureMapboxToken();
      const data = await loadFirstData();
      if (!cancelled) setFc(data);
    })();
    return () => { cancelled = true; };
  }, []);

  // Create map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: styleUrlFor(styleMode),
      projection: { name: 'mercator' as any },
      center: [-96.9, 38.5],
      zoom: 3.4,
      attributionControl: true,
    });
    mapRef.current = map;

    const wireLayers = () => {
      // Source
      if (!map.getSource(MAIN_SRC)) {
        map.addSource(MAIN_SRC, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
          cluster: true,
          clusterMaxZoom: 12,
          clusterRadius: 50,
        } as any);
      }

      // Clusters (light blue)
      if (!map.getLayer(CLUSTER_LAYER)) {
        map.addLayer({
          id: CLUSTER_LAYER,
          type: 'circle',
          source: MAIN_SRC,
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': '#9ad8ff',
            'circle-stroke-color': '#0d2231',
            'circle-stroke-width': 1.0,
            'circle-radius': [
              'step',
              ['get', 'point_count'],
              16, 50, 22, 150, 28,
            ],
          },
        });
      }

      // Cluster count
      if (!map.getLayer(CLUSTER_COUNT)) {
        map.addLayer({
          id: CLUSTER_COUNT,
          type: 'symbol',
          source: MAIN_SRC,
          filter: ['has', 'point_count'],
          layout: {
            'text-field': ['get', 'point_count'],
            'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
            'text-size': 12,
          },
          paint: { 'text-color': '#0d2231' },
        });
      }

      // Regular points
      if (!map.getLayer(MAIN_POINTS)) {
        map.addLayer({
          id: MAIN_POINTS,
          type: 'circle',
          source: MAIN_SRC,
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-color': categoryColorExpression(),
            'circle-radius': 6,
            'circle-stroke-width': 1.25,
            'circle-stroke-color': '#0d2231',
          },
        });
      }

      // Kingpins ABOVE everything
      if (!map.getLayer(KING_LAYER)) {
        map.addLayer({
          id: KING_LAYER,
          type: 'circle',
          source: MAIN_SRC,
          filter: ['all', ['!', ['has', 'point_count']], KINGPIN_FILTER],
          paint: {
            'circle-color': '#ef4444',
            'circle-radius': 8,
            'circle-stroke-width': 2.0,
            'circle-stroke-color': '#facc15',
          },
        });
      }

      // Hover popups
      const showPopup = (e: mapboxgl.MapMouseEvent) => {
        const f = e.features && e.features[0];
        if (!f) return;
        const p = (f.properties || {}) as Record<string, any>;
        const name = p.name || p.Name || p.Retailer || p['Retailer Name'] || p['Store'] || 'Location';
        const addr = p.address || p.Address || p['Address 1'] || p['Address'] || '';
        const cat  = p.category || p.Category || p.type || p.Type || '';

        const html = `
          <div style="min-width:220px;max-width:280px;font:12px/1.4 system-ui,Segoe UI,Arial,sans-serif;">
            <div style="font-weight:700;margin-bottom:2px;">${name}</div>
            <div style="opacity:.75;text-transform:capitalize">${cat || ''}</div>
            ${addr ? `<div style="margin-top:4px">${addr}</div>` : ''}
          </div>
        `;
        if (!popupRef.current) popupRef.current = new mapboxgl.Popup({ closeButton: false, closeOnClick: false });
        popupRef.current.setLngLat(e.lngLat as LngLat).setHTML(html).addTo(map);
      };
      const hidePopup = () => popupRef.current?.remove();

      map.on('mouseenter', MAIN_POINTS, () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', MAIN_POINTS, () => { map.getCanvas().style.cursor = ''; hidePopup(); });
      map.on('mousemove', MAIN_POINTS, showPopup);

      map.on('mouseenter', KING_LAYER, () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', KING_LAYER, () => { map.getCanvas().style.cursor = ''; hidePopup(); });
      map.on('mousemove', KING_LAYER, showPopup);

      // Cluster click => expand
      map.on('click', CLUSTER_LAYER, (e) => {
        const f = e.features && e.features[0];
        const clusterId = f?.properties?.cluster_id;
        const src = map.getSource(MAIN_SRC) as mapboxgl.GeoJSONSource | undefined;
        if (!src || clusterId == null) return;
        (src as any).getClusterExpansionZoom(clusterId, (_err: any, zoom: number) => {
          const center = (f!.geometry as any).coordinates as [number, number];
          map.easeTo({ center, zoom });
        });
      });

      // Point click => add stop
      const addFromFeature = (f?: mapboxgl.MapboxGeoJSONFeature) => {
        if (!f) return;
        const c = (f.geometry as any).coordinates as [number, number];
        const p = (f.properties || {}) as Record<string, any>;
        const name = p.name || p.Name || p.Retailer || p['Retailer Name'] || 'Stop';
        onAddStop?.({ name, coord: [c[0], c[1]] });
      };
      map.on('click', MAIN_POINTS, (e) => addFromFeature(e.features?.[0]));
      map.on('click', KING_LAYER, (e) => addFromFeature(e.features?.[0]));
    };

    map.once('style.load', () => {
      try { map.setProjection({ name: 'mercator' as any }); } catch {}
      wireLayers();
      map.resize();
    });

    return () => {
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, [styleMode, onAddStop]);

  // Style swaps (hybrid/street)
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    m.setStyle(styleUrlFor(styleMode));
    m.once('style.load', () => {
      try { m.setProjection({ name: 'mercator' as any }); } catch {}
    });
  }, [styleMode]);

  // Push filtered data into the source
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;

    if (!m.getSource(MAIN_SRC)) {
      try {
        m.addSource(MAIN_SRC, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
          cluster: true,
          clusterMaxZoom: 12,
          clusterRadius: 50,
        } as any);
      } catch {}
    }

    const feats = (fc.features || []).filter((f) => {
      const p = (f.properties || {}) as Record<string, any>;
      const cat = p.category || p.Category || p.type || p.Type;
      if (!cat) return true;
      return enabledCats.size === 0 || enabledCats.has(String(cat));
    });

    const filtered: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: feats };
    const src = m.getSource(MAIN_SRC) as mapboxgl.GeoJSONSource | undefined;
    src?.setData(filtered);

    // Ensure layers exist after any style swap
    if (!m.getLayer(CLUSTER_LAYER)) {
      m.addLayer({
        id: CLUSTER_LAYER,
        type: 'circle',
        source: MAIN_SRC,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#9ad8ff',
          'circle-stroke-color': '#0d2231',
          'circle-stroke-width': 1.0,
          'circle-radius': ['step', ['get', 'point_count'], 16, 50, 22, 150, 28],
        },
      });
    }
    if (!m.getLayer(CLUSTER_COUNT)) {
      m.addLayer({
        id: CLUSTER_COUNT,
        type: 'symbol',
        source: MAIN_SRC,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count'],
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 12,
        },
        paint: { 'text-color': '#0d2231' },
      });
    }
    if (!m.getLayer(MAIN_POINTS)) {
      m.addLayer({
        id: MAIN_POINTS,
        type: 'circle',
        source: MAIN_SRC,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': categoryColorExpression(),
          'circle-radius': 6,
          'circle-stroke-width': 1.25,
          'circle-stroke-color': '#0d2231',
        },
      });
    }
    if (!m.getLayer(KING_LAYER)) {
      m.addLayer({
        id: KING_LAYER,
        type: 'circle',
        source: MAIN_SRC,
        filter: ['all', ['!', ['has', 'point_count']], KINGPIN_FILTER],
        paint: {
          'circle-color': '#ef4444',
          'circle-radius': 8,
          'circle-stroke-width': 2.0,
          'circle-stroke-color': '#facc15',
        },
      });
    }
  }, [fc, enabledCats]);

  return (
    <div
      ref={containerRef}
      id="map"
      style={{ width: '100%', height: '100%', minHeight: '640px', borderRadius: '12px', overflow: 'hidden' }}
    />
  );
};

export default CertisMap;
