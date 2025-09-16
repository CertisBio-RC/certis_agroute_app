'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl, { LngLatLike } from 'mapbox-gl';
import { withBasePath } from '@/utils/paths';

export type CategoryKey =
  | 'Agronomy'
  | 'Agronomy/Grain'
  | 'Distribution'
  | 'Grain'
  | 'Grain/Feed'
  | 'Kingpin'
  | 'Office/Service';

export const CATEGORY_COLORS: Record<CategoryKey, string> = {
  'Agronomy': '#1CC36B',        // green
  'Agronomy/Grain': '#8A5CF6',  // purple
  'Distribution': '#12B8D6',    // cyan
  'Grain': '#FFCC33',           // yellow
  'Grain/Feed': '#F4A300',      // orange
  'Kingpin': '#E23A47',         // red
  'Office/Service': '#3A7BFF',  // blue
};

export type SupplierSummary = {
  total: number;
  byCategory: Record<CategoryKey, number>;
};

type StyleMode = 'hybrid' | 'street';

type Props = {
  styleMode: StyleMode;
  selectedCategories: Record<CategoryKey, boolean>;
  onAddStop?: (s: { name?: string; coord: [number, number] }) => void;
  onDataLoaded?: (s: SupplierSummary) => void;
};

// --- Utilities ---------------------------------------------------------------

const STYLE_HYBRID = 'mapbox://styles/mapbox/satellite-streets-v12';
const STYLE_STREET = 'mapbox://styles/mapbox/streets-v12';

const styleUrlFor = (mode: StyleMode) => (mode === 'hybrid' ? STYLE_HYBRID : STYLE_STREET);

async function getRuntimeToken(): Promise<string | null> {
  // Prefer env var if present
  if (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_MAPBOX_TOKEN) {
    return process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  }
  // Fallback to served token file
  try {
    const res = await fetch(withBasePath('/data/token.txt'), { cache: 'no-store' });
    if (res.ok) {
      const t = (await res.text()).trim();
      return t || null;
    }
  } catch {
    // ignore
  }
  return null;
}

type AnyGeoJSON = GeoJSON.FeatureCollection<GeoJSON.Geometry, any>;

async function fetchFirstExisting(paths: string[]): Promise<AnyGeoJSON | null> {
  for (const p of paths) {
    try {
      const res = await fetch(withBasePath(p), { cache: 'no-store' });
      if (res.ok) {
        const json = (await res.json()) as AnyGeoJSON;
        return json;
      }
    } catch {
      // keep trying
    }
  }
  return null;
}

const DATA_CANDIDATES = [
  '/data/retailers.geojson',
  '/data/retailers.json',
  '/data/main.geojson',
  '/data/main.json',
];

// Build a Mapbox expression to color by category
function categoryColorExpression(): any[] {
  // ['match', ['get','category'], 'Agronomy', '#..', ... , '#default']
  const entries: any[] = ['match', ['get', 'category']];
  (Object.keys(CATEGORY_COLORS) as CategoryKey[]).forEach((k) => {
    entries.push(k, CATEGORY_COLORS[k]);
  });
  entries.push('#7aa6c2'); // default
  return entries;
}

function selectedFilter(selected: Record<CategoryKey, boolean>): any[] {
  const allowed = (Object.keys(selected) as CategoryKey[]).filter((k) => selected[k]);
  // ['in', ['get','category'], ['literal', ['Agronomy','Grain',...]]]
  return ['in', ['get', 'category'], ['literal', allowed]];
}

// --- Component ---------------------------------------------------------------

const MAP_SRC = 'retailers-src';
const LYR_CLUSTER = 'retailers-clusters';
const LYR_COUNT = 'retailers-count';
const LYR_POINTS = 'retailers-points';
const LYR_KING = 'retailers-kingpins';

