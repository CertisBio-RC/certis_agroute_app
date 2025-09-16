'use client';

import * as React from 'react';
import mapboxgl from 'mapbox-gl';
import { withBasePath } from '@/utils/paths';

export type StyleMode = 'hybrid' | 'street';

// Shared palette (map + UI)
export const CATEGORY_COLORS: Record<string, string> = {
  Agronomy: '#22c55e',         // green
  'Agronomy/Grain': '#a855f7', // purple
  Distribution: '#0ea5e9',     // light blue (readable)
  Grain: '#eab308',            // amber
  'Grain/Feed': '#b45309',     // brown
  'Office/Service': '#3b82f6', // blue
  Kingpin: '#ef4444',          // red (special)
};
export const CATEGORY_COLOR = (c: string) => CATEGORY_COLORS[c] ?? '#9ca3af';

type Stop = { name?: string; coord: [number, number] };

export interface CertisMapProps {
  styleMode: StyleMode;
  categories: Record<string, boolean>;
  onAddStop?: (s: Stop) => void; // optional: click to add
}

const MAIN_SRC = 'main-src';
const KING_SRC = 'king-src';
const CLUSTER_LAYER = 'main-clusters';
const CLUSTER_COUNT = 'main-count';
const UNCLUSTERED = 'main-unclustered';
const KING_LAYER = 'kingpins';

const styleUrl = (mode: StyleMode) =>
  mode === 'hybrid'
    ? 'mapbox://styles/mapbox/satellite-streets-v12'
    : 'mapbox://styles/mapbox/streets-v12';

async function loadToken(): Promise<string | null> {
  // 1) runtime file
  try {
    const r = await fetch(withBasePath('/data/token.txt'), { cache: 'no-store' });
    if (r.ok) {
      const t = (await r.text()).trim();
      if (t) return t;
    }
  } catch {}
  // 2) env fallback
  // @ts-ignore injected at build
  if (process.env.NEXT_PUBLIC_MAPBOX_TOKEN) {
    // @ts-ignore
    return process.env.NEXT_PUBLIC_MAPBOX_TOKEN as string;
  }
  return null;
}

type FC = GeoJSON.FeatureCollection<GeoJSON.Geometry, { [k: string]: any }>;

async function fetchFirst(paths: string[]): Promise<FC | null> {
  for (const p of paths) {
    try {
      const r = await fetch(withBasePath(p), { cache: 'no-store' });
      if (!r.ok) continue;
      const j = await r.json();
      if (j && j.type === 'FeatureCollection') return j as FC;
    } catch {}
  }
  return null;
}

function splitKingpins(fc: FC): { main: FC; king: FC } {
  const main: GeoJSON.Feature[] = [];
  const king: GeoJSON.Feature[] = [];
  for (const f of fc.features ?? []) {
    const p = (f.properties ?? {}) as any;
    const isK =
      p.Type === 'Kingpin' ||
      p.type === 'Kingpin' ||
      p.kingpin === true ||
      p.kingpin === 'true' ||
      p.kingpin === 1 ||
      p.category === 'Kingpin';
    (isK ? king : main).push(f);
  }
  return {
    main: { type: 'FeatureCollection', features: main },
    king: { type: 'FeatureCollection', features: king },
  };
}

function computeFilter(categories: Record<string, boolean>): any {
  const selected = Object.entries(categories)
    .filter(([, v]) => v)
    .map(([k]) => k);

  if (selected.length === 0) {
    // show none (still allow clusters)
    return ['all', ['!', ['has', 'point_count']], ['literal', false]];
  }

  const lit = ['literal', selected] as any;
  const inCat = ['in', ['get', 'Category'], lit];
  const inType = ['in', ['get', 'Type'], lit];
  const inRetailerType = ['in', ['get', 'Retailer Type'], lit];

  return ['all', ['!', ['has', 'point_count']], ['any', inCat, inType, inRetailerType]];
}

function colorExpression(): any {
  const catKey = ['coalesce', ['get', 'Category'], ['get', 'Type'], ['get', 'Retailer Type']];
  const pairs: any[] = [];
  for (const [k, v] of Object.entries(CATEGORY_COLORS)) {
    if (k === 'Kingpin') continue;
    pairs.push(k, v);
  }
  return ['match', catKey, ...pairs, '#9ca3af'];
}

const CertisMap: React.FC<CertisMapProps> = ({ styleMode, categories, onAddStop }) => {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<mapboxgl.Map | null>(null);
  const mainRef = React.useRef<FC | null>(null);
  const kingRef = React.useRef<FC | null>(null);

  // boot map once
  React.useEffect(() => {
    let disposed = false;

    (async () => {
      const token = await loadToken();
      if (!token) {
        console.error('Mapbox token missing. Put one in /public/data/token.txt');
        return;
      }
      mapboxgl.accessToken = token;

      const map = new mapboxgl.Map({
        container: containerRef.current!,
        style: styleUrl(styleMode),
        center: [-95, 38],
        zoom: 3,
        attributionControl: false,
        preserveDrawingBuffer: false,
      });
      mapRef.current = map;

      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
      map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right');

      const onLoad = async () => {
        if (disposed) return;

        try {
          map.setProjection({ name: 'mercator' as any });

          // data: first good file wins
          let fc = await fetchFirst([
            '/data/main.geojson',
            '/data/main.json',
            '/data/retailers.geojson',
            '/data/retailers.json',
          ]);
          if (!fc) {
            console.warn('No /public/data file found (main|retailers .geojson/.json)');
            fc = { type: 'FeatureCollection', features: [] } as FC;
          }
          const { main, king } = splitKingpins(fc);
          mainRef.current = main;
          kingRef.current = king;

          // sources
          map.addSource(MAIN_SRC, {
            type: 'geojson',
            data: main,
            cluster: true,
            clusterMaxZoom: 12,
            clusterRadius: 50,
          } as mapboxgl.GeoJSONSourceRaw);

          map.addSource(KING_SRC, {
            type: 'geojson',
            data: king,
          } as mapboxgl.GeoJSONSourceRaw);

          // layers (clusters -> unclustered -> kingpins on top)
          map.addLayer({
            id: CLUSTER_LAYER,
            type: 'circle',
            source: MAIN_SRC,
            filter: ['has', 'point_count'],
            paint: {
              'circle-color': '#7cc8ff',
              'circle-radius': ['step', ['get', 'point_count'], 16, 50, 20, 100, 26],
              'circle-stroke-color': '#2563eb',
              'circle-stroke-width': 1.25,
              'circle-opacity': 0.9,
            } as any,
          });

          map.addLayer({
            id: CLUSTER_COUNT,
            type: 'symbol',
            source: MAIN_SRC,
            filter: ['has', 'point_count'],
            layout: {
              'text-field': ['get', 'point_count'],
              'text-size': 12,
              'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
            },
            paint: { 'text-color': '#0b1f33' },
          });

          map.addLayer({
            id: UNCLUSTERED,
            type: 'circle',
            source: MAIN_SRC,
            filter: ['all', ['!', ['has', 'point_count']]],
            paint: {
              'circle-color': colorExpression(),
              'circle-radius': 6,
              'circle-stroke-width': 1.25,
              'circle-stroke-color': '#0d2231',
            } as any,
          });

          map.addLayer({
            id: KING_LAYER,
            type: 'circle',
            source: KING_SRC,
            paint: {
              'circle-color': CATEGORY_COLORS.Kingpin,
              'circle-radius': 8,
              'circle-stroke-width': 2,
              'circle-stroke-color': '#facc15',
            },
          });

          // interactions
          const popup = new mapboxgl.Popup({
            closeButton: false,
            closeOnClick: false,
            anchor: 'top',
            offset: [0, 10],
          });

          const propsName = (p: any) =>
            p?.name || p?.Name || p?.Retailer || p?.RetailerName || 'Location';
          const propsCat = (p: any) =>
            p?.Category ?? p?.Type ?? p?.['Retailer Type'] ?? undefined;
          const propsAddr = (p: any) => p?.Address ?? p?.address ?? p?.City ?? undefined;

          const showPopup = (e: mapboxgl.MapMouseEvent) => {
            const feats = map.queryRenderedFeatures(e.point, { layers: [KING_LAYER, UNCLUSTERED] });
            if (!feats.length) {
              popup.remove();
              return;
            }
            const f = feats[0] as any;
            const p = f.properties || {};
            const html =
              `<div style="min-width:220px;max-width:260px;padding:6px 8px">` +
              `<div style="font-weight:600">${propsName(p)}</div>` +
              (propsCat(p) ? `<div style="opacity:.75">${propsCat(p)}</div>` : '') +
              (propsAddr(p) ? `<div style="opacity:.75">${propsAddr(p)}</div>` : '') +
              `</div>`;
            popup.setLngLat(e.lngLat).setHTML(html).addTo(map);
          };

          map.on('mousemove', UNCLUSTERED, showPopup);
          map.on('mousemove', KING_LAYER, showPopup);
          map.on('mouseleave', UNCLUSTERED, () => popup.remove());
          map.on('mouseleave', KING_LAYER, () => popup.remove());

          map.on('click', CLUSTER_LAYER, (e) => {
            const f = map.queryRenderedFeatures(e.point, { layers: [CLUSTER_LAYER] })[0] as any;
            const clusterId = f?.properties?.cluster_id;
            const src = map.getSource(MAIN_SRC) as mapboxgl.GeoJSONSource | undefined;
            if (!src || clusterId == null) return;
            // @ts-ignore (present on GeoJSONSource in v3)
            src.getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
              if (err) return;
              map.easeTo({ center: (f.geometry as any).coordinates as [number, number], zoom });
            });
          });

          map.on('click', UNCLUSTERED, (e) => {
            const feat = map.queryRenderedFeatures(e.point, { layers: [UNCLUSTERED] })[0] as any;
            if (!feat) return;
            const p = feat.properties || {};
            const name = propsName(p);
            const coord = (feat.geometry?.coordinates || []) as [number, number];
            onAddStop?.({ name, coord });
          });

          map.on('click', KING_LAYER, (e) => {
            const feat = map.queryRenderedFeatures(e.point, { layers: [KING_LAYER] })[0] as any;
            if (!feat) return;
            const p = feat.properties || {};
            const name = propsName(p);
            const coord = (feat.geometry?.coordinates || []) as [number, number];
            onAddStop?.({ name, coord });
          });
        } catch (err) {
          console.error(err);
        }
      };

      map.on('load', onLoad);

      return () => {
        disposed = true;
        map.remove();
        mapRef.current = null;
      };
    })();
  }, []); // mount once

  // change style (preserve mercator + sources/layers)
  React.useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const next = styleUrl(styleMode);
    m.setStyle(next);
    m.once('style.load', () => {
      try {
        m.setProjection({ name: 'mercator' as any });

        // sources
        if (!m.getSource(MAIN_SRC)) {
          m.addSource(MAIN_SRC, {
            type: 'geojson',
            data: mainRef.current ?? { type: 'FeatureCollection', features: [] },
            cluster: true,
            clusterMaxZoom: 12,
            clusterRadius: 50,
          } as mapboxgl.GeoJSONSourceRaw);
        } else {
          (m.getSource(MAIN_SRC) as mapboxgl.GeoJSONSource).setData(
            (mainRef.current as any) ?? { type: 'FeatureCollection', features: [] }
          );
        }

        if (!m.getSource(KING_SRC)) {
          m.addSource(KING_SRC, {
            type: 'geojson',
            data: kingRef.current ?? { type: 'FeatureCollection', features: [] },
          } as mapboxgl.GeoJSONSourceRaw);
        } else {
          (m.getSource(KING_SRC) as mapboxgl.GeoJSONSource).setData(
            (kingRef.current as any) ?? { type: 'FeatureCollection', features: [] }
          );
        }

        // layers
        if (!m.getLayer(CLUSTER_LAYER)) {
          m.addLayer({
            id: CLUSTER_LAYER,
            type: 'circle',
            source: MAIN_SRC,
            filter: ['has', 'point_count'],
            paint: {
              'circle-color': '#7cc8ff',
              'circle-radius': ['step', ['get', 'point_count'], 16, 50, 20, 100, 26],
              'circle-stroke-color': '#2563eb',
              'circle-stroke-width': 1.25,
              'circle-opacity': 0.9,
            } as any,
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
              'text-size': 12,
              'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
            },
            paint: { 'text-color': '#0b1f33' },
          });
        }
        if (!m.getLayer(UNCLUSTERED)) {
          m.addLayer({
            id: UNCLUSTERED,
            type: 'circle',
            source: MAIN_SRC,
            filter: ['all', ['!', ['has', 'point_count']]],
            paint: {
              'circle-color': colorExpression(),
              'circle-radius': 6,
              'circle-stroke-width': 1.25,
              'circle-stroke-color': '#0d2231',
            } as any,
          });
        }
        if (!m.getLayer(KING_LAYER)) {
          m.addLayer({
            id: KING_LAYER,
            type: 'circle',
            source: KING_SRC,
            paint: {
              'circle-color': CATEGORY_COLORS.Kingpin,
              'circle-radius': 8,
              'circle-stroke-width': 2,
              'circle-stroke-color': '#facc15',
            },
          });
        }

        // reapply category filter
        const f = computeFilter(categories);
        m.setFilter(UNCLUSTERED, f as any);
      } catch (e) {
        console.error(e);
      }
    });
  }, [styleMode, categories]);

  // category-only changes
  React.useEffect(() => {
    const m = mapRef.current;
    if (!m || !m.getLayer(UNCLUSTERED)) return;
    m.setFilter(UNCLUSTERED, computeFilter(categories) as any);
  }, [categories]);

  return <div ref={containerRef} id="certis-map" style={{ width: '100%', height: '100%' }} />;
};

export default CertisMap;