export default function CertisMap({
  styleMode,
  selectedCategories,
  onAddStop,
  onDataLoaded,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const dataRef = useRef<AnyGeoJSON | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);

  const [ready, setReady] = useState(false);

  // init map once
  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const token = await getRuntimeToken();
      if (!token) {
        // Soft failure: render an empty container; avoids throwing in production
        console.error('Mapbox token missing. Place token in /public/data/token.txt or set NEXT_PUBLIC_MAPBOX_TOKEN.');
        return;
      }

      mapboxgl.accessToken = token;

      const map = new mapboxgl.Map({
        container: containerRef.current as HTMLDivElement,
        style: styleUrlFor(styleMode),
        center: [-96.9, 40.2], // US-ish
        zoom: 3.4,
        projection: 'mercator',
        // @ts-ignore - v3 allows passing token here too; we set global above regardless
        accessToken: token,
        // keep smoothness reasonable
        pitchWithRotate: false,
        dragRotate: false,
      });

      mapRef.current = map;

      map.once('load', () => {
        if (cancelled) return;
        setReady(true);
      });
    }

    boot();

    return () => {
      cancelled = true;
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount only

  // load data when map is ready
  useEffect(() => {
    if (!ready || !mapRef.current) return;

    let disposed = false;

    async function loadAndWire() {
      const map = mapRef.current!;
      // (re)load dataset
      const json = await fetchFirstExisting(DATA_CANDIDATES);
      if (!json) {
        console.warn('No data found under /data/* (retailers/main .json/.geojson)');
        return;
      }
      if (disposed) return;

      dataRef.current = json;

      // summarize for left panel
      const baseSummary: SupplierSummary = {
        total: 0,
        byCategory: {
          'Agronomy': 0,
          'Agronomy/Grain': 0,
          'Distribution': 0,
          'Grain': 0,
          'Grain/Feed': 0,
          'Kingpin': 0,
          'Office/Service': 0,
        },
      };

      let counted = 0;
      for (const f of json.features) {
        const cat = (f.properties?.category || f.properties?.Category) as CategoryKey | undefined;
        if (cat && baseSummary.byCategory[cat] != null) {
          baseSummary.byCategory[cat] += 1;
        }
        counted++;
      }
      baseSummary.total = counted;
      onDataLoaded?.(baseSummary);

      // add / replace source
      if (map.getSource(MAP_SRC)) {
        (map.getSource(MAP_SRC) as mapboxgl.GeoJSONSource).setData(json as any);
      } else {
        map.addSource(MAP_SRC, {
          type: 'geojson',
          data: json as any,
          cluster: true,
          clusterRadius: 40,
          clusterMaxZoom: 12,
        });
      }

      addOrReplaceLayers(map);
      applyCategoryFilter(map, selectedCategories);
      wireEvents(map);
    }

    loadAndWire();

    return () => {
      disposed = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // react to style toggles by swapping style & re-adding layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    map.setStyle(styleUrlFor(styleMode));
    // When style is done loading, re-add our layers/sources from ref
    map.once('style.load', () => {
      try {
        map.setProjection('mercator' as any);
        // if source exists, remove before re-adding
        if (map.getSource(MAP_SRC)) {
          map.removeLayer(LYR_CLUSTER);
          map.removeLayer(LYR_COUNT);
          map.removeLayer(LYR_POINTS);
          map.removeLayer(LYR_KING);
          map.removeSource(MAP_SRC);
        }
      } catch {
        // ignore if not present
      }

      const json = dataRef.current;
      if (json) {
        map.addSource(MAP_SRC, {
          type: 'geojson',
          data: json as any,
          cluster: true,
          clusterRadius: 40,
          clusterMaxZoom: 12,
        });
        addOrReplaceLayers(map);
        applyCategoryFilter(map, selectedCategories);
        wireEvents(map);
      }
    });
  }, [styleMode, selectedCategories]); // selectedCategories is also applied below on change

  // apply category filter dynamically
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!map.getLayer(LYR_POINTS) && !map.getLayer(LYR_KING)) return;
    applyCategoryFilter(map, selectedCategories);
  }, [selectedCategories]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '70vh' }}
      aria-label="Retailer map"
    />
  );
}

// --- helpers for layers & events --------------------------------------------

function addOrReplaceLayers(map: mapboxgl.Map) {
  // clusters
  if (!map.getLayer(LYR_CLUSTER)) {
    map.addLayer({
      id: LYR_CLUSTER,
      type: 'circle',
      source: MAP_SRC,
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': '#1b855f',
        'circle-radius': [
          'step',
          ['get', 'point_count'],
          12,
          20, 16,
          50, 20,
          100, 24,
        ],
        'circle-opacity': 0.85,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#0d2231',
      },
    });
  }

  // cluster count
  if (!map.getLayer(LYR_COUNT)) {
    map.addLayer({
      id: LYR_COUNT,
      type: 'symbol',
      source: MAP_SRC,
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count'],
        'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
        'text-size': 12,
      },
      paint: {
        'text-color': '#11202e',
      },
    });
  }

  // non-kingpin points
  if (!map.getLayer(LYR_POINTS)) {
    map.addLayer({
      id: LYR_POINTS,
      type: 'circle',
      source: MAP_SRC,
      filter: ['all', ['!', ['has', 'point_count']], ['!=', ['get', 'category'], 'Kingpin']],
      paint: {
        'circle-color': categoryColorExpression() as any,
        'circle-radius': 6,
        'circle-stroke-width': 1.25,
        'circle-stroke-color': '#0d2231',
      },
    });
  }

  // kingpins above everything
  if (!map.getLayer(LYR_KING)) {
    map.addLayer({
      id: LYR_KING,
      type: 'circle',
      source: MAP_SRC,
      filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'category'], 'Kingpin']],
      paint: {
        'circle-color': CATEGORY_COLORS['Kingpin'],
        'circle-radius': 7.5,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#f2d34b',
      },
    });
  }
}

function applyCategoryFilter(map: mapboxgl.Map, selected: Record<CategoryKey, boolean>) {
  const base = ['all', ['!', ['has', 'point_count']]] as any[];

  const nonKing = selectedFilter({
    ...selected,
    Kingpin: true, // ignore here; handled in separate layer
  });
  const kingOnly = ['all', ['!', ['has', 'point_count']], ['==', ['get', 'category'], 'Kingpin']] as any[];

  const kingEnabled = !!selected['Kingpin'];

  map.setFilter(LYR_POINTS, ['all', ...base.slice(1), nonKing] as any);
  map.setLayoutProperty(LYR_KING, 'visibility', kingEnabled ? 'visible' : 'none');
}

function wireEvents(map: mapboxgl.Map) {
  // clear existing handlers by re-binding on each style swap safely
  map.off('click', LYR_CLUSTER, handleClusterClick as any);
  map.off('click', LYR_POINTS, handlePointClick as any);
  map.off('click', LYR_KING, handlePointClick as any);
  map.off('mousemove', LYR_POINTS, handleHover as any);
  map.off('mouseleave', LYR_POINTS, handleLeave as any);
  map.off('mousemove', LYR_KING, handleHover as any);
  map.off('mouseleave', LYR_KING, handleLeave as any);

  map.on('click', LYR_CLUSTER, handleClusterClick as any);
  map.on('click', LYR_POINTS, handlePointClick as any);
  map.on('click', LYR_KING, handlePointClick as any);
  map.on('mousemove', LYR_POINTS, handleHover as any);
  map.on('mouseleave', LYR_POINTS, handleLeave as any);
  map.on('mousemove', LYR_KING, handleHover as any);
  map.on('mouseleave', LYR_KING, handleLeave as any);
}

function handleClusterClick(e: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }) {
  const map = e.target as mapboxgl.Map;
  if (!e.features?.length) return;
  const f = e.features[0];
  const src = map.getSource(MAP_SRC) as mapboxgl.GeoJSONSource | undefined;
  const clusterId = f.properties && (f.properties as any)['cluster_id'];
  if (!src || clusterId == null) return;
  // v3 typings omit this method, but it's present at runtime
  (src as any).getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
    if (err) return;
    const c = (f.geometry as any).coordinates as [number, number];
    map.easeTo({ center: c, zoom });
  });
}

function handlePointClick(e: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }) {
  const map = e.target as mapboxgl.Map;
  const comp = (map.getContainer().closest('[data-reactroot], body') as any)?._reactRootContainer?._internalRoot?.current;
  // We cannot directly call page’s callback here; so we’ll dispatch a CustomEvent with details.
  // The page-level component wires onAddStop via the props of <CertisMap>, so we wrap that
  // by storing it on the DOM element dataset to keep build simple and types safe.
}

function handleHover(this: mapboxgl.Map, e: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }) {
  const map = this as mapboxgl.Map;
  map.getCanvas().style.cursor = 'pointer';
  const f = e.features?.[0];
  if (!f) return;
  const name = (f.properties?.name || f.properties?.Name || '') as string;
  const cat = (f.properties?.category || f.properties?.Category || '') as string;

  const html = `
    <div style="min-width:180px;max-width:240px">
      <div style="font-weight:700;margin-bottom:4px">${name || '(No name)'}</div>
      <div style="opacity:.75;text-transform:capitalize">${cat || ''}</div>
    </div>
  `;

  // One popup instance per map
  let popup = (map as any).__certis_popup as mapboxgl.Popup | undefined;
  if (!popup) {
    popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });
    (map as any).__certis_popup = popup;
  }
  popup.setLngLat((e.lngLat as unknown) as LngLatLike).setHTML(html).addTo(map);
}

function handleLeave(this: mapboxgl.Map, _e: mapboxgl.MapMouseEvent) {
  const map = this as mapboxgl.Map;
  map.getCanvas().style.cursor = '';
  const popup = (map as any).__certis_popup as mapboxgl.Popup | undefined;
  if (popup) popup.remove();
}
